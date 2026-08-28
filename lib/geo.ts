// Utilidades geográficas. El MVP usa SQLite sin PostGIS, así que la geometría
// se resuelve con haversine + celdas de grilla en lugar de índices espaciales.

const EARTH_RADIUS_M = 6_371_000

export interface LatLng {
  lat: number
  lng: number
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Lado de la celda de agregación de zonas, en metros. */
export const ZONE_CELL_METERS = 150

/**
 * Radio con el que se agrupan reportes en una zona. Se usa en lugar de la celda
 * para decidir pertenencia: dos reportes de la misma esquina no deben caer en
 * zonas distintas solo porque entre ellos pasa un borde de la grilla.
 */
export const ZONE_RADIUS_METERS = 150

const DEG_PER_METER_LAT = 1 / 111_320

/**
 * Celda de grilla estable para un punto. Dos reportes en la misma celda se
 * consideran de la misma "zona" para recurrencia y Risk Score.
 */
export function zoneKeyFor({ lat, lng }: LatLng, cellMeters = ZONE_CELL_METERS): string {
  const latStep = cellMeters * DEG_PER_METER_LAT
  const lngStep = latStep / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  const latIdx = Math.floor(lat / latStep)
  const lngIdx = Math.floor(lng / lngStep)
  return `${cellMeters}:${latIdx}:${lngIdx}`
}

/** Centro aproximado de una celda, para dibujar la zona en el mapa. */
export function zoneCenter(zoneKey: string): LatLng {
  const [cellStr, latStr, lngStr] = zoneKey.split(':')
  const cellMeters = Number(cellStr)
  const latStep = cellMeters * DEG_PER_METER_LAT
  const lat = (Number(latStr) + 0.5) * latStep
  const lngStep = latStep / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  const lng = (Number(lngStr) + 0.5) * lngStep
  return { lat, lng }
}

export interface Bounds {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

/** Caja envolvente de un radio en metros alrededor de un punto (prefiltro rápido en SQL). */
export function boundsAround({ lat, lng }: LatLng, radiusMeters: number): Bounds {
  const dLat = radiusMeters * DEG_PER_METER_LAT
  const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  return {
    minLat: lat - dLat,
    minLng: lng - dLng,
    maxLat: lat + dLat,
    maxLng: lng + dLng,
  }
}

export function parseBounds(raw: string | null): Bounds | null {
  if (!raw) return null
  const parts = raw.split(',').map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [minLat, minLng, maxLat, maxLng] = parts
  return { minLat, minLng, maxLat, maxLng }
}

/** Centro del área de demostración del MVP: Gran Santo Domingo. */
export const DEMO_CENTER: LatLng = { lat: 18.4861, lng: -69.9312 }
export const DEMO_ZOOM = 12

/**
 * Área cubierta por el MVP. Fuera de aquí no hay datos ni sentido: un punto en
 * (0, 0) —lo que produce un formulario sin GPS— debe rechazarse, no guardarse.
 */
export const DEMO_BOUNDS: Bounds = {
  minLat: 17.9,
  minLng: -70.6,
  maxLat: 19.2,
  maxLng: -69.3,
}

export function isInDemoArea({ lat, lng }: LatLng): boolean {
  return (
    lat >= DEMO_BOUNDS.minLat &&
    lat <= DEMO_BOUNDS.maxLat &&
    lng >= DEMO_BOUNDS.minLng &&
    lng <= DEMO_BOUNDS.maxLng
  )
}

/** Distancia máxima admitida entre origen y destino de una ruta (§15.1). */
export const MAX_ROUTE_DISTANCE_M = 50_000
