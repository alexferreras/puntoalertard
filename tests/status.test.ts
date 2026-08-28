import { describe, expect, it } from 'vitest'

import {
  ALLOWED_TRANSITIONS,
  MIN_NOTE_CHARS,
  allowsCorrection,
  canTransition,
  isActive,
  isTerminal,
  nextStatuses,
  requiresNote,
} from '@/lib/status'
import { STATUSES, type ReportStatus } from '@/lib/types'

const NOTA = 'Brigada limpió el imbornal y retiró los residuos.'

/** Todos los pares (from, to) que el §16 NO permite. */
const prohibidas: [ReportStatus, ReportStatus][] = STATUSES.flatMap((from) =>
  STATUSES.filter((to) => to !== from && !ALLOWED_TRANSITIONS[from].includes(to)).map(
    (to) => [from, to] as [ReportStatus, ReportStatus],
  ),
)

const permitidas: [ReportStatus, ReportStatus][] = STATUSES.flatMap((from) =>
  ALLOWED_TRANSITIONS[from].map((to) => [from, to] as [ReportStatus, ReportStatus]),
)

describe('Máquina de estados (RF-15, §16)', () => {
  it('el grafo es exactamente el del §16', () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      reportado: ['en_revision', 'derivado', 'validado', 'descartado', 'duplicado'],
      en_revision: ['derivado', 'validado', 'descartado', 'duplicado'],
      derivado: ['validado', 'descartado', 'duplicado'],
      validado: ['asignado', 'descartado'],
      asignado: ['en_proceso', 'validado'],
      en_proceso: ['resuelto', 'asignado'],
      resuelto: [],
      descartado: [],
      duplicado: [],
    })
  })

  it.each(permitidas)('permite %s → %s', (from, to) => {
    expect(canTransition(from, to, NOTA).allowed).toBe(true)
  })

  it.each(prohibidas)('rechaza %s → %s', (from, to) => {
    const result = canTransition(from, to, NOTA)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it.each(STATUSES.map((s) => [s]))('rechaza la transición de %s a sí mismo', (status) => {
    expect(canTransition(status, status, NOTA).allowed).toBe(false)
  })

  it('un incidente derivado espera que la institución acepte o rechace', () => {
    expect(canTransition('derivado', 'validado').allowed).toBe(true)
    expect(canTransition('derivado', 'descartado', NOTA).allowed).toBe(true)
    // No puede saltar directamente a en proceso ni volver a reportado.
    expect(canTransition('derivado', 'en_proceso').allowed).toBe(false)
    expect(canTransition('derivado', 'reportado').allowed).toBe(false)
  })

  it('permite reasignar hacia atrás, que el doc sí contempla', () => {
    // Son los dos casos que una regla de "solo avanza" habría bloqueado mal.
    expect(canTransition('asignado', 'validado').allowed).toBe(true)
    expect(canTransition('en_proceso', 'asignado').allowed).toBe(true)
  })

  it('desde un estado terminal no sale ninguna transición', () => {
    for (const from of ['resuelto', 'descartado', 'duplicado'] as ReportStatus[]) {
      expect(isTerminal(from)).toBe(true)
      expect(isActive(from)).toBe(false)
      expect(nextStatuses(from)).toEqual([])
      for (const to of STATUSES) {
        expect(canTransition(from, to, NOTA).allowed).toBe(false)
      }
    }
  })

  it('los estados no terminales están activos', () => {
    for (const status of [
      'reportado',
      'en_revision',
      'derivado',
      'validado',
      'asignado',
      'en_proceso',
    ] as ReportStatus[]) {
      expect(isActive(status)).toBe(true)
    }
  })

  it('cerrar un incidente exige una nota de al menos 10 caracteres', () => {
    for (const to of ['resuelto', 'descartado', 'duplicado'] as ReportStatus[]) {
      expect(requiresNote(to)).toBe(true)
    }
    expect(canTransition('en_proceso', 'resuelto').allowed).toBe(false)
    expect(canTransition('en_proceso', 'resuelto', '').allowed).toBe(false)
    expect(canTransition('en_proceso', 'resuelto', 'a'.repeat(MIN_NOTE_CHARS - 1)).allowed).toBe(false)
    expect(canTransition('en_proceso', 'resuelto', 'a'.repeat(MIN_NOTE_CHARS)).allowed).toBe(true)
    expect(canTransition('en_proceso', 'resuelto', 'a'.repeat(280)).allowed).toBe(true)
    expect(canTransition('en_proceso', 'resuelto', 'a'.repeat(281)).allowed).toBe(false)
  })

  it('las transiciones que no cierran no exigen nota', () => {
    expect(requiresNote('validado')).toBe(false)
    expect(canTransition('reportado', 'validado').allowed).toBe(true)
    expect(canTransition('validado', 'asignado').allowed).toBe(true)
  })

  it('la severidad solo se corrige antes de validar (§16)', () => {
    expect(allowsCorrection('reportado')).toBe(true)
    expect(allowsCorrection('en_revision')).toBe(true)
    // Un incidente derivado sigue pendiente de que la institución lo acepte.
    expect(allowsCorrection('derivado')).toBe(true)
    expect(allowsCorrection('validado')).toBe(false)
    expect(allowsCorrection('asignado')).toBe(false)
    expect(allowsCorrection('en_proceso')).toBe(false)
    expect(allowsCorrection('resuelto')).toBe(false)
  })

  it('el mensaje de rechazo dice qué transiciones sí se pueden hacer', () => {
    const reason = canTransition('validado', 'resuelto', NOTA).reason!
    expect(reason).toContain('asignado')
  })
})
