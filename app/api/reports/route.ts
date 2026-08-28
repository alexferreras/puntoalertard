// POST /api/reports  — crear reporte ciudadano (RF-01..RF-07, RF-09)
// GET  /api/reports  — listado crudo, usado por el dashboard

import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  ALLOWED_PHOTO_MIME,
  MAX_DESCRIPTION_CHARS,
  MAX_PHOTO_BYTES,
  apiError,
  categorySchema,
  clientKey,
  fieldErrorsOf,
  formField,
  handler,
  isRateLimited,
  latSchema,
  lngSchema,
  scenarioSchema,
  statusSchema,
} from '@/lib/api'
import {
  insertReport,
  insertRiskSnapshot,
  listInstitutions,
  listReports,
  previousZoneLevel,
  reportsWithinRadius,
} from '@/lib/db'
import { mostSpecific } from '@/lib/institutions'
import { hashSessionId } from '@/lib/sessions'
import { createToken } from '@/lib/tokens'
import { ATTACH_THRESHOLD, evaluateDuplicates } from '@/lib/duplicates'
import { ZONE_RADIUS_METERS, isInDemoArea, parseBounds, zoneKeyFor } from '@/lib/geo'
import { crossedUpward } from '@/lib/notifications'
import { contextFor, dispatchNotifications, eventForNewReport } from '@/lib/notify'
import { computeRisk } from '@/lib/risk'
import { toPublicIncidents } from '@/lib/public'
import type { RiskLevel } from '@/lib/types'
import { savePhoto } from '@/lib/storage'
import { LOW_CONFIDENCE, classify } from '@/lib/vision'
import { ensureSeeded } from '@/lib/seed'
import { getWeather } from '@/lib/weather'

/**
 * §19 — `capturedAt` es cuándo se vio el problema, no cuándo llegó el reporte.
 * Se admite hasta 10 min en el futuro (relojes desajustados) y hasta 24 h en el
 * pasado: una foto de la semana pasada no describe la situación de ahora.
 */
const CAPTURED_MAX_FUTURE_MS = 10 * 60 * 1000
const CAPTURED_MAX_AGE_MS = 24 * 60 * 60 * 1000

const createSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  capturedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .refine(
      (value) => {
        if (!value) return true
        const delta = Date.now() - new Date(value).getTime()
        return delta >= -CAPTURED_MAX_FUTURE_MS && delta <= CAPTURED_MAX_AGE_MS
      },
      { message: 'La fecha de captura debe estar entre las últimas 24 h y los próximos 10 min.' },
    ),
  /** UUID de sesión anónima: se hashea antes de persistir (§8, §19). */
  anonymousSessionId: z.string().uuid().optional(),
  description: z.string().trim().max(MAX_DESCRIPTION_CHARS).optional(),
  /** Corrección explícita del ciudadano (RF-07). Si falta, manda la IA. */
  category: categorySchema.optional(),
  scenario: scenarioSchema,
})

