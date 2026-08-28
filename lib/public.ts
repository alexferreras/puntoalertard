// Proyección pública de un incidente.
//
// El §8 y el §11 son explícitos: el mapa público no puede exponer la ruta de la
// evidencia, metadatos del reportante ni notas internas, y debe mostrar zona
// aproximada en lugar de la coordenada exacta. Este módulo es el único sitio que
// decide qué sale al exterior, para que no haya que auditar cada endpoint.

import type { Category, Report, ReportStatus } from './types'

/**
 * 4 decimales ≈ 11 m en esta latitud: suficiente para ubicar la esquina, no para
 * señalar la casa de quien reportó.
 */
const COORDINATE_DECIMALS = 4

const round = (value: number) => Number(value.toFixed(COORDINATE_DECIMALS))

export interface PublicIncident {
  id: string
  createdAt: string
  /** Coordenada aproximada (~11 m), no la posición exacta del reporte. */
  lat: number
  lng: number
  category: Category
  severity: number
  status: ReportStatus
  description: string | null
  zoneKey: string
  aiCategory: Category | null
  aiConfidence: number | null
  confirmedByUser: boolean
  /** Se indica que existe evidencia, sin decir dónde está. */
  hasEvidence: boolean
  resolvedAt: string | null
}

export function toPublicIncident(report: Report): PublicIncident {
  return {
    id: report.id,
    createdAt: report.createdAt,
    lat: round(report.lat),
    lng: round(report.lng),
    category: report.category,
    severity: report.severity,
    status: report.status,
    description: report.description,
    zoneKey: report.zoneKey,
    aiCategory: report.aiCategory,
    aiConfidence: report.aiConfidence,
    confirmedByUser: report.confirmedByUser,
    hasEvidence: report.photoPath !== null,
    resolvedAt: report.resolvedAt,
  }
}

export function toPublicIncidents(reports: Report[]): PublicIncident[] {
  return reports.map(toPublicIncident)
}
