// GET   /api/incidents/:id — detalle, historial y riesgo de la zona (RF-18)
// PATCH /api/incidents/:id — avanzar estado o confirmar categoría (RF-07, RF-15)

import { z } from 'zod'

import { apiError, categorySchema, fieldErrorsOf, handler, scenarioSchema, statusSchema } from '@/lib/api'
import {
  confirmCategory,
  getReport,
  insertRiskSnapshot,
  reportHistory,
  updateSeverity,
  reportsWithinRadius,
  riskHistory,
  updateStatus,
} from '@/lib/db'
import { currentRole } from '@/lib/auth'
import { ZONE_RADIUS_METERS } from '@/lib/geo'
import { computeRisk } from '@/lib/risk'
import { MAX_NOTE_CHARS, allowsCorrection, canTransition } from '@/lib/status'
import { getWeather, parseScenario } from '@/lib/weather'

async function riskForReportZone(zoneKey: string, lat: number, lng: number, scenario: string | null) {
  const weather = await getWeather({ lat, lng }, parseScenario(scenario))
  return {
    weather,
    risk: computeRisk({
      zoneKey,
      reports: reportsWithinRadius({ lat, lng }, ZONE_RADIUS_METERS),
      weather,
      center: { lat, lng },
    }),
  }
}

type Ctx = { params: Promise<{ id: string }> }

export const GET = handler<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params
  const report = getReport(id)
  if (!report) return apiError('NOT_FOUND', 'El reporte no existe.')

  const url = new URL(req.url)
  const { weather, risk } = await riskForReportZone(
    report.zoneKey,
    report.lat,
    report.lng,
    url.searchParams.get('scenario'),
  )
  return Response.json({
    report,
    history: reportHistory(id),
    risk,
    riskHistory: riskHistory(report.zoneKey, 10),
    weather,
  })
})

const patchSchema = z
  .object({
    status: statusSchema.optional(),
    /** Corrección de categoría por el ciudadano o el operador. */
    category: categorySchema.optional(),
    /** Corrección de severidad por el operador, solo antes de validar (§16). */
    severity: z.coerce.number().int().min(1).max(10).optional(),
    note: z.string().trim().max(MAX_NOTE_CHARS).optional(),
    scenario: scenarioSchema,
  })
  .refine((v) => v.status || v.category || v.severity !== undefined, {
    message: 'Indica al menos un cambio: status, category o severity.',
  })

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params
  const current = getReport(id)
  if (!current) return apiError('NOT_FOUND', 'El reporte no existe.')

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Cambio inválido.', fieldErrorsOf(parsed.error))
  }
  const { status, category, severity, note, scenario } = parsed.data
  const role = await currentRole()

  // §8 — cambiar estado o severidad es potestad del operador. La corrección de
  // categoría no lo es: es el derecho del ciudadano a enmendar a la IA (RF-07),
  // y se permite solo mientras un operador no haya validado el incidente.
  if ((status || severity !== undefined) && role !== 'operador') {
    return apiError(
      'UNAUTHORIZED',
      'Cambiar el estado o la severidad requiere una sesión de operador.',
    )
  }
  if (category && role !== 'operador' && !allowsCorrection(current.status)) {
    return apiError(
      'FORBIDDEN',
      'Este incidente ya fue validado: la categoría solo puede cambiarla un operador.',
    )
  }

  if (status) {
    const transition = canTransition(current.status, status, note)
    if (!transition.allowed) return apiError('CONFLICT', transition.reason!)
  }

  // §16: la severidad solo se corrige mientras el incidente no esté validado.
  if (severity !== undefined && !allowsCorrection(current.status)) {
    return apiError(
      'CONFLICT',
      `La severidad solo puede corregirse antes de validar el incidente (estado actual: ${current.status}).`,
    )
  }

  let report = current
  if (category) report = confirmCategory(id, category) ?? report
  if (severity !== undefined) report = updateSeverity(id, severity, note) ?? report
  if (status) report = updateStatus(id, status, note) ?? report

  const { weather, risk } = await riskForReportZone(report.zoneKey, report.lat, report.lng, scenario)
  // Un cambio de estado o de categoría altera el riesgo: queda registrado.
  insertRiskSnapshot(risk, weather, report.id)

  return Response.json({
    report,
    history: reportHistory(id),
    risk,
    riskHistory: riskHistory(report.zoneKey, 10),
    weather,
  })
})
