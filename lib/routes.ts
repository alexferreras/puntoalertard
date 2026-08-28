// Rutas y Exposure Score (RF-16, RF-17).
//
// Se piden rutas alternativas a OSRM público y se puntúa cada una por su
// exposición a las zonas de riesgo vigentes. Si OSRM no responde se generan
// rutas sintéticas: la demo nunca se queda sin comparación (RNF-14).

import { env } from './env'
import { haversineMeters, type LatLng } from './geo'
import { riskLevelFor, type Category, type Report, type ReportStatus, type RiskAssessment, type RiskLevel } from './types'

const OSRM_BASE = env.PUNTOALERTA_OSRM_URL
const OSRM_TIMEOUT_MS = 6_000

/** §15.2 — radio máximo para que un incidente cuente como atravesado. */
export const EXPOSURE_RADIUS_M = 80

/** §15.2 — el peso decae por tramos, no de forma continua. */
export const DISTANCE_WEIGHTS: { maxMeters: number; weight: number }[] = [
  { maxMeters: 20, weight: 1 },
  { maxMeters: 40, weight: 0.7 },
  { maxMeters: 80, weight: 0.4 },
]

/**
 * §15.2 — un incidente validado por un operador pesa más que uno que solo vio
 * la IA, y ese más que uno sin verificar. Una foto ciudadana no validada no
 * puede penalizar una calle como si fuera un hecho comprobado.
 */
export const VERIFICATION_WEIGHTS = {
  operador: 1,
  ia: 0.8,
  sin_verificar: 0.6,
} as const

export type VerificationLevel = keyof typeof VERIFICATION_WEIGHTS

/** §15.2 — divisor de calibración de la demo, no un umbral científico. */
export const EXPOSURE_DIVISOR = 2.5

/** Versión de los parámetros de routing, para reproducibilidad (§15.2). */
export const ROUTING_VERSION = 'routing-v1'

export function distanceWeight(meters: number): number {
  for (const tier of DISTANCE_WEIGHTS) {
    if (meters <= tier.maxMeters) return tier.weight
  }
  return 0
}

/**
 * Nivel de verificación de un reporte. `validado` en adelante significa que un
 * operador lo revisó; con clasificación de IA pero sin revisar es `ia`; sin
 * ninguna de las dos, `sin_verificar`.
 */
export function verificationOf(report: Pick<Report, 'status' | 'aiEngine'>): VerificationLevel {
  if (OPERATOR_VERIFIED_STATUSES.includes(report.status)) return 'operador'
  return report.aiEngine ? 'ia' : 'sin_verificar'
}

const OPERATOR_VERIFIED_STATUSES: ReportStatus[] = ['validado', 'asignado', 'en_proceso']

/** Un incidente activo con el riesgo de su zona, listo para puntuar exposición. */
export interface ExposureIncident {
  reportId: string
  lat: number
  lng: number
  /** Risk Score de la zona a la que pertenece el incidente. */
  riskScore: number
  level: RiskLevel
  category: Category
  zoneKey: string
  verification: VerificationLevel
}

export interface ExposedIncident {
  reportId: string
  zoneKey: string
  category: Category
  level: RiskLevel
  riskScore: number
  /** Distancia mínima entre el incidente y el trazado. */
  distanceMeters: number
  verification: VerificationLevel
  distanceWeight: number
  verificationWeight: number
  /** Aporte crudo antes de dividir y recortar. */
  contribution: number
}

export interface RouteExposure {
  /** 0-100: `min(100, round(raw / 2.5))`. */
  score: number
  /** Suma de aportes sin normalizar, útil para auditar el cálculo. */
  raw: number
  incidents: ExposedIncident[]
  criticalCount: number
  highCount: number
}

export interface RouteOption {
  id: string
  label: string
  distanceMeters: number
  durationSeconds: number
  geometry: LatLng[]
  exposure: RouteExposure
  source: 'osrm' | 'sintetica'
}

