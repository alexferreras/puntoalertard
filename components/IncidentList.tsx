'use client'

import { CategoryChip, RiskBadge, StatusBadge } from '@/components/badges'
import { relativeTime } from '@/lib/format'
import type { PublicIncident } from '@/lib/public'
import type { RiskAssessment } from '@/lib/types'

/**
 * §22.5 — alternativa textual del mapa. Un mapa Leaflet no es navegable con
 * teclado ni con lector de pantalla, así que la misma información va en una lista
 * de botones enfocables. No es un extra de accesibilidad: es la única forma de
 * usar la pantalla sin ratón.
 */
export function IncidentList({
  reports,
  zones,
  selectedId,
  onSelect,
}: {
  reports: PublicIncident[]
  zones: RiskAssessment[]
  selectedId?: string | null
  onSelect?: (report: PublicIncident) => void
}) {
  const zoneOf = new Map<string, RiskAssessment>()
  for (const zone of zones) {
    for (const id of zone.reportIds) zoneOf.set(id, zone)
  }

  const ordered = [...reports].sort((a, b) => {
    const scoreA = zoneOf.get(a.id)?.score ?? 0
    const scoreB = zoneOf.get(b.id)?.score ?? 0
    return scoreB - scoreA
  })

  return (
    <section
      aria-label="Lista de incidentes del mapa"
      className="rounded-[var(--radius-card)] border border-line bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-ink">Incidentes en el mapa</h2>
      <p className="mt-1 text-xs text-muted">
        Misma información que el mapa, navegable con teclado. Ordenada por riesgo de la zona.
      </p>

      {ordered.length === 0 && <p className="mt-2 text-sm text-muted">No hay incidentes en el área.</p>}

      <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
        {ordered.map((report) => {
          const zone = zoneOf.get(report.id)
          return (
            <li key={report.id}>
              <button
                type="button"
                onClick={() => onSelect?.(report)}
                aria-current={report.id === selectedId ? 'true' : undefined}
                className={`w-full rounded-[var(--radius-control)] border px-3 py-2 text-left transition ${
                  report.id === selectedId
                    ? 'border-purple-700 bg-purple-700/5'
                    : 'border-line hover:border-purple-500'
                }`}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <CategoryChip category={report.category} />
                  <StatusBadge status={report.status} />
                  {zone && <RiskBadge level={zone.level} score={zone.score} size="sm" />}
                </span>
                <span className="mt-1 block text-sm text-ink">
                  {report.description ?? 'Reporte sin descripción'}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Severidad {report.severity}/10 · {relativeTime(report.createdAt)} ·{' '}
                  {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
