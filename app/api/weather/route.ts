// GET /api/weather?lat=&lng=&scenario= — pronóstico vigente (RF-11)

import { z } from 'zod'

import { apiError, fieldErrorsOf, handler, latSchema, lngSchema, scenarioSchema } from '@/lib/api'
import { DEMO_CENTER } from '@/lib/geo'
import { getWeather } from '@/lib/weather'

const querySchema = z.object({
  lat: latSchema.default(DEMO_CENTER.lat),
  lng: lngSchema.default(DEMO_CENTER.lng),
  scenario: scenarioSchema,
})

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get('lat') ?? undefined,
    lng: url.searchParams.get('lng') ?? undefined,
    scenario: url.searchParams.get('scenario') ?? undefined,
  })
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Parámetros inválidos.', fieldErrorsOf(parsed.error))
  }
  const { lat, lng, scenario } = parsed.data
  return Response.json({ weather: await getWeather({ lat, lng }, scenario) })
})
