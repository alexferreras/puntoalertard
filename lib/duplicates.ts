// Detección de duplicados (RF-09, §11).
//
// Dos señales: duplicado exacto de evidencia (hash sha256) y proximidad
// espacio-temporal con categoría compatible. El scoring y la decisión son
// funciones puras para poder fijar en tests los límites exactos del doc
// (20 m, 60 m, 3 h, 24 h).

import { reportsNear, reportsWithPhotoHash } from './db'
import { haversineMeters, type LatLng } from './geo'
import { isActive } from './status'
import type { Category, Report } from './types'

/** §11 — parámetros de la búsqueda de candidatos. */
export const DUPLICATE_RADIUS_M = 60
export const DUPLICATE_WINDOW_HOURS = 24
export const NEAR_DISTANCE_M = 20
export const RECENT_HOURS = 3

/** §11 — umbrales de decisión. */
export const ATTACH_THRESHOLD = 80
export const POSSIBLE_THRESHOLD = 50

/** Aportes al score. Son escalones excluyentes, no acumulables entre sí. */
export const DUPLICATE_POINTS = {
  exactHash: 100,
  near: 50,
  within: 30,
  sameCategory: 30,
  compatibleCategory: 15,
  recent: 20,
  sameWindow: 10,
} as const

/**
 * Pares que el doc considera compatibles: una acumulación de basura y un
 * imbornal tapado suelen ser el mismo problema visto de dos maneras.
 */
export const COMPATIBLE_CATEGORIES: [Category, Category][] = [
  ['basura', 'drenaje_obstruido'],
  ['inundacion', 'drenaje_obstruido'],
]

/**
 * §11 — una quema nunca se fusiona por categoría compatible: confundir un
 * incendio con otro incidente es un error de otra magnitud. Exige misma
 * categoría o hash idéntico.
 */
const NEVER_MERGE_BY_COMPATIBILITY: Category[] = ['quema']

export function areCompatible(a: Category, b: Category): boolean {
  if (a === b) return true
  return COMPATIBLE_CATEGORIES.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  )
}

export interface CandidateInput {
  point: LatLng
  category: Category
  /** sha256 de la evidencia, si el reporte trae foto. */
  photoSha256?: string | null
  excludeId?: string
  now?: number
}

export interface DuplicateCandidate {
  reportId: string
  score: number
  distanceMeters: number
  ageHours: number
  sameCategory: boolean
  sameHash: boolean
  /** `true` si solo puede llegar a "posible duplicado" por la regla de quema. */
  blockedFromAttach: boolean
  reasons: string[]
  status: Report['status']
  createdAt: string
  description: string | null
}

/**
 * Puntúa un reporte existente como candidato. Devuelve `null` si no llega a ser
 * candidato: fuera de radio, fuera de ventana, cerrado o categoría incompatible.
 */
export function scoreCandidate(
  existing: Report,
  { point, category, photoSha256 = null, excludeId = '', now = Date.now() }: CandidateInput,
): DuplicateCandidate | null {
  if (existing.id === excludeId) return null
  if (!isActive(existing.status)) return null

  const ageHours = (now - new Date(existing.createdAt).getTime()) / 3_600_000
  if (ageHours < 0 || ageHours > DUPLICATE_WINDOW_HOURS) return null

  const distanceMeters = haversineMeters(point, { lat: existing.lat, lng: existing.lng })
  const sameHash = Boolean(photoSha256 && existing.photoSha256 === photoSha256)

  // El hash idéntico es candidato aunque esté fuera del radio: es la misma foto.
  if (distanceMeters > DUPLICATE_RADIUS_M && !sameHash) return null

  const sameCategory = existing.category === category
  const compatible = !sameCategory && areCompatible(existing.category, category)
  if (!sameCategory && !compatible && !sameHash) return null

  const reasons: string[] = []
  let score = 0

  if (sameHash) {
    score += DUPLICATE_POINTS.exactHash
    reasons.push('la misma fotografía ya fue enviada')
  }
  if (distanceMeters <= NEAR_DISTANCE_M) {
    score += DUPLICATE_POINTS.near
    reasons.push(`a ${Math.round(distanceMeters)} m del reporte existente`)
  } else if (distanceMeters <= DUPLICATE_RADIUS_M) {
    score += DUPLICATE_POINTS.within
    reasons.push(`a ${Math.round(distanceMeters)} m del reporte existente`)
  }
  if (sameCategory) {
    score += DUPLICATE_POINTS.sameCategory
    reasons.push('misma categoría')
  } else if (compatible) {
    score += DUPLICATE_POINTS.compatibleCategory
    reasons.push('categoría compatible')
  }
  if (ageHours <= RECENT_HOURS) {
    score += DUPLICATE_POINTS.recent
    reasons.push(`reportado hace menos de ${RECENT_HOURS} h`)
  } else {
    score += DUPLICATE_POINTS.sameWindow
    reasons.push(`reportado en las últimas ${DUPLICATE_WINDOW_HOURS} h`)
  }

  const blockedFromAttach =
    !sameHash &&
    !sameCategory &&
    (NEVER_MERGE_BY_COMPATIBILITY.includes(category) ||
      NEVER_MERGE_BY_COMPATIBILITY.includes(existing.category))

  return {
    reportId: existing.id,
    score,
    distanceMeters: Math.round(distanceMeters),
    ageHours: Number(ageHours.toFixed(2)),
    sameCategory,
    sameHash,
    blockedFromAttach,
    reasons,
    status: existing.status,
    createdAt: existing.createdAt,
    description: existing.description,
  }
}

export type DuplicateDecision = 'adjuntar' | 'posible_duplicado' | 'nuevo'

/** §11 — >=80 adjunta, 50-79 marca posible duplicado, <50 es un incidente nuevo. */
export function decide(candidate: DuplicateCandidate | null): DuplicateDecision {
  if (!candidate) return 'nuevo'
  if (candidate.score >= ATTACH_THRESHOLD) {
    return candidate.blockedFromAttach ? 'posible_duplicado' : 'adjuntar'
  }
  if (candidate.score >= POSSIBLE_THRESHOLD) return 'posible_duplicado'
  return 'nuevo'
}

export interface DuplicateEvaluation {
  decision: DuplicateDecision
  best: DuplicateCandidate | null
  candidates: DuplicateCandidate[]
}

/** Elige el mejor candidato: más score y, a igual score, más cerca. */
export function bestOf(candidates: DuplicateCandidate[]): DuplicateCandidate | null {
  return (
    [...candidates].sort(
      (a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters,
    )[0] ?? null
  )
}

/** Evalúa contra los reportes guardados. La parte que toca la base de datos. */
export function evaluateDuplicates(input: CandidateInput): DuplicateEvaluation {
  const nearby = reportsNear(input.point, DUPLICATE_RADIUS_M)
  const byHash = input.photoSha256 ? reportsWithPhotoHash(input.photoSha256) : []

  const seen = new Set<string>()
  const pool: Report[] = []
  for (const report of [...nearby, ...byHash]) {
    if (seen.has(report.id)) continue
    seen.add(report.id)
    pool.push(report)
  }

  const candidates = pool
    .map((report) => scoreCandidate(report, input))
    .filter((c): c is DuplicateCandidate => c !== null)

  const best = bestOf(candidates)
  return { decision: decide(best), best, candidates: candidates.sort((a, b) => b.score - a.score) }
}
