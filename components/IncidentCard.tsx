'use client'

import { useState } from 'react'

import { CategoryChip, ConfidenceBadge, RiskBadge, StatusBadge } from '@/components/badges'
import { plural, relativeTime } from '@/lib/format'
import type { PublicIncident } from '@/lib/public'
import { MAX_NOTE_CHARS, MIN_NOTE_CHARS, nextStatuses, requiresNote } from '@/lib/status'
import { STATUS_LABELS, type ReportStatus, type RiskAssessment } from '@/lib/types'

export function IncidentCard({
  report,
  zone,
  priority,
  selected,
  busy,
  canAct,
  onSelect,
  onAdvance,
}: {
  report: PublicIncident
  zone: RiskAssessment | null
  priority: number
  selected: boolean
  busy: boolean
  /** Sin sesión de operador la tarjeta es de solo lectura (§8). */
  canAct: boolean
  onSelect: () => void
  onAdvance: (status: ReportStatus, note?: string) => void
}) {
  const [pending, setPending] = useState<ReportStatus | null>(null)
  const [note, setNote] = useState('')
  const options = nextStatuses(report.status)
  const recurrence = zone?.reportIds.length ?? 1
  const noteTooShort = note.trim().length < MIN_NOTE_CHARS

  return (
    <li
      // El id permite que el dashboard traiga la tarjeta a la vista cuando la
      // selección llega del mapa.
      id={`incidente-${report.id}`}
      className={`scroll-mt-4 rounded-[var(--radius-card)] border bg-white p-4 transition ${
        selected
          ? 'border-purple-700 shadow-[0_0_0_3px_rgba(83,34,117,0.12)]'
          : 'border-line shadow-[0_1px_2px_rgba(36,23,45,0.04)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Prioridad {priority}
          </p>
          <button
            type="button"
            onClick={onSelect}
            className="mt-0.5 block text-left text-sm font-semibold text-ink underline-offset-2 hover:underline"
          >
            {report.description ?? 'Reporte sin descripción'}
          </button>
        </div>
        {zone && <RiskBadge level={zone.level} score={zone.score} size="sm" />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <CategoryChip category={report.category} />
        <StatusBadge status={report.status} />
        {report.aiConfidence !== null && <ConfidenceBadge confidence={report.aiConfidence} />}
        <span className="text-xs text-muted">Severidad {report.severity}/10</span>
      </div>

      <p className="mt-2 text-xs text-muted">
        {relativeTime(report.createdAt)} · {plural(recurrence, 'reporte')} en la zona
        {recurrence > 1 && <span className="font-medium text-gold-700"> · punto recurrente</span>}
        {report.confirmedByUser && ' · categoría confirmada por la ciudadanía'}
      </p>

      {zone && (
        <p className="mt-2 text-xs text-ink">
          {[...zone.factors].sort((a, b) => b.score * b.weight - a.score * a.weight)[0].explanation}
        </p>
      )}

      {canAct && options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => {
                if (requiresNote(option)) {
                  setPending(option)
                  return
                }
                onAdvance(option)
              }}
              className={`min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-semibold disabled:opacity-60 ${
                option === 'descartado' || option === 'duplicado'
                  ? 'border border-line text-ink'
                  : 'bg-purple-700 text-white'
              }`}
            >
              {busy ? 'Actualizando…' : STATUS_LABELS[option]}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-[var(--radius-control)] bg-canvas p-3">
          <label htmlFor={`nota-${report.id}`} className="block text-xs font-medium text-ink">
            Cerrar como {STATUS_LABELS[pending].toLowerCase()} exige una nota de {MIN_NOTE_CHARS} a{' '}
            {MAX_NOTE_CHARS} caracteres.
          </label>
          <textarea
            id={`nota-${report.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={MAX_NOTE_CHARS}
            placeholder="Ej.: brigada limpió el imbornal y retiró los residuos."
            className="mt-1.5 w-full rounded-[var(--radius-control)] border border-line px-2 py-1.5 text-sm"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || noteTooShort}
              onClick={() => {
                onAdvance(pending, note.trim())
                setPending(null)
                setNote('')
              }}
              className="min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null)
                setNote('')
              }}
              className="min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-medium text-muted"
            >
              Cancelar
            </button>
            <span className="text-xs text-muted tabular-nums">
              {note.trim().length}/{MAX_NOTE_CHARS}
            </span>
          </div>
        </div>
      )}
    </li>
  )
}
