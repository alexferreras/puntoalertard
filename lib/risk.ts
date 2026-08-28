// Risk Engine — implementa la fórmula versionada del §12 del doc de estándares.
//
// Es una función pura: mismos reportes + mismo clima = mismo score. No toca red
// ni base de datos, y ningún número sale de aquí sin la frase que lo explica
// (RNF-10).

import { ZONE_RADIUS_METERS, haversineMeters, zoneCenter, zoneKeyFor, type LatLng } from './geo'
import { isActive } from './status'
import {
  riskLevelFor,
  type Report,
  type RiskAssessment,
  type RiskFactor,
  type RiskLevel,
} from './types'
import type { WeatherSnapshot } from './weather-shared'

/** §12.1 — cualquier cambio de pesos o normalización exige subir esta versión. */
export const RISK_FORMULA_VERSION = 'risk-v1'

export const RISK_WEIGHTS = {
  severidad_observada: 0.3,
  recurrencia_reciente: 0.25,
  lluvia_prevista: 0.2,
  historial_punto: 0.15,
  contexto: 0.1,
} as const

/** §12.2 — ventanas y radio de vecindad de la normalización. */
export const RECURRENCE_WINDOW_DAYS = 14
export const HISTORY_WINDOW_DAYS = 180
export const NEIGHBOURHOOD_RADIUS_M = 100

const DAY_MS = 86_400_000
const clamp100 = (n: number) => Math.max(0, Math.min(100, n))
/** Un incidente descartado o duplicado tampoco está activo, no solo el resuelto. */
const isOpen = (report: Report) => isActive(report.status)

function within(report: Report, center: LatLng, days: number, now: number): boolean {
  const age = now - new Date(report.createdAt).getTime()
  if (age > days * DAY_MS) return false
  return haversineMeters(center, { lat: report.lat, lng: report.lng }) <= NEIGHBOURHOOD_RADIUS_M
}

// ---------------------------------------------------------------------------
// Factores (§12.2)
// ---------------------------------------------------------------------------

/** Severidad del incidente vigente, 0-100. Un punto sin reportes abiertos es 0. */
function severidadObservada(reports: Report[]): RiskFactor {
  const open = reports.filter(isOpen)
  const worst = open.reduce((max, r) => Math.max(max, r.severity), 0)
  return {
    key: 'severidad_observada',
    label: 'Severidad observada',
    score: worst * 10,
    weight: RISK_WEIGHTS.severidad_observada,
    explanation:
      open.length === 0
        ? 'Sin incidentes abiertos en el punto.'
        : `Severidad máxima observada ${worst}/10 entre ${open.length} incidente(s) abierto(s).`,
  }
}

/** Escalones exactos del doc: 0=0, 1=20, 2=40, 3=60, 4=80, >=5=100. */
function recurrenceScore(count: number): number {
  return count >= 5 ? 100 : count * 20
}

function recurrenciaReciente(reports: Report[], center: LatLng, now: number): RiskFactor {
  const count = reports.filter((r) => within(r, center, RECURRENCE_WINDOW_DAYS, now)).length
  return {
    key: 'recurrencia_reciente',
    label: 'Recurrencia reciente',
    score: recurrenceScore(count),
    weight: RISK_WEIGHTS.recurrencia_reciente,
    explanation:
      count === 0
        ? `Sin reportes en los últimos ${RECURRENCE_WINDOW_DAYS} días a ${NEIGHBOURHOOD_RADIUS_M} m.`
        : `${count} reporte(s) en los últimos ${RECURRENCE_WINDOW_DAYS} días a menos de ${NEIGHBOURHOOD_RADIUS_M} m.`,
  }
}

/** Escalones del doc: <1mm=0, 1-4.9=25, 5-14.9=50, 15-29.9=75, >=30=100. */
export function weatherScore(precipitation6hMm: number): number {
  if (precipitation6hMm >= 30) return 100
  if (precipitation6hMm >= 15) return 75
  if (precipitation6hMm >= 5) return 50
  if (precipitation6hMm >= 1) return 25
  return 0
}

