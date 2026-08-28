import { describe, expect, it } from 'vitest'

import {
  DISTANCE_WEIGHTS,
  EXPOSURE_DIVISOR,
  EXPOSURE_RADIUS_M,
  MAX_DETOUR_RATIO,
  ROUTING_VERSION,
  VERIFICATION_WEIGHTS,
  distanceWeight,
  exposureIncidentsFrom,
  scoreExposure,
  verificationOf,
  type ExposureIncident,
  type VerificationLevel,
} from '@/lib/routes'
import type { RiskAssessment } from '@/lib/types'
import { BASE_POINT, makeReport, metersNorth } from './helpers'

function incident(
  offsetMeters: number,
  riskScore = 80,
  verification: VerificationLevel = 'operador',
): ExposureIncident {
  const point = metersNorth(offsetMeters)
  return {
    reportId: `i-${offsetMeters}-${verification}`,
    lat: point.lat,
    lng: point.lng,
    riskScore,
    level: riskScore >= 76 ? 'critico' : riskScore >= 51 ? 'alto' : 'moderado',
    category: 'drenaje_obstruido',
    zoneKey: '150:0:0',
    verification,
  }
}

/** Ruta recta que pasa exactamente por el punto base. */
const RUTA = [
  { lat: BASE_POINT.lat, lng: BASE_POINT.lng - 0.002 },
  BASE_POINT,
  { lat: BASE_POINT.lat, lng: BASE_POINT.lng + 0.002 },
]

describe('Exposure Score — parámetros del §15.2', () => {
  it('usa el radio, los pesos y el divisor del doc', () => {
    expect(EXPOSURE_RADIUS_M).toBe(80)
    expect(DISTANCE_WEIGHTS).toEqual([
      { maxMeters: 20, weight: 1 },
      { maxMeters: 40, weight: 0.7 },
      { maxMeters: 80, weight: 0.4 },
    ])
    expect(VERIFICATION_WEIGHTS).toEqual({ operador: 1, ia: 0.8, sin_verificar: 0.6 })
    expect(EXPOSURE_DIVISOR).toBe(2.5)
    expect(ROUTING_VERSION).toBe('routing-v1')
  })

  it('los tramos de peso por distancia caen en 20, 40 y 80 m', () => {
    expect(distanceWeight(0)).toBe(1)
    expect(distanceWeight(20)).toBe(1)
    expect(distanceWeight(21)).toBe(0.7)
    expect(distanceWeight(40)).toBe(0.7)
    expect(distanceWeight(41)).toBe(0.4)
    expect(distanceWeight(80)).toBe(0.4)
    expect(distanceWeight(81)).toBe(0)
  })
})