export interface RouteComparison {
  origin: LatLng
  destination: LatLng
  via: LatLng[]
  /** Ruta más rápida en tiempo. */
  fastest: RouteOption
  /** Ruta con menor exposición (puede coincidir con la más rápida). */
  leastExposed: RouteOption
  /** `null` cuando la alternativa es demasiado lenta para recomendarla (§15.2). */
  recommendedRouteId: string | null
  options: RouteOption[]
  recommendation: string
  routingVersion: string
}

// ---------------------------------------------------------------------------
// Exposure (§15.2)
// ---------------------------------------------------------------------------

/** Distancia mínima de un punto a la polilínea, muestreando vértices. */
function minDistanceToRoute(geometry: LatLng[], point: LatLng): number {
  let min = Infinity
  for (const vertex of geometry) {
    const d = haversineMeters(vertex, point)
    if (d < min) min = d
  }
  return min
}

export function scoreExposure(geometry: LatLng[], incidents: ExposureIncident[]): RouteExposure {
  const exposed: ExposedIncident[] = []
  let raw = 0

  for (const incident of incidents) {
    const distanceMeters = minDistanceToRoute(geometry, { lat: incident.lat, lng: incident.lng })
    if (distanceMeters > EXPOSURE_RADIUS_M) continue

    const dWeight = distanceWeight(distanceMeters)
    const vWeight = VERIFICATION_WEIGHTS[incident.verification]
    const contribution = incident.riskScore * dWeight * vWeight
    raw += contribution

    exposed.push({
      reportId: incident.reportId,
      zoneKey: incident.zoneKey,
      category: incident.category,
      level: incident.level,
      riskScore: incident.riskScore,
      distanceMeters: Math.round(distanceMeters),
      verification: incident.verification,
      distanceWeight: dWeight,
      verificationWeight: vWeight,
      contribution: Number(contribution.toFixed(1)),
    })
  }

  exposed.sort((a, b) => b.contribution - a.contribution)
  return {
    score: Math.min(100, Math.round(raw / EXPOSURE_DIVISOR)),
    raw: Number(raw.toFixed(1)),
    incidents: exposed,
    criticalCount: exposed.filter((i) => i.level === 'critico').length,
    highCount: exposed.filter((i) => i.level === 'alto').length,
  }
}

// ---------------------------------------------------------------------------
// Proveedor de rutas
// ---------------------------------------------------------------------------

interface OsrmRoute {
  distance: number
  duration: number
  geometry: { coordinates: [number, number][] }
}

/** Una llamada a OSRM; `points` puede incluir waypoints intermedios (RF-16). */
async function fetchOsrmRoutes(points: LatLng[], alternatives: number): Promise<OsrmRoute[]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = new URL(`${OSRM_BASE}/route/v1/driving/${coords}`)
  // OSRM no calcula alternativas cuando hay waypoints intermedios.
  url.searchParams.set('alternatives', points.length > 2 ? 'false' : String(alternatives))
  url.searchParams.set('overview', 'full')
  url.searchParams.set('geometries', 'geojson')

  const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`OSRM respondió ${res.status}`)
  const data = (await res.json()) as { code?: string; routes?: OsrmRoute[] }
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`OSRM sin ruta (${data.code})`)
  return data.routes
}

/** Velocidad urbana promedio del Gran Santo Domingo para estimar tiempos sin OSRM. */
const URBAN_SPEED_MPS = 7.5 // ~27 km/h

/** Cuánto se aparta el waypoint de desvío respecto a la zona que se quiere evitar. */
const DETOUR_OFFSET_M = 900

/** Si la ruta menos expuesta es más de un 40% más lenta, no se auto-recomienda (§15.2). */
export const MAX_DETOUR_RATIO = 1.4

const M_PER_DEG_LAT = 111_320

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

/**
 * Waypoints a un lado y otro de la zona expuesta, perpendiculares al eje
 * origen→destino. Se los pasa a OSRM, así que el desvío sigue siendo por calles
 * reales: solo se le sugiere al motor por dónde salir.
 */
