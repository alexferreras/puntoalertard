// Constructores para los tests. Un reporte de prueba se define por lo que el
// caso necesita; el resto son valores neutros que no afectan al score.

import type { Category, Report, ReportStatus } from '@/lib/types'
import type { WeatherSnapshot } from '@/lib/weather-shared'
import { alertFor } from '@/lib/weather-shared'

export const NOW = new Date('2026-08-27T12:00:00.000Z')
const HOUR = 3_600_000
const DAY = 86_400_000

export interface ReportOverrides {
  id?: string
  category?: Category
  severity?: number
  status?: ReportStatus
  hoursAgo?: number
  daysAgo?: number
  lat?: number
  lng?: number
  mainRoad?: boolean
  photoSha256?: string | null
}

/** Punto base de los tests: la Av. México de la demo. */
export const BASE_POINT = { lat: 18.47872, lng: -69.88984 }

export function makeReport(overrides: ReportOverrides = {}): Report {
  const ageMs = (overrides.daysAgo ?? 0) * DAY + (overrides.hoursAgo ?? 0) * HOUR
  const createdAt = new Date(NOW.getTime() - ageMs).toISOString()
  const status = overrides.status ?? 'reportado'
  return {
    id: overrides.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    lat: overrides.lat ?? BASE_POINT.lat,
    lng: overrides.lng ?? BASE_POINT.lng,
    category: overrides.category ?? 'basura',
    severity: overrides.severity ?? 5,
    status,
    description: null,
    photoPath: null,
    zoneKey: '150:0:0',
    mainRoad: overrides.mainRoad ?? false,
    photoSha256: overrides.photoSha256 ?? null,
    duplicateOf: null,
    duplicateScore: null,
    assignedInstitutionId: null,
    sessionHash: null,
    aiCategory: null,
    aiConfidence: null,
    aiSignals: null,
    aiRationale: null,
    aiEngine: null,
    confirmedByUser: false,
    resolvedAt: status === 'resuelto' ? createdAt : null,
  }
}

export function makeWeather(precipitation6hMm: number, source: WeatherSnapshot['source'] = 'demo'): WeatherSnapshot {
  return {
    precipitation1hMm: Number((precipitation6hMm / 4).toFixed(1)),
    precipitation3hMm: Number((precipitation6hMm / 2).toFixed(1)),
    precipitation6hMm,
    rainProbability: precipitation6hMm > 0 ? 0.9 : 0.05,
    alert: alertFor(precipitation6hMm),
    source,
    isStale: false,
    fetchedAt: NOW.toISOString(),
    summary: 'clima de prueba',
  }
}

export const DRY = makeWeather(0)
export const HEAVY_RAIN = makeWeather(38)
export const NO_WEATHER: WeatherSnapshot = { ...makeWeather(0, 'unavailable'), rainProbability: 0 }

/**
 * Mueve un punto una distancia exacta hacia el norte, para fijar los límites de
 * radio de los tests (19 m, 20 m, 21 m…).
 */
export function metersNorth(meters: number, from = BASE_POINT) {
  return { lat: from.lat + meters / 111_320, lng: from.lng }
}
