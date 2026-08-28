import { describe, expect, it } from 'vitest'

import { RISK_FORMULA_VERSION, computeRisk, weatherScore } from '@/lib/risk'
import { demoReports } from '@/lib/seed'
import { riskLevelFor } from '@/lib/types'
import {
  BASE_POINT,
  DRY,
  HEAVY_RAIN,
  NO_WEATHER,
  NOW,
  makeReport,
  makeWeather,
} from './helpers'

const assess = (reports: Parameters<typeof computeRisk>[0]['reports'], weather = DRY) =>
  computeRisk({ zoneKey: '150:0:0', reports, weather, now: NOW, center: BASE_POINT })

describe('Risk Engine — fórmula risk-v1 (§12)', () => {
  it('sin reportes y sin lluvia, el score es 0 y el nivel bajo', () => {
    const risk = assess([])
    expect(risk.score).toBe(0)
    expect(risk.level).toBe('bajo')
    expect(risk.formulaVersion).toBe(RISK_FORMULA_VERSION)
    for (const factor of risk.factors) expect(factor.score).toBe(0)
  })

  it('con todos los factores al máximo, el score es 100 y crítico', () => {
    // 5 reportes recientes (recurrencia 100), 6 en 180 días (historial 100),
    // severidad 10, contexto con todos los agravantes y lluvia >= 30 mm.
    const reports = [
      makeReport({ category: 'drenaje_obstruido', severity: 10, hoursAgo: 1, mainRoad: true }),
      makeReport({ category: 'inundacion', severity: 9, hoursAgo: 2 }),
      makeReport({ category: 'via_bloqueada', severity: 8, hoursAgo: 3 }),
      makeReport({ category: 'basura', severity: 7, hoursAgo: 4 }),
      makeReport({ category: 'basura', severity: 6, daysAgo: 5 }),
      makeReport({ category: 'basura', severity: 5, daysAgo: 100 }),
    ]
    const risk = computeRisk({
      zoneKey: '150:0:0',
      reports,
      weather: HEAVY_RAIN,
      now: NOW,
      center: BASE_POINT,
      alertFlag: true,
    })
    expect(risk.score).toBe(100)
    expect(risk.level).toBe('critico')
  })

  it('el score nunca sale de 0..100 aunque el contexto se acumule de más', () => {
    // 20 + 30 + 20 + 20 + 30 = 120 puntos de contexto: debe recortarse a 100.
    const reports = [
      makeReport({ category: 'drenaje_obstruido', severity: 10, hoursAgo: 1, mainRoad: true }),
      makeReport({ category: 'inundacion', severity: 10, hoursAgo: 2 }),
      makeReport({ category: 'via_bloqueada', severity: 10, hoursAgo: 3 }),
      makeReport({ category: 'quema', severity: 10, hoursAgo: 4 }),
      makeReport({ category: 'otro', severity: 10, hoursAgo: 5 }),
    ]
    const risk = computeRisk({
      zoneKey: '150:0:0',
      reports,
      weather: HEAVY_RAIN,
      now: NOW,
      center: BASE_POINT,
      alertFlag: true,
    })
    expect(risk.score).toBeGreaterThanOrEqual(0)
    expect(risk.score).toBeLessThanOrEqual(100)
    const contexto = risk.factors.find((f) => f.key === 'contexto')!
    expect(contexto.score).toBe(100)
  })

  it('los límites de nivel caen exactamente donde dice el §12.3', () => {
    expect(riskLevelFor(0)).toBe('bajo')
    expect(riskLevelFor(25)).toBe('bajo')
    expect(riskLevelFor(26)).toBe('moderado')
    expect(riskLevelFor(50)).toBe('moderado')
    expect(riskLevelFor(51)).toBe('alto')
    expect(riskLevelFor(75)).toBe('alto')
    expect(riskLevelFor(76)).toBe('critico')
    expect(riskLevelFor(100)).toBe('critico')
  })

  it('los escalones del factor de lluvia son los del §12.2', () => {
    expect(weatherScore(0)).toBe(0)
    expect(weatherScore(0.9)).toBe(0)
    expect(weatherScore(1)).toBe(25)
    expect(weatherScore(4.9)).toBe(25)
    expect(weatherScore(5)).toBe(50)
    expect(weatherScore(14.9)).toBe(50)
    expect(weatherScore(15)).toBe(75)
    expect(weatherScore(29.9)).toBe(75)
    expect(weatherScore(30)).toBe(100)
    expect(weatherScore(120)).toBe(100)
  })

  it('sin pronóstico el factor de lluvia es 0 y la razón no menciona el clima (§12.5)', () => {
    const reports = [makeReport({ category: 'drenaje_obstruido', severity: 8, hoursAgo: 2 })]
    const risk = assess(reports, NO_WEATHER)
    const lluvia = risk.factors.find((f) => f.key === 'lluvia_prevista')!
    expect(lluvia.score).toBe(0)
    expect(risk.reasons.join(' ')).not.toMatch(/mm/)
  })

  it('es determinista: la misma entrada da el mismo score y las mismas razones', () => {
    const reports = [
      makeReport({ id: 'a', category: 'drenaje_obstruido', severity: 8, hoursAgo: 3 }),
      makeReport({ id: 'b', category: 'basura', severity: 5, daysAgo: 2 }),
    ]
    const first = assess(reports, HEAVY_RAIN)
    const second = assess(reports, HEAVY_RAIN)
    expect(second.score).toBe(first.score)
    expect(second.reasons).toEqual(first.reasons)
  })

  it('cambiar solo el clima no altera ningún factor no meteorológico', () => {
    const reports = [
      makeReport({ category: 'drenaje_obstruido', severity: 9, hoursAgo: 6, mainRoad: true }),
      makeReport({ category: 'basura', severity: 6, daysAgo: 2 }),
    ]
    const seco = assess(reports, DRY)
    const lluvia = assess(reports, HEAVY_RAIN)

    for (const key of ['severidad_observada', 'recurrencia_reciente', 'historial_punto', 'contexto'] as const) {
      const antes = seco.factors.find((f) => f.key === key)!
      const despues = lluvia.factors.find((f) => f.key === key)!
      expect(despues.score).toBe(antes.score)
    }
    // La diferencia total es exactamente el aporte del factor meteorológico.
    expect(lluvia.score - seco.score).toBe(20)
  })

  it('un punto sin historial ni recurrencia no llega a crítico solo por lluvia', () => {
    const reports = [makeReport({ category: 'basura', severity: 5, hoursAgo: 1 })]
    const risk = assess(reports, makeWeather(120))
    expect(risk.score).toBeLessThan(76)
    expect(risk.level).not.toBe('critico')
  })

  it('los reportes resueltos cuentan en el historial pero no en la severidad observada', () => {
    const resueltos = [
      makeReport({ status: 'resuelto', category: 'drenaje_obstruido', severity: 10, daysAgo: 30 }),
      makeReport({ status: 'resuelto', category: 'inundacion', severity: 9, daysAgo: 60 }),
    ]
    const risk = assess(resueltos)

    const severidad = risk.factors.find((f) => f.key === 'severidad_observada')!
    const historial = risk.factors.find((f) => f.key === 'historial_punto')!
    const contexto = risk.factors.find((f) => f.key === 'contexto')!

    expect(severidad.score).toBe(0)
    expect(historial.score).toBe(30)
    // El contexto también mira solo incidentes abiertos.
    expect(contexto.score).toBe(0)
  })

  it('la recurrencia solo cuenta los 14 días y el historial los 180 (§12.2)', () => {
    const dentro = assess([
      makeReport({ daysAgo: 13 }),
      makeReport({ daysAgo: 13 }),
    ])
    expect(dentro.factors.find((f) => f.key === 'recurrencia_reciente')!.score).toBe(40)

    const fuera = assess([makeReport({ daysAgo: 15 }), makeReport({ daysAgo: 20 })])
    expect(fuera.factors.find((f) => f.key === 'recurrencia_reciente')!.score).toBe(0)
    expect(fuera.factors.find((f) => f.key === 'historial_punto')!.score).toBe(30)

    const antiguo = assess([makeReport({ daysAgo: 181 })])
    expect(antiguo.factors.find((f) => f.key === 'historial_punto')!.score).toBe(0)
  })

  it('la vecindad de recurrencia e historial es de 100 m', () => {
    const cerca = assess([makeReport({ hoursAgo: 1, lat: BASE_POINT.lat + 99 / 111_320 })])
    expect(cerca.factors.find((f) => f.key === 'recurrencia_reciente')!.score).toBe(20)

    const lejos = assess([makeReport({ hoursAgo: 1, lat: BASE_POINT.lat + 101 / 111_320 })])
    expect(lejos.factors.find((f) => f.key === 'recurrencia_reciente')!.score).toBe(0)
  })

  it('las razones son 1 a 3, ordenadas por contribución (§12.4)', () => {
    const reports = [
      makeReport({ category: 'drenaje_obstruido', severity: 9, hoursAgo: 6, mainRoad: true }),
      makeReport({ category: 'basura', severity: 6, daysAgo: 2 }),
    ]
    const risk = assess(reports, HEAVY_RAIN)
    expect(risk.reasons.length).toBeGreaterThanOrEqual(1)
    expect(risk.reasons.length).toBeLessThanOrEqual(3)

    const ordenados = [...risk.factors]
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score * b.weight - a.score * a.weight)
    expect(risk.reasons[0].toLowerCase()).toContain(
      ordenados[0].key === 'severidad_observada' ? 'severidad' : ordenados[0].label.split(' ')[0].toLowerCase(),
    )
  })
})