export const POST = handler(async (req: Request) => {
  if (isRateLimited(clientKey(req))) {
    return apiError('RATE_LIMITED', 'Demasiados reportes en poco tiempo. Intenta de nuevo en unos minutos.')
  }

  const form = await req.formData().catch(() => null)
  if (!form) return apiError('VALIDATION_ERROR', 'Se esperaba un formulario multipart/form-data.')

  const parsed = createSchema.safeParse({
    lat: formField(form, 'lat'),
    lng: formField(form, 'lng'),
    capturedAt: formField(form, 'capturedAt'),
    anonymousSessionId: formField(form, 'anonymousSessionId'),
    description: formField(form, 'description'),
    category: formField(form, 'category'),
    scenario: formField(form, 'scenario'),
  })
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Revisa los datos del reporte.', fieldErrorsOf(parsed.error))
  }
  const { lat, lng, capturedAt, anonymousSessionId, description, category: userCategory, scenario } =
    parsed.data
  if (!isInDemoArea({ lat, lng })) {
    return apiError('VALIDATION_ERROR', 'El punto está fuera del área cubierta por el MVP (Gran Santo Domingo).', {
      lat: ['Fuera del área de demostración'],
    })
  }

  // Evidencia opcional: sin foto el reporte sigue siendo válido, pero la
  // clasificación se apoya solo en el texto y baja la confianza.
  const photo = form.get('photo')
  let photoBytes: Buffer | null = null
  let photoMime: string | null = null
  if (photo instanceof File && photo.size > 0) {
    if (!(ALLOWED_PHOTO_MIME as readonly string[]).includes(photo.type)) {
      return apiError('VALIDATION_ERROR', 'Formato de imagen no admitido. Usa JPG, PNG o WebP.', {
        photo: ['Formato no admitido'],
      })
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return apiError('VALIDATION_ERROR', 'La imagen supera los 8 MB.', { photo: ['Archivo muy grande'] })
    }
    photoBytes = Buffer.from(await photo.arrayBuffer())
    photoMime = photo.type
  }
  // §11 — el hash detecta la misma fotografía enviada dos veces.
  const photoSha256 = photoBytes ? createHash('sha256').update(photoBytes).digest('hex') : null

  const classification = await classify({
    imageBase64: photoBytes?.toString('base64') ?? null,
    mimeType: photoMime,
    description: description ?? null,
    filename: photo instanceof File ? photo.name : null,
  })

  const category = userCategory ?? classification.category

  // §6 del doc 01 y §22.3: si la IA falló o dudó, el reporte entra igual pero
  // marcado para revisión humana. Nunca se bloquea al ciudadano por eso.
  // §11 — se evalúa antes de insertar: la decisión afecta el estado inicial.
  const duplicates = evaluateDuplicates({ point: { lat, lng }, category, photoSha256 })
  // El nivel anterior de la zona se lee antes de insertar, para detectar el cruce.
  const levelBefore = previousZoneLevel(zoneKeyFor({ lat, lng })) as RiskLevel | null

  const needsReview =
    !userCategory &&
    (classification.engine.endsWith('-fallback') || classification.confidence < LOW_CONFIDENCE)
  // RF-20 — si alguna institución tiene jurisdicción sobre el punto y la
  // categoría, el reporte nace derivado a la más específica.
  const assignedInstitution = mostSpecific(listInstitutions(), {
    zoneKey: zoneKeyFor({ lat, lng }),
    category,
  })

  const status =
    duplicates.decision === 'adjuntar'
      ? 'duplicado'
      : needsReview
        ? 'en_revision'
        : assignedInstitution
          ? 'derivado'
          : 'reportado'
  const id = crypto.randomUUID()
  const photoPath = photoBytes && photoMime ? await savePhoto(id, photoMime, photoBytes) : null

  const report = insertReport({
    id,
    // La línea de tiempo refleja cuándo se vio el problema (RF-04).
    createdAt: capturedAt,
    lat,
    lng,
    category,
    severity: classification.severity,
    description: description ?? null,
    photoPath,
    // Solo el seed marca vías principales: un reporte ciudadano no lo decide.
    mainRoad: false,
    photoSha256,
    // El identificador de sesión nunca se guarda en claro.
    sessionHash: anonymousSessionId ? hashSessionId(anonymousSessionId) : null,
    assignedInstitutionId: assignedInstitution?.id ?? null,
    duplicateOf: duplicates.best && duplicates.decision !== 'nuevo' ? duplicates.best.reportId : null,
    duplicateScore: duplicates.best && duplicates.decision !== 'nuevo' ? duplicates.best.score : null,
    aiCategory: classification.category,
    aiConfidence: classification.confidence,
    aiSignals: classification.signals,
    aiRationale: classification.rationale,
    aiEngine: classification.engine,
    confirmedByUser: Boolean(userCategory),
    status,
  })

  // Riesgo recalculado ya con el nuevo reporte dentro (RF-10, RF-12).
  const zoneKey = zoneKeyFor({ lat, lng })
  const weather = await getWeather({ lat, lng }, scenario)
  const risk = computeRisk({
    zoneKey,
    reports: reportsWithinRadius({ lat, lng }, ZONE_RADIUS_METERS),
    weather,
    center: { lat, lng },
  })

  // §22.3: crear un reporte deja reporte, evento y snapshot de riesgo.
  insertRiskSnapshot(risk, weather, report.id)

  // docs/05 — y avisa a quien puede actuar. Va después del snapshot: si algo
  // falla aquí, el reporte y su riesgo ya están a salvo.
  const event = eventForNewReport(crossedUpward(levelBefore, risk.level))
  const notified = await dispatchNotifications(
    contextFor(report, risk, event),
    risk,
    report.id,
    // Token firmado, no el id en claro: el enlace viaja por correo y se reenvía.
    (subscriberId) =>
      `${new URL(req.url).origin}/suscripciones?token=${encodeURIComponent(
        createToken('gestionar', subscriberId),
      )}`,
  ).catch((err: Error) => {
    console.warn('[notify] no se pudo despachar el aviso:', err.message)
    return { evaluated: 0, sent: 0, throttled: 0 }
  })

  return Response.json(
    {
      report,
      classification,
      risk,
      weather,
      notified,
      routedTo: assignedInstitution
        ? { id: assignedInstitution.id, name: assignedInstitution.name }
        : null,
      duplicate: {
        decision: duplicates.decision,
        threshold: ATTACH_THRESHOLD,
        canonicalId: duplicates.best?.reportId ?? null,
        score: duplicates.best?.score ?? 0,
        reasons: duplicates.best?.reasons ?? [],
        candidates: duplicates.candidates.length,
      },
    },
    { status: 201 },
  )
})

const listSchema = z.object({
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  sinceHours: z.coerce.number().positive().max(24 * 365).optional(),
})

export const GET = handler(async (req: Request) => {
  ensureSeeded()
  const url = new URL(req.url)
  const parsed = listSchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    sinceHours: url.searchParams.get('sinceHours') ?? undefined,
  })
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Filtros inválidos.', fieldErrorsOf(parsed.error))
  }

  const reports = listReports({
    bounds: parseBounds(url.searchParams.get('bbox')),
    ...parsed.data,
  })
  return Response.json({ reports: toPublicIncidents(reports), updatedAt: new Date().toISOString() })
})
