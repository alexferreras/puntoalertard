// POST /api/incidents/:id/atestacion?token= — quien recibió el aviso responde
// con un clic (docs/05 §3.3).
//
// Una atestación **no cambia el estado**: es una señal. El correo se reenvía, así
// que un token que pudiera cerrar incidentes permitiría sacar de la cola un
// drenaje crítico la noche antes de una lluvia. Cerrar exige institución u
// operador; atestiguar, solo haber recibido el aviso.

import { z } from 'zod'

import { apiError, clientKey, fieldErrorsOf, handler, isRateLimited } from '@/lib/api'
import { ATTESTATION_KINDS, addAttestation, getReport, reportHistory } from '@/lib/db'
import { isActive } from '@/lib/status'
import { verifyToken } from '@/lib/tokens'

const bodySchema = z.object({ kind: z.enum(ATTESTATION_KINDS) })

type Ctx = { params: Promise<{ id: string }> }

export const POST = handler<Ctx>(async (req, ctx) => {
  const subscriberId = verifyToken('gestionar', new URL(req.url).searchParams.get('token'))
  if (!subscriberId) {
    return apiError('FORBIDDEN', 'El enlace no es válido o ya caducó.')
  }
  // Una atestación por destinatario cada pocos minutos: es una señal, no un voto.
  if (isRateLimited(`atestacion:${subscriberId}:${clientKey(req)}`)) {
    return apiError('RATE_LIMITED', 'Ya registramos tus respuestas recientes. Intenta más tarde.')
  }

  const { id } = await ctx.params
  const report = getReport(id)
  if (!report) return apiError('NOT_FOUND', 'El incidente no existe.')
  if (!isActive(report.status)) {
    return apiError('CONFLICT', 'El incidente ya está cerrado: no admite atestaciones.')
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return apiError(
      'VALIDATION_ERROR',
      `Indica una respuesta: ${ATTESTATION_KINDS.join(', ')}.`,
      fieldErrorsOf(parsed.error),
    )
  }

  addAttestation(id, parsed.data.kind, { type: 'suscriptor', id: subscriberId })

  return Response.json({
    registered: true,
    kind: parsed.data.kind,
    // El estado no cambia: la atestación es información para el operador.
    status: report.status,
    history: reportHistory(id),
  })
})