function detourWaypoints(origin: LatLng, destination: LatLng, avoid: LatLng): LatLng[] {
  const dLat = destination.lat - origin.lat
  const dLng = (destination.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180)
  const norm = Math.hypot(dLat, dLng) || 1
  // Perpendicular unitaria al eje, en grados de latitud equivalentes.
  const offsetDeg = DETOUR_OFFSET_M / M_PER_DEG_LAT
  const perpLat = (-dLng / norm) * offsetDeg
  const perpLng = (dLat / norm) * offsetDeg / Math.max(Math.cos((avoid.lat * Math.PI) / 180), 1e-6)
  return [
    { lat: avoid.lat + perpLat, lng: avoid.lng + perpLng },
    { lat: avoid.lat - perpLat, lng: avoid.lng - perpLng },
  ]
}

/** Rutas de respaldo si OSRM no responde: la recta y dos desvíos perpendiculares. */
function syntheticRoutes(points: LatLng[]): LatLng[][] {
  const origin = points[0]
  const destination = points[points.length - 1]
  const steps = 24
  const straight = Array.from({ length: steps + 1 }, (_, i) =>
    interpolate(origin, destination, i / steps),
  )

  const dLat = destination.lat - origin.lat
  const dLng = destination.lng - origin.lng
  const detours = [0.35, -0.35].map((bulge) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps
      // Campana que se anula en los extremos: el desvío solo afecta el medio.
      const offset = Math.sin(Math.PI * t) * bulge
      const base = interpolate(origin, destination, t)
      return { lat: base.lat - dLng * offset, lng: base.lng + dLat * offset }
    }),
  )
  return [straight, ...detours]
}

function pathLength(geometry: LatLng[]): number {
  let total = 0
  for (let i = 1; i < geometry.length; i++) total += haversineMeters(geometry[i - 1], geometry[i])
  return total
}

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60))

function toOption(
  route: OsrmRoute,
  incidents: ExposureIncident[],
  id: string,
  label: string,
): RouteOption {
  const geometry = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
  return {
    id,
    label,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    geometry,
    exposure: scoreExposure(geometry, incidents),
    source: 'osrm',
  }
}