function lluviaPrevista(weather: WeatherSnapshot): RiskFactor {
  // §12.5: sin clima el factor es 0 y la explicación no inventa un pronóstico.
  const unavailable = weather.source === 'unavailable'
  return {
    key: 'lluvia_prevista',
    label: 'Lluvia prevista',
    score: unavailable ? 0 : weatherScore(weather.precipitation6hMm),
    weight: RISK_WEIGHTS.lluvia_prevista,
    explanation: unavailable
      ? 'Pronóstico no disponible: este factor no aporta al score.'
      : `${weather.precipitation6hMm.toFixed(1)} mm previstos en 6 h (${weather.precipitation1hMm.toFixed(
          1,
        )} mm en 1 h, ${weather.precipitation3hMm.toFixed(1)} mm en 3 h), fuente ${weather.source}${
          weather.isStale ? ' (dato no vigente)' : ''
        }.`,
  }
}

/** Escalones del doc: 0=0, 1-2=30, 3-5=60, >=6=100. */
function historyScore(count: number): number {
  if (count >= 6) return 100
  if (count >= 3) return 60
  if (count >= 1) return 30
  return 0
}

function historialPunto(reports: Report[], center: LatLng, now: number): RiskFactor {
  const count = reports.filter((r) => within(r, center, HISTORY_WINDOW_DAYS, now)).length
  const resolved = reports.filter((r) => !isActive(r.status)).length
  return {
    key: 'historial_punto',
    label: 'Historial del punto',
    score: historyScore(count),
    weight: RISK_WEIGHTS.historial_punto,
    explanation:
      count === 0
        ? `Sin historial en los últimos ${HISTORY_WINDOW_DAYS} días a ${NEIGHBOURHOOD_RADIUS_M} m.`
        : `${count} reporte(s) en ${HISTORY_WINDOW_DAYS} días a menos de ${NEIGHBOURHOOD_RADIUS_M} m, ${resolved} ya resuelto(s) y reaparecido(s).`,
  }
}

/** §12.2 — aportes acumulables, con tope 100. */
const CONTEXT_POINTS = {
  drenaje_obstruido: 20,
  inundacion: 30,
  via_bloqueada: 20,
  via_principal: 20,
  alerta_manual: 30,
} as const

