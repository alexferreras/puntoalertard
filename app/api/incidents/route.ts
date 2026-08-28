// GET /api/incidents — una sola llamada alimenta mapa y dashboard:
// reportes + zonas con Risk Score + clima vigente (RF-08, RF-10, RF-13, RF-14).

import { z } from 'zod'

import { apiError, categorySchema, fieldErrorsOf, handler, scenarioSchema, statusSchema } from '@/lib/api'
import { listReports } from '@/lib/db'
import { DEMO_CENTER, parseBounds } from '@/lib/geo'
import { toPublicIncidents } from '@/lib/public'
import { computeZoneRisks } from '@/lib/risk'
import { ensureSeeded } from '@/lib/seed'
import { getWeather } from '@/lib/weather'

/** A partir de cuántos reportes una zona se considera punto recurrente (RF-13). */
const RECURRENT_MIN_REPORTS = 2

const querySchema = z.object({
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  scenario: scenarioSchema,
})

export const GET = handler(async (req: Request) => {
  ensureSeeded()
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    scenario: url.searchParams.get('scenario') ?? undefined,
  })
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Filtros inválidos.', fieldErrorsOf(parsed.error))
  }
  const { category, status, scenario } = parsed.data

  const bounds = parseBounds(url.searchParams.get('bbox'))
  const reports = listReports({ bounds, category, status })

  // El clima se consulta una vez para toda el área: el MVP cubre el Gran Santo
  // Domingo, donde el pronóstico horario es prácticamente el mismo.
  const center = bounds
    ? { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 }
    : DEMO_CENTER
  const weather = await getWeather(center, scenario)

  // Las zonas se calculan sobre TODOS los reportes de la celda, no solo los
  // filtrados: filtrar por categoría no debe falsear el riesgo de la zona.
  const zones = computeZoneRisks(listReports({ bounds }), weather)
  const recurrent = zones.filter((z) => z.reportIds.length >= RECURRENT_MIN_REPORTS)

  return Response.json({
    // Proyección pública: sin ruta de evidencia y con coordenada aproximada.
    reports: toPublicIncidents(reports),
    zones,
    recurrent,
    weather,
    updatedAt: new Date().toISOString(),
  })
})
