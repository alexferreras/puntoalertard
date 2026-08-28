// Máquina de estados del reporte (RF-15, §16 del doc de estándares).
//
// Vive aparte del route handler para poder fijar en tests cada transición
// permitida y cada una prohibida. El grafo NO es lineal: el doc permite
// reasignar (asignado → validado, en_proceso → asignado), así que no basta con
// comparar posiciones en una lista.

import { STATUS_LABELS, type ReportStatus } from './types'

/** §16 — grafo autoritativo. Lo que no está aquí, no se puede hacer. */
export const ALLOWED_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  reportado: ['en_revision', 'derivado', 'validado', 'descartado', 'duplicado'],
  en_revision: ['derivado', 'validado', 'descartado', 'duplicado'],
  // docs/05 §3.4 — derivado espera que la institución acepte o rechace.
  derivado: ['validado', 'descartado', 'duplicado'],
  validado: ['asignado', 'descartado'],
  asignado: ['en_proceso', 'validado'],
  en_proceso: ['resuelto', 'asignado'],
  resuelto: [],
  descartado: [],
  duplicado: [],
}

/** Estados de los que no se sale. Un incidente terminal deja de estar activo. */
export const TERMINAL_STATUSES: ReportStatus[] = ['resuelto', 'descartado', 'duplicado']

/** Cerrar un incidente exige justificarlo: queda en el historial de auditoría. */
export const NOTE_REQUIRED_STATUSES: ReportStatus[] = ['resuelto', 'descartado', 'duplicado']

export const MIN_NOTE_CHARS = 10
export const MAX_NOTE_CHARS = 280

/** Antes de validar, el operador aún puede corregir categoría y severidad (§16). */
export const CORRECTABLE_STATUSES: ReportStatus[] = ['reportado', 'en_revision', 'derivado']

export function isTerminal(status: ReportStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function isActive(status: ReportStatus): boolean {
  return !isTerminal(status)
}

export function requiresNote(status: ReportStatus): boolean {
  return NOTE_REQUIRED_STATUSES.includes(status)
}

export function allowsCorrection(status: ReportStatus): boolean {
  return CORRECTABLE_STATUSES.includes(status)
}

export function nextStatuses(status: ReportStatus): ReportStatus[] {
  return ALLOWED_TRANSITIONS[status]
}

export interface TransitionResult {
  allowed: boolean
  reason?: string
}

export function canTransition(
  from: ReportStatus,
  to: ReportStatus,
  note?: string | null,
): TransitionResult {
  if (from === to) {
    return { allowed: false, reason: `El reporte ya está en estado ${STATUS_LABELS[from].toLowerCase()}.` }
  }
  if (isTerminal(from)) {
    return {
      allowed: false,
      reason: `${STATUS_LABELS[from]} es un estado terminal: no admite más cambios.`,
    }
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    const opciones = ALLOWED_TRANSITIONS[from].map((s) => STATUS_LABELS[s].toLowerCase()).join(', ')
    return {
      allowed: false,
      reason: `Transición no permitida: ${STATUS_LABELS[from].toLowerCase()} → ${STATUS_LABELS[
        to
      ].toLowerCase()}. Desde aquí solo se puede pasar a: ${opciones}.`,
    }
  }
  if (requiresNote(to)) {
    const length = note?.trim().length ?? 0
    if (length < MIN_NOTE_CHARS) {
      return {
        allowed: false,
        reason: `Cerrar como ${STATUS_LABELS[
          to
        ].toLowerCase()} exige una nota de al menos ${MIN_NOTE_CHARS} caracteres explicando la resolución.`,
      }
    }
    if (length > MAX_NOTE_CHARS) {
      return { allowed: false, reason: `La nota supera ${MAX_NOTE_CHARS} caracteres.` }
    }
  }
  return { allowed: true }
}