describe('Exposure Score — cálculo', () => {
  it('sin incidentes la exposición es 0', () => {
    const exposure = scoreExposure(RUTA, [])
    expect(exposure.score).toBe(0)
    expect(exposure.raw).toBe(0)
    expect(exposure.incidents).toHaveLength(0)
  })

  it('aplica la fórmula del doc: riskScore × pesoDistancia × pesoVerificación / 2.5', () => {
    // 80 × 1.0 × 1.0 = 80 crudo -> round(80 / 2.5) = 32
    const exposure = scoreExposure(RUTA, [incident(5, 80, 'operador')])
    expect(exposure.raw).toBe(80)
    expect(exposure.score).toBe(32)
    expect(exposure.incidents[0].distanceWeight).toBe(1)
    expect(exposure.incidents[0].verificationWeight).toBe(1)
  })

  it('un incidente a 10 m pesa más que uno a 70 m (test exigido por §15.2)', () => {
    const cerca = scoreExposure(RUTA, [incident(10)]).score
    const lejos = scoreExposure(RUTA, [incident(70)]).score
    expect(cerca).toBeGreaterThan(lejos)
    // 1.0 frente a 0.4 sobre el mismo riesgo.
    expect(cerca / lejos).toBeCloseTo(1 / 0.4, 1)
  })

  it('validado por operador pesa más que sin verificar (test exigido por §15.2)', () => {
    const validado = scoreExposure(RUTA, [incident(5, 80, 'operador')]).score
    const ia = scoreExposure(RUTA, [incident(5, 80, 'ia')]).score
    const sinVerificar = scoreExposure(RUTA, [incident(5, 80, 'sin_verificar')]).score
    expect(validado).toBeGreaterThan(ia)
    expect(ia).toBeGreaterThan(sinVerificar)
  })

  it('un incidente más allá de 80 m no cuenta', () => {
    expect(scoreExposure(RUTA, [incident(79)]).incidents).toHaveLength(1)
    expect(scoreExposure(RUTA, [incident(81)]).incidents).toHaveLength(0)
    expect(scoreExposure(RUTA, [incident(81)]).score).toBe(0)
  })

  it('suma los aportes de varios incidentes', () => {
    const exposure = scoreExposure(RUTA, [
      incident(5, 80, 'operador'), // 80
      incident(30, 60, 'ia'), // 60 × 0.7 × 0.8 = 33.6
    ])
    expect(exposure.raw).toBeCloseTo(113.6, 1)
    expect(exposure.score).toBe(Math.round(113.6 / EXPOSURE_DIVISOR))
  })

  it('la exposición está acotada a 100', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => incident(i, 100, 'operador'))
    expect(scoreExposure(RUTA, muchos).score).toBe(100)
  })

  it('cuenta incidentes críticos y altos, y ordena por aporte', () => {
    const exposure = scoreExposure(RUTA, [
      incident(60, 40, 'sin_verificar'),
      incident(5, 90, 'operador'),
      incident(25, 70, 'operador'),
    ])
    expect(exposure.criticalCount).toBe(1)
    expect(exposure.highCount).toBe(1)
    expect(exposure.incidents[0].riskScore).toBe(90)
  })

  it('el umbral para no auto-recomendar es un 40% más lento', () => {
    expect(MAX_DETOUR_RATIO).toBe(1.4)
    const rapida = 600
    expect(839 > rapida * MAX_DETOUR_RATIO).toBe(false)
    expect(841 > rapida * MAX_DETOUR_RATIO).toBe(true)
  })
})

describe('Nivel de verificación de un reporte', () => {
  it('un reporte validado o en curso cuenta como verificado por operador', () => {
    for (const status of ['validado', 'asignado', 'en_proceso'] as const) {
      expect(verificationOf(makeReport({ status }))).toBe('operador')
    }
  })

  it('con clasificación de IA pero sin revisar es `ia`', () => {
    expect(verificationOf({ status: 'reportado', aiEngine: 'claude-vision' })).toBe('ia')
    expect(verificationOf({ status: 'en_revision', aiEngine: 'mock-v1' })).toBe('ia')
  })

  it('sin IA y sin revisar es `sin_verificar`', () => {
    expect(verificationOf({ status: 'reportado', aiEngine: null })).toBe('sin_verificar')
  })
})

describe('Construcción de incidentes desde reportes y zonas', () => {
  const zone = (score: number, reportIds: string[]): RiskAssessment => ({
    zoneKey: 'z1',
    lat: BASE_POINT.lat,
    lng: BASE_POINT.lng,
    radiusMeters: 150,
    neighbourhoodMeters: 100,
    score,
    level: 'alto',
    factors: [],
    reasons: [],
    reportIds,
    computedAt: new Date().toISOString(),
    formulaVersion: 'risk-v1',
    summary: '',
  })

  it('cada incidente hereda el Risk Score de su zona', () => {
    const reports = [makeReport({ id: 'a', status: 'validado' }), makeReport({ id: 'b' })]
    const incidents = exposureIncidentsFrom(reports, [zone(72, ['a', 'b'])])
    expect(incidents).toHaveLength(2)
    expect(incidents.every((i) => i.riskScore === 72)).toBe(true)
    expect(incidents.find((i) => i.reportId === 'a')!.verification).toBe('operador')
  })

  it('un reporte sin zona no genera incidente', () => {
    const incidents = exposureIncidentsFrom([makeReport({ id: 'huerfano' })], [zone(50, ['otro'])])
    expect(incidents).toHaveLength(0)
  })
})
