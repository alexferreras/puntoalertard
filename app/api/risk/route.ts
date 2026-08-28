// GET /api/risk?lat=&lng=&scenario= — Risk Score explicable de una zona (RF-10, RNF-10)

import { z } from 'zod'

import { apiError, fieldErrorsOf, handler, latSchema, lngSchema, scenarioSchema } from '@/lib/api'
import { reportsWithinRadius } from '@/lib/db'
import { ZONE_RADIUS_METERS, zoneKeyFor } from '@/lib/geo'
import { RISK_FORMULA_VERSION, RISK_WEIGHTS, computeRisk } from '@/lib/risk'
import { ensureSeeded } from '@/lib/seed'
import { getWeather } from '@/lib/weather'

const querySchema = z.object({ lat: latSchema, lng: lngSchema, scenario: scenarioSchema })

export const GET = handler(async (req: Request) => {
  ensureSeeded()
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get('lat'),
    lng: url.searchParams.get('lng'),
    scenario: url.searchParams.get('scenario') ?? undefined,
  })
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Coordenadas inválidas.', fieldErrorsOf(parsed.error))
  }
  const { lat, lng, scenario } = parsed.data

  const zoneKey = zoneKeyFor({ lat, lng })
  const weather = await getWeather({ lat, lng }, scenario)
  const risk = computeRisk({
    zoneKey,
    reports: reportsWithinRadius({ lat, lng }, ZONE_RADIUS_METERS),
    weather,
    center: { lat, lng },
  })

  return Response.json({ risk, weather, model: { version: RISK_FORMULA_VERSION, weights: RISK_WEIGHTS } })
})