describe('Escenario de la demo — Av. México', () => {
  const zoneOf = (now: Date) => {
    const reports = demoReports(now.getTime()).filter((r) => r.description?.includes('Av. México'))
    return (weather: Parameters<typeof computeRisk>[0]['weather']) =>
      computeRisk({
        zoneKey: '150:0:0',
        reports,
        weather,
        now,
        center: BASE_POINT,
      })
  }

  it('tiene los seis reportes calibrados', () => {
    const reports = demoReports(NOW.getTime()).filter((r) => r.description?.includes('Av. México'))
    expect(reports).toHaveLength(6)
    expect(reports.every((r) => r.mainRoad)).toBe(true)
  })

  it('en seco da 64 y nivel alto: la zona ya requiere atención', () => {
    const risk = zoneOf(NOW)(DRY)
    expect(risk.score).toBe(64)
    expect(risk.level).toBe('alto')
  })

  it('con lluvia intensa da 84 y nivel crítico', () => {
    const risk = zoneOf(NOW)(HEAVY_RAIN)
    expect(risk.score).toBe(84)
    expect(risk.level).toBe('critico')
  })

  it('el salto de 64 a 84 lo aporta íntegramente el factor meteorológico', () => {
    const evaluar = zoneOf(NOW)
    const seco = evaluar(DRY)
    const lluvia = evaluar(HEAVY_RAIN)
    const aporte = (r: typeof seco, key: string) => {
      const f = r.factors.find((factor) => factor.key === key)!
      return f.score * f.weight
    }
    expect(lluvia.score - seco.score).toBe(20)
    expect(aporte(lluvia, 'lluvia_prevista') - aporte(seco, 'lluvia_prevista')).toBe(20)
  })
})
