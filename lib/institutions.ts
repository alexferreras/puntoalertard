// Autenticación y jurisdicción de instituciones (docs/05 §3).
//
// Una institución no se auto-registra: la da de alta un administrador. Aquí solo
// vive cómo se autentica (clave de servidor a servidor, guardada hasheada) y cómo
// se comprueba que un incidente cae en su jurisdicción.

import { createHash, timingSafeEqual } from 'node:crypto'

import { findInstitutionByKeyHash, type InstitutionRow } from './db'
import type { Category } from './types'

/** La clave nunca se guarda en claro: solo su sha256. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Lee la credencial de la petición. Se acepta `Authorization: Bearer` y la
 * cabecera propia, porque los sistemas municipales rara vez pueden elegir.
 */
export function extractApiKey(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null
  }
  return req.headers.get('x-puntoalerta-key')?.trim() || null
}

export function authenticateInstitution(req: Request): InstitutionRow | null {
  const key = extractApiKey(req)
  if (!key) return null
  return findInstitutionByKeyHash(hashApiKey(key))
}

export interface JurisdictionTarget {
  zoneKey: string
  category: Category
}

/** docs/05 §3.4 — jurisdicción por zonas y categorías de las que se hace cargo. */
export function hasJurisdiction(institution: InstitutionRow, target: JurisdictionTarget): boolean {
  const enZona = institution.jurisdiction === 'todas' || institution.zoneKeys.includes(target.zoneKey)
  const enCategoria =
    institution.categories.length === 0 || institution.categories.includes(target.category)
  return enZona && enCategoria
}

/**
 * Si varias instituciones cubren el punto, gana la de jurisdicción más pequeña
 * (la más específica). Sirve para el enrutamiento automático de RF-20.
 */
export function mostSpecific(
  institutions: InstitutionRow[],
  target: JurisdictionTarget,
): InstitutionRow | null {
  const candidatas = institutions.filter((i) => hasJurisdiction(i, target))
  if (candidatas.length === 0) return null
  return candidatas.sort((a, b) => {
    const aSize = a.jurisdiction === 'todas' ? Number.MAX_SAFE_INTEGER : a.zoneKeys.length
    const bSize = b.jurisdiction === 'todas' ? Number.MAX_SAFE_INTEGER : b.zoneKeys.length
    if (aSize !== bSize) return aSize - bSize
    // A igual tamaño, la que declara menos categorías es la más específica.
    const aCats = a.categories.length === 0 ? Number.MAX_SAFE_INTEGER : a.categories.length
    const bCats = b.categories.length === 0 ? Number.MAX_SAFE_INTEGER : b.categories.length
    return aCats - bCats
  })[0]
}

/** Comparación en tiempo constante, para verificar firmas de webhook. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
