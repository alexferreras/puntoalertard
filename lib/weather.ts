// Proveedor meteorológico (§13). Se mantiene aislado detrás de una interfaz para
// poder sustituir Open-Meteo por fuentes oficiales (ONAMET/COE) sin tocar el
// Risk Engine.
//
// **Solo servidor**: importa `lib/env.ts`. Lo que necesite el cliente va en
// `lib/weather-shared.ts`.

import { env } from './env'
import type { LatLng } from './geo'
import {
  DEMO_SNAPSHOTS,
  snapshot,
  unavailableSnapshot,
  type WeatherScenario,
  type WeatherSnapshot,
} from './weather-shared'

export * from './weather-shared'

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
const FETCH_TIMEOUT_MS = 4_000
/** §13.2: caché por geocelda de ~1 km durante 10 min. */
const CACHE_TTL_MS = 10 * 60 * 1000
/** §13.3: un snapshot de hasta 60 min sirve como respaldo marcado como stale. */
const STALE_MAX_AGE_MS = 60 * 60 * 1000

interface CacheEntry {
  snapshot: WeatherSnapshot
  at: number
}

// Se cachea en `globalThis` para sobrevivir al hot-reload del dev server.
const globalForWeather = globalThis as unknown as { puntoAlertaWeather?: Map<string, CacheEntry> }
const cache = (globalForWeather.puntoAlertaWeather ??= new Map<string, CacheEntry>())

/** ~1.1 km de lado: dos puntos del mismo barrio comparten pronóstico. */
function geocell({ lat, lng }: LatLng): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}`
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[]
    precipitation?: number[]
    precipitation_probability?: number[]
  }
}

async function fetchOpenMeteo({ lat, lng }: LatLng): Promise<WeatherSnapshot> {
  const url = new URL(OPEN_METEO_URL)
  url.searchParams.set('latitude', lat.toFixed(4))
  url.searchParams.set('longitude', lng.toFixed(4))
  url.searchParams.set('hourly', 'precipitation,precipitation_probability')
  url.searchParams.set('forecast_days', '2')
  url.searchParams.set('timezone', 'America/Santo_Domingo')

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' })
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`)

  const data = (await res.json()) as OpenMeteoResponse
  const times = data.hourly?.time ?? []
  const precipitation = data.hourly?.precipitation ?? []
  const probability = data.hourly?.precipitation_probability ?? []
  if (times.length === 0) throw new Error('Open-Meteo sin datos horarios')

  // Se acumula desde la primera hora >= ahora, no desde el inicio del día.
  const now = Date.now()
  let start = times.findIndex((t) => new Date(t).getTime() >= now)
  if (start < 0) start = 0

  const sumOf = (hours: number) => {
    let total = 0
    for (let i = start; i < Math.min(start + hours, times.length); i++) {
      total += precipitation[i] ?? 0
    }
    return total
  }
  let maxProbability = 0
  for (let i = start; i < Math.min(start + 6, times.length); i++) {
    maxProbability = Math.max(maxProbability, (probability[i] ?? 0) / 100)
  }

  return snapshot(
    {
      precipitation1hMm: sumOf(1),
      precipitation3hMm: sumOf(3),
      precipitation6hMm: sumOf(6),
      rainProbability: maxProbability,
    },
    'open-meteo',
  )
}

/**
 * Clima vigente para un punto. Nunca lanza. Orden de preferencia:
 * escenario simulado → caché fresca (<10 min) → proveedor → snapshot rancio
 * (<60 min, marcado) → no disponible (ceros).
 */
export async function getWeather(
  point: LatLng,
  scenario: WeatherScenario = 'real',
): Promise<WeatherSnapshot> {
  if (scenario !== 'real') {
    return { ...DEMO_SNAPSHOTS[scenario], fetchedAt: new Date().toISOString() }
  }
  if (env.PUNTOALERTA_WEATHER_PROVIDER === 'mock') {
    return { ...DEMO_SNAPSHOTS.seco, fetchedAt: new Date().toISOString() }
  }

  const key = geocell(point)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.snapshot, source: 'cache' }
  }

  try {
    const fresh = await fetchOpenMeteo(point)
    cache.set(key, { snapshot: fresh, at: Date.now() })
    return fresh
  } catch (err) {
    console.warn('[weather] proveedor no disponible:', err instanceof Error ? err.message : err)
    if (cached && Date.now() - cached.at < STALE_MAX_AGE_MS) {
      return { ...cached.snapshot, source: 'cache', isStale: true }
    }
    return unavailableSnapshot()
  }
}
