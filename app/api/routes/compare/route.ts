// POST /api/routes/compare — ruta más rápida vs. ruta de menor exposición (RF-16, RF-17)

import { z } from 'zod'

import { apiError, demoPointSchema, fieldErrorsOf, handler, scenarioSchema } from '@/lib/api'
import { listReports } from '@/lib/db'
import { DEMO_CENTER, MAX_ROUTE_DISTANCE_M, haversineMeters } from '@/lib/geo'
import { computeZoneRisks } from '@/lib/risk'
import { compareRoutes, exposureIncidentsFrom } from '@/lib/routes'
import { isActive } from '@/lib/status'
import { ensureSeeded } from '@/lib/seed'
import { getWeather } from '@/lib/weather'

const bodySchema = z.object({
  origin: demoPointSchema,
  destination: demoPointSchema,
  /** Puntos prioritarios intermedios para una brigada (RF-16). */
  via: z.array(demoPointSchema).max(5).default([]),
  scenario: scenarioSchema,
})

export const POST = handler(async (req: Request) => {
  ensureSeeded()
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body ?? {})
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Revisa el origen y el destino de la ruta.', fieldErrorsOf(parsed.error))
  }
  const { origin, destination, via, scenario } = parsed.data
  if (haversineMeters(origin, destination) > MAX_ROUTE_DISTANCE_M) {
    return apiError('VALIDATION_ERROR', 'La distancia entre origen y destino supera los 50 km del MVP.')
  }

  const center = {
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2,
  }
  const weather = await getWeather(Number.isFinite(center.lat) ? center : DEMO_CENTER, scenario)
  const reports = listReports({})
  const zones = computeZoneRisks(reports, weather)
  // §15.2 puntúa incidentes activos, no zonas: un incidente cerrado no expone a nadie.
  const incidents = exposureIncidentsFrom(reports.filter((r) => isActive(r.status)), zones)
  const comparison = await compareRoutes(origin, destination, incidents, { via })

  return Response.json({ ...comparison, weather })
})
