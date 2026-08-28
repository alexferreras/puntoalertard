// POST   /api/auth/operador — inicia sesión de operador con el código de acceso
// GET    /api/auth/operador — devuelve el rol vigente (para que la UI se adapte)
// DELETE /api/auth/operador — cierra la sesión

import { z } from 'zod'

import { apiError, clientKey, fieldErrorsOf, handler, isRateLimited } from '@/lib/api'
import { currentRole, endSession, isValidOperatorCode, startSession } from '@/lib/auth'

const bodySchema = z.object({ code: z.string().min(1) })

export const GET = handler(async () => {
  return Response.json({ role: await currentRole() })
})

export const POST = handler(async (req: Request) => {
  // El mismo limitador que los reportes: evita probar códigos por fuerza bruta.
  if (isRateLimited(`auth:${clientKey(req)}`)) {
    return apiError('RATE_LIMITED', 'Demasiados intentos. Espera unos minutos.')
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Falta el código de acceso.', fieldErrorsOf(parsed.error))
  }

  if (!isValidOperatorCode(parsed.data.code)) {
    return apiError('FORBIDDEN', 'Código de acceso inválido.')
  }

  await startSession()
  return Response.json({ role: 'operador' })
})

export const DELETE = handler(async () => {
  await endSession()
  return Response.json({ role: null })
})
