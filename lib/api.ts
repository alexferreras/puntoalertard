// Utilidades compartidas por los route handlers: envolturas de respuesta,
// validación y control de abuso (RNF-11).

import { z } from 'zod'

import { isInDemoArea } from './geo'
import { CATEGORIES, STATUSES } from './types'
import { WEATHER_SCENARIOS } from './weather-shared'

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UPSTREAM_TIMEOUT: 504,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return Response.json(
    { error: { code, message, fieldErrors: fieldErrors ?? null, requestId: crypto.randomUUID() } },
    { status: STATUS_BY_CODE[code] },
  )
}

export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}

/** Envuelve un handler para que ningún fallo inesperado devuelva un stack al cliente. */
export function handler<Ctx = unknown>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx)
    } catch (err) {
      console.error('[api] error no manejado:', err)
      return apiError('INTERNAL_ERROR', 'Ocurrió un error procesando la solicitud.')
    }
  }
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export const latSchema = z.coerce.number().min(-90).max(90)
export const lngSchema = z.coerce.number().min(-180).max(180)

/**
 * `FormData.get` devuelve `null` para campos ausentes y `z.coerce.number()`
 * convertiría ese `null` en 0: un reporte sin GPS acabaría en el golfo de
 * Guinea. Se normaliza a `undefined` para que la validación falle de verdad.
 */
export function formField(form: FormData, name: string): string | undefined {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
export const categorySchema = z.enum(CATEGORIES)
export const statusSchema = z.enum(STATUSES)
export const scenarioSchema = z.enum(WEATHER_SCENARIOS).default('real')

export const pointSchema = z.object({ lat: latSchema, lng: lngSchema })

/** Punto que además debe caer dentro del área cubierta por el MVP. */
export const demoPointSchema = pointSchema.refine(isInDemoArea, {
  message: 'El punto está fuera del área cubierta por el MVP (Gran Santo Domingo).',
})

/** Límites de la evidencia: el servidor repite toda validación del cliente. */
export { ALLOWED_PHOTO_MIME, MAX_DESCRIPTION_CHARS, MAX_PHOTO_BYTES } from './limits'

// ---------------------------------------------------------------------------
// Rate limit en memoria (suficiente para el MVP; en producción, Redis)
// ---------------------------------------------------------------------------

const WINDOW_MS = 10 * 60 * 1000
const MAX_REPORTS_PER_WINDOW = 8

const hits = new Map<string, number[]>()

export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'local'
}

/** Devuelve `true` si la petición debe rechazarse por exceso de reportes. */
export function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_REPORTS_PER_WINDOW) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)
  return false
}
