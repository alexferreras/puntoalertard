// Tipos y constantes meteorológicas que usan tanto el servidor como el cliente.
//
// Vive separado de `weather.ts` porque ese módulo importa `lib/env.ts`, y un
// componente de cliente que importara valores de ahí arrastraría la
// configuración del servidor —incluidos valores por defecto de secretos— al
// bundle del navegador. Este fichero no importa nada del servidor, a propósito.

export const ALERT_LEVELS = ['ninguna', 'aviso', 'alerta', 'emergencia'] as const
export type AlertLevel = (typeof ALERT_LEVELS)[number]

export const ALERT_META: Record<AlertLevel, { label: string; icon: string }> = {
  ninguna: { label: 'Sin aviso', icon: '☀️' },
  aviso: { label: 'Aviso de lluvia', icon: '🌦️' },
  alerta: { label: 'Alerta por lluvia intensa', icon: '🌧️' },
  emergencia: { label: 'Emergencia meteorológica', icon: '⛈️' },
}

/** Forma exigida por §13.1: acumulados a 1, 3 y 6 horas. */
export interface WeatherSnapshot {
  precipitation1hMm: number
  precipitation3hMm: number
  precipitation6hMm: number
  /** Probabilidad máxima de precipitación en las próximas 6 h, 0-1. */
  rainProbability: number
  alert: AlertLevel
  /** `unavailable` significa ceros reales, no un valor inventado. */
  source: 'open-meteo' | 'cache' | 'demo' | 'unavailable'
  /** `true` cuando el dato viene de un snapshot anterior y no del proveedor. */
  isStale: boolean
  fetchedAt: string
  summary: string
}

/** Escenarios forzados para la demo (RF-12: ver el riesgo cambiar en vivo). */
export const WEATHER_SCENARIOS = ['real', 'seco', 'lluvia'] as const
export type WeatherScenario = (typeof WEATHER_SCENARIOS)[number]

export function parseScenario(raw: string | null | undefined): WeatherScenario {
  return (WEATHER_SCENARIOS as readonly string[]).includes(raw ?? '')
    ? (raw as WeatherScenario)
    : 'real'
}

/** Umbrales de aviso. >10 mm/6 h ya causa anegamientos urbanos en el Gran Santo Domingo. */
export function alertFor(precipitation6hMm: number): AlertLevel {
  if (precipitation6hMm >= 40) return 'emergencia'
  if (precipitation6hMm >= 15) return 'alerta'
  if (precipitation6hMm >= 4) return 'aviso'
  return 'ninguna'
}

function summarize(snapshot: Omit<WeatherSnapshot, 'summary'>): string {
  if (snapshot.source === 'unavailable') {
    return 'Clima no disponible: el riesgo se calcula sin el factor meteorológico.'
  }
  const mm = snapshot.precipitation6hMm.toFixed(1)
  if (snapshot.alert === 'ninguna') {
    return `Sin lluvia significativa prevista (${mm} mm en 6 h).`
  }
  const pct = Math.round(snapshot.rainProbability * 100)
  return `${ALERT_META[snapshot.alert].label}: ${mm} mm previstos en 6 h, ${pct}% de probabilidad.`
}

export function snapshot(
  values: {
    precipitation1hMm: number
    precipitation3hMm: number
    precipitation6hMm: number
    rainProbability: number
  },
  source: WeatherSnapshot['source'],
  isStale = false,
): WeatherSnapshot {
  const base = {
    precipitation1hMm: Number(values.precipitation1hMm.toFixed(1)),
    precipitation3hMm: Number(values.precipitation3hMm.toFixed(1)),
    precipitation6hMm: Number(values.precipitation6hMm.toFixed(1)),
    rainProbability: Number(values.rainProbability.toFixed(2)),
    alert: alertFor(values.precipitation6hMm),
    source,
    isStale,
    fetchedAt: new Date().toISOString(),
  }
  return { ...base, summary: summarize(base) }
}

export const DEMO_SNAPSHOTS: Record<Exclude<WeatherScenario, 'real'>, WeatherSnapshot> = {
  seco: snapshot(
    { precipitation1hMm: 0, precipitation3hMm: 0, precipitation6hMm: 0, rainProbability: 0.05 },
    'demo',
  ),
  lluvia: snapshot(
    { precipitation1hMm: 9, precipitation3hMm: 24, precipitation6hMm: 38, rainProbability: 0.92 },
    'demo',
  ),
}

/**
 * §13.3: si no hay proveedor ni snapshot reciente, se devuelven ceros con
 * `source=unavailable`. No se inventa un pronóstico: la UI dice "clima no
 * disponible" y el Risk Engine deja el factor meteorológico en 0.
 */
export function unavailableSnapshot(): WeatherSnapshot {
  return snapshot(
    { precipitation1hMm: 0, precipitation3hMm: 0, precipitation6hMm: 0, rainProbability: 0 },
    'unavailable',
  )
}
