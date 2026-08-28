// PATCH /api/institutional/incidents/:id — la institución cambia el estado desde
// su propio sistema (docs/05 §3.3). Fuera de su jurisdicción, 403.

import { z } from 'zod'

import { apiError, fieldErrorsOf, handler, statusSchema } from '@/lib/api'
import { getReport, insertRiskSnapshot, reportHistory, reportsWithinRadius, updateStatus } from '@/lib/db'
import { ZONE_RADIUS_METERS } from '@/lib/geo'
import { authenticateInstitution, hasJurisdiction } from '@/lib/institutions'
import { computeRisk } from '@/lib/risk'
import { MAX_NOTE_CHARS, canTransition } from '@/lib/status'
import { getWeather } from '@/lib/weather'

/** §3.3 — una institución no puede dejar un incidente en revisión ni asignarlo a otra. */
const INSTITUTION_STATUSES = ['validado', 'asignado', 'en_proceso', 'resuelto', 'descartado'] as const

const bodySchema = z.object({
  status: statusSchema.refine(
    (s) => (INSTITUTION_STATUSES as readonly string[]).includes(s),
    { message: `Una institución solo puede usar: ${INSTITUTION_STATUSES.join(', ')}.` },
  ),
  note: z.string().trim().max(MAX_NOTE_CHARS).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const institution = authenticateInstitution(req)
  if (!institution) {
    return apiError('UNAUTHORIZED', 'Credencial institucional ausente o inválida.')
  }

  const { id } = await ctx.params
  const current = getReport(id)
  if (!current) return apiError('NOT_FOUND', 'El incidente no existe.')

  if (!hasJurisdiction(institution, { zoneKey: current.zoneKey, category: current.category })) {
    return apiError(
      'FORBIDDEN',
      `${institution.name} no tiene jurisdicción sobre este incidente (${current.category}).`,
    )
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Cambio inválido.', fieldErrorsOf(parsed.error))
  }
  const { status, note } = parsed.data

  const transition = canTransition(current.status, status, note)
  if (!transition.allowed) return apiError('CONFLICT', transition.reason!)

  // El cambio queda atribuido a la institución, no a un operador anónimo.
  const report = updateStatus(id, status, note, { type: 'institucion', id: institution.id })
  if (!report) return apiError('NOT_FOUND', 'El incidente no existe.')

  const weather = await getWeather({ lat: report.lat, lng: report.lng })
  const risk = computeRisk({
    zoneKey: report.zoneKey,
    reports: reportsWithinRadius({ lat: report.lat, lng: report.lng }, ZONE_RADIUS_METERS),
    weather,
    center: { lat: report.lat, lng: report.lng },
  })
  insertRiskSnapshot(risk, weather, report.id)

  return Response.json({
    incident: { id: report.id, status: report.status, category: report.category },
    changedBy: { type: 'institucion', id: institution.id, name: institution.name },
    history: reportHistory(id),
    risk: { score: risk.score, level: risk.level, reasons: risk.reasons },
  })
})