function contexto(reports: Report[], alertFlag: boolean): RiskFactor {
  const open = reports.filter(isOpen)
  const has = (category: string) => open.some((r) => r.category === category)
  const parts: string[] = []
  let score = 0

  if (has('drenaje_obstruido')) {
    score += CONTEXT_POINTS.drenaje_obstruido
    parts.push('drenaje obstruido')
  }
  if (has('inundacion')) {
    score += CONTEXT_POINTS.inundacion
    parts.push('agua acumulada')
  }
  if (has('via_bloqueada')) {
    score += CONTEXT_POINTS.via_bloqueada
    parts.push('vía afectada')
  }
  if (reports.some((r) => r.mainRoad)) {
    score += CONTEXT_POINTS.via_principal
    parts.push('vía principal')
  }
  if (alertFlag) {
    score += CONTEXT_POINTS.alerta_manual
    parts.push('alerta manual activa')
  }

  return {
    key: 'contexto',
    label: 'Contexto',
    score: clamp100(score),
    weight: RISK_WEIGHTS.contexto,
    explanation: parts.length === 0 ? 'Sin factores de contexto agravantes.' : `Agravantes: ${parts.join(', ')}.`,
  }
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------

/** §12.4 — 1 a 3 razones, ordenadas por contribución absoluta al score. */
const REASON_TEMPLATES: Record<RiskFactor['key'], (factor: RiskFactor) => string> = {
  severidad_observada: (f) => `Severidad observada ${f.score / 10}/10`,
  recurrencia_reciente: (f) => f.explanation.replace(/\.$/, ''),
  lluvia_prevista: (f) => f.explanation.replace(/\.$/, ''),
  historial_punto: (f) => f.explanation.replace(/\.$/, ''),
  contexto: (f) => f.explanation.replace(/^Agravantes: /, '').replace(/\.$/, ''),
}

function reasonsFor(factors: RiskFactor[]): string[] {
  return [...factors]
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((f) => REASON_TEMPLATES[f.key](f))
}

export interface ComputeRiskInput {
  zoneKey: string
  /** Reportes del punto. Ya deben venir filtrados por proximidad. */
  reports: Report[]
  weather: WeatherSnapshot
  /** Permite congelar el reloj en tests. */
  now?: Date
  /** Centro explícito; si falta se deriva de la celda. */
  center?: LatLng
  /** Bandera de alerta manual activada por un operador (§12.2). */
  alertFlag?: boolean
}

/**
 * El resumen dice **cuántos** reportes y **en cuánto perímetro**, además del
 * factor dominante: un nivel de riesgo sin esos dos datos no es verificable por
 * quien lo lee.
 */
function summaryFor(
  score: number,
  level: RiskLevel,
  reportCount: number,
  reasons: string[],
): string {
  const base = `Riesgo ${score}/100 (${level}) por ${reportCount} reporte(s) agrupados en un radio de ${ZONE_RADIUS_METERS} m`
  return reasons.length === 0
    ? `${base}, sin factores agravantes activos.`
    : `${base}. Factor dominante: ${reasons[0].toLowerCase()}.`
}

export function computeRisk({
  zoneKey,
  reports,
  weather,
  now = new Date(),
  center,
  alertFlag = false,
}: ComputeRiskInput): RiskAssessment {
  const nowMs = now.getTime()
  const point = center ?? zoneCenter(zoneKey)

  const factors: RiskFactor[] = [
    severidadObservada(reports),
    recurrenciaReciente(reports, point, nowMs),
    lluviaPrevista(weather),
    historialPunto(reports, point, nowMs),
    contexto(reports, alertFlag),
  ]

  const score = clamp100(Math.round(factors.reduce((acc, f) => acc + f.score * f.weight, 0)))
  const level = riskLevelFor(score)
  const reasons = reasonsFor(factors)

  return {
    zoneKey,
    lat: point.lat,
    lng: point.lng,
    radiusMeters: ZONE_RADIUS_METERS,
    neighbourhoodMeters: NEIGHBOURHOOD_RADIUS_M,
    score,
    level,
    factors,
    reasons,
    reportIds: reports.map((r) => r.id),
    computedAt: now.toISOString(),
    formulaVersion: RISK_FORMULA_VERSION,
    summary: summaryFor(score, level, reports.length, reasons),
  }
}

/**
 * Agrupa reportes en zonas por proximidad (clustering codicioso por radio) y
 * evalúa cada una. Se agrupa por distancia y no por celda de grilla porque un
 * borde de celda partía en dos zonas los reportes de una misma esquina.
 */
export function clusterReports(reports: Report[], radiusMeters = ZONE_RADIUS_METERS): Report[][] {
  // El reporte más severo y reciente primero: es el que da nombre a la zona.
  const pending = [...reports].sort(
    (a, b) =>
      b.severity - a.severity || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const clusters: Report[][] = []

  while (pending.length > 0) {
    const seed = pending.shift()!
    const cluster = [seed]
    for (let i = pending.length - 1; i >= 0; i--) {
      const candidate = pending[i]
      if (
        haversineMeters(
          { lat: seed.lat, lng: seed.lng },
          { lat: candidate.lat, lng: candidate.lng },
        ) <= radiusMeters
      ) {
        cluster.push(candidate)
        pending.splice(i, 1)
      }
    }
    clusters.push(cluster)
  }
  return clusters
}

export function computeZoneRisks(
  reports: Report[],
  weather: WeatherSnapshot,
  now = new Date(),
): RiskAssessment[] {
  return clusterReports(reports)
    .map((zoneReports) => {
      const center = {
        lat: zoneReports.reduce((acc, r) => acc + r.lat, 0) / zoneReports.length,
        lng: zoneReports.reduce((acc, r) => acc + r.lng, 0) / zoneReports.length,
      }
      return computeRisk({ zoneKey: zoneKeyFor(center), reports: zoneReports, weather, now, center })
    })
    .sort((a, b) => b.score - a.score)
}

/** Zonas de riesgo dentro de un radio: base para el Exposure Score de rutas (RF-17). */
export function zonesNear(
  zones: RiskAssessment[],
  point: LatLng,
  radiusMeters: number,
): RiskAssessment[] {
  return zones.filter((z) => haversineMeters(point, { lat: z.lat, lng: z.lng }) <= radiusMeters)
}
