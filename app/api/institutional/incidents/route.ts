// GET /api/institutional/incidents?since= — incidentes de la jurisdicción de la
// institución autenticada (docs/05 §3.2, canal de polling).

import { apiError, handler } from '@/lib/api'
import { listReports } from '@/lib/db'
import { authenticateInstitution, hasJurisdiction } from '@/lib/institutions'
import { toPublicIncidents } from '@/lib/public'
import { computeZoneRisks } from '@/lib/risk'
import { ensureSeeded } from '@/lib/seed'
import { isActive } from '@/lib/status'
import { getWeather } from '@/lib/weather'
import { DEMO_CENTER } from '@/lib/geo'

export const GET = handler(async (req: Request) => {
  const institution = authenticateInstitution(req)
  if (!institution) {
    return apiError('UNAUTHORIZED', 'Credencial institucional ausente o inválida.')
  }
  ensureSeeded()

  const since = new URL(req.url).searchParams.get('since')
  const sinceMs = since ? new Date(since).getTime() : null
  if (since && !Number.isFinite(sinceMs)) {
    return apiError('VALIDATION_ERROR', '`since` debe ser una fecha ISO-8601 válida.')
  }

  const all = listReports({})
  const zones = computeZoneRisks(all, await getWeather(DEMO_CENTER))
  const zoneOf = new Map<string, string>()
  for (const zone of zones) {
    for (const reportId of zone.reportIds) zoneOf.set(reportId, zone.zoneKey)
  }

  const mios = all.filter((report) => {
    if (sinceMs && new Date(report.createdAt).getTime() < sinceMs) return false
    const zoneKey = zoneOf.get(report.id) ?? report.zoneKey
    return hasJurisdiction(institution, { zoneKey, category: report.category })
  })

  return Response.json({
    institution: { id: institution.id, name: institution.name },
    // Misma proyección pública: la evidencia se pide aparte y con permiso.
    incidents: toPublicIncidents(mios),
    active: mios.filter((r) => isActive(r.status)).length,
    updatedAt: new Date().toISOString(),
  })
})