/** Dos rutas con el mismo tiempo y distancia son la misma ruta para el usuario. */
function dedupe(options: RouteOption[]): RouteOption[] {
  const seen = new Set<string>()
  return options.filter((o) => {
    const key = `${Math.round(o.durationSeconds / 10)}:${Math.round(o.distanceMeters / 50)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface CompareOptions {
  /** Puntos intermedios obligatorios: ruta de intervención de brigada (RF-16). */
  via?: LatLng[]
}

async function osrmCandidates(
  points: LatLng[],
  incidents: ExposureIncident[],
): Promise<RouteOption[]> {
  const base = (await fetchOsrmRoutes(points, 3)).map((route, i) =>
    toOption(route, incidents, `osrm-${i}`, i === 0 ? 'Ruta directa' : `Alternativa ${i}`),
  )

  // Hay riesgo en el camino: se piden rutas que pasen lejos del peor incidente.
  const worst = base
    .flatMap((o) => o.exposure.incidents)
    .sort((a, b) => b.contribution - a.contribution)[0]
  if (!worst) return base

  const avoid = incidents.find((i) => i.reportId === worst.reportId)
  if (!avoid) return base

  const origin = points[0]
  const destination = points[points.length - 1]
  const detours = await Promise.all(
    detourWaypoints(origin, destination, { lat: avoid.lat, lng: avoid.lng }).map(async (waypoint, i) => {
      try {
        const [route] = await fetchOsrmRoutes([origin, ...(points.slice(1, -1)), waypoint, destination], 1)
        return toOption(route, incidents, `desvio-${i}`, `Desvío ${i + 1}`)
      } catch (err) {
        console.warn('[routes] desvío descartado:', err instanceof Error ? err.message : err)
        return null
      }
    }),
  )

  return [...base, ...detours.filter((o): o is RouteOption => o !== null)]
}

export async function compareRoutes(
  origin: LatLng,
  destination: LatLng,
  incidents: ExposureIncident[],
  { via = [] }: CompareOptions = {},
): Promise<RouteComparison> {
  const points = [origin, ...via, destination]
  let candidates: RouteOption[]

  try {
    candidates = await osrmCandidates(points, incidents)
  } catch (err) {
    console.warn(
      '[routes] OSRM no disponible, usando rutas sintéticas:',
      err instanceof Error ? err.message : err,
    )
    candidates = syntheticRoutes(points).map((geometry, i) => {
      const distance = pathLength(geometry)
      return {
        id: `sintetica-${i}`,
        label: i === 0 ? 'Ruta directa (estimada)' : `Alternativa ${i} (estimada)`,
        distanceMeters: Math.round(distance),
        durationSeconds: Math.round(distance / URBAN_SPEED_MPS),
        geometry,
        exposure: scoreExposure(geometry, incidents),
        source: 'sintetica' as const,
      }
    })
  }

  candidates = dedupe(candidates)

  const fastest = candidates.reduce((best, r) => (r.durationSeconds < best.durationSeconds ? r : best))
  const leastExposed = candidates.reduce((best, r) => {
    if (r.exposure.score !== best.exposure.score) return r.exposure.score < best.exposure.score ? r : best
    // Empate en exposición: gana la más rápida.
    return r.durationSeconds < best.durationSeconds ? r : best
  })

  const tooSlow = leastExposed.durationSeconds > fastest.durationSeconds * MAX_DETOUR_RATIO
  const recommendedId = tooSlow ? null : leastExposed.id

  const options = candidates.map((r) => ({
    ...r,
    label:
      r.id === fastest.id
        ? 'Ruta más rápida'
        : r.id === leastExposed.id
          ? 'Menor exposición a incidentes reportados'
          : r.label,
  }))
  const byId = (id: string) => options.find((r) => r.id === id)!

  return {
    origin,
    destination,
    via,
    fastest: byId(fastest.id),
    leastExposed: byId(leastExposed.id),
    recommendedRouteId: recommendedId,
    options,
    recommendation: recommendationFor(byId(fastest.id), byId(leastExposed.id), tooSlow),
    routingVersion: ROUTING_VERSION,
  }
}

function recommendationFor(fastest: RouteOption, leastExposed: RouteOption, tooSlow: boolean): string {
  if (fastest.id === leastExposed.id) {
    return fastest.exposure.incidents.length === 0
      ? `La ruta más rápida (${minutes(fastest.durationSeconds)} min) no pasa cerca de incidentes reportados.`
      : `No se encontró alternativa con menos exposición: la ruta de ${minutes(
          fastest.durationSeconds,
        )} min pasa cerca de ${fastest.exposure.incidents.length} incidente(s) reportado(s).`
  }

  const extra = minutes(leastExposed.durationSeconds) - minutes(fastest.durationSeconds)
  const avoided =
    fastest.exposure.criticalCount +
    fastest.exposure.highCount -
    (leastExposed.exposure.criticalCount + leastExposed.exposure.highCount)

  if (tooSlow) {
    return `La alternativa con menos exposición tarda +${extra} min (más del 40% extra): se muestran ambas sin recomendación automática.`
  }
  return avoided > 0
    ? `Menor exposición a incidentes reportados: +${extra} min, evitando ${avoided} punto(s) de riesgo actualmente identificados.`
    : `Menor exposición a incidentes reportados: +${extra} min, exposición ${fastest.exposure.score} → ${leastExposed.exposure.score}.`
}

/**
 * Convierte reportes activos y sus zonas en incidentes puntuables. Cada
 * incidente hereda el Risk Score de su zona (§15.2 habla de `riskScore` del
 * incidente; en este modelo el riesgo se calcula por zona).
 */
export function exposureIncidentsFrom(
  reports: Report[],
  zones: RiskAssessment[],
): ExposureIncident[] {
  const zoneOf = new Map<string, RiskAssessment>()
  for (const zone of zones) {
    for (const reportId of zone.reportIds) zoneOf.set(reportId, zone)
  }

  return reports.flatMap((report) => {
    const zone = zoneOf.get(report.id)
    if (!zone) return []
    return [
      {
        reportId: report.id,
        lat: report.lat,
        lng: report.lng,
        riskScore: zone.score,
        level: riskLevelFor(zone.score),
        category: report.category,
        zoneKey: zone.zoneKey,
        verification: verificationOf(report),
      },
    ]
  })
}
