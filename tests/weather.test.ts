import { describe, expect, it } from 'vitest'

import { alertFor, unavailableSnapshot } from '@/lib/weather-shared'

describe('Clima (§13)', () => {
  it('los umbrales de aviso caen exactamente donde deben', () => {
    expect(alertFor(0)).toBe('ninguna')
    expect(alertFor(3.9)).toBe('ninguna')
    expect(alertFor(4)).toBe('aviso')
    expect(alertFor(14.9)).toBe('aviso')
    expect(alertFor(15)).toBe('alerta')
    expect(alertFor(39.9)).toBe('alerta')
    expect(alertFor(40)).toBe('emergencia')
    expect(alertFor(200)).toBe('emergencia')
  })

  it('cuando no hay pronóstico devuelve ceros reales, no un valor inventado', () => {
    const snapshot = unavailableSnapshot()
    expect(snapshot.source).toBe('unavailable')
    expect(snapshot.precipitation1hMm).toBe(0)
    expect(snapshot.precipitation3hMm).toBe(0)
    expect(snapshot.precipitation6hMm).toBe(0)
    expect(snapshot.rainProbability).toBe(0)
    expect(snapshot.alert).toBe('ninguna')
    expect(snapshot.summary).toContain('no disponible')
  })

  it('los acumulados son finitos y no negativos', () => {
    const snapshot = unavailableSnapshot()
    for (const value of [
      snapshot.precipitation1hMm,
      snapshot.precipitation3hMm,
      snapshot.precipitation6hMm,
      snapshot.rainProbability,
    ]) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})
