import { describe, expect, it } from 'vitest'

import {
  ATTACH_THRESHOLD,
  DUPLICATE_POINTS,
  DUPLICATE_RADIUS_M,
  DUPLICATE_WINDOW_HOURS,
  NEAR_DISTANCE_M,
  POSSIBLE_THRESHOLD,
  RECENT_HOURS,
  areCompatible,
  bestOf,
  decide,
  scoreCandidate,
} from '@/lib/duplicates'
import { BASE_POINT, NOW, makeReport, metersNorth } from './helpers'

const now = NOW.getTime()
const evaluate = (
  existing: Parameters<typeof scoreCandidate>[0],
  overrides: Partial<Parameters<typeof scoreCandidate>[1]> = {},
) => scoreCandidate(existing, { point: BASE_POINT, category: 'basura', now, ...overrides })

describe('Duplicados — parámetros del §11', () => {
  it('usa el radio y la ventana del doc', () => {
    expect(DUPLICATE_RADIUS_M).toBe(60)
    expect(DUPLICATE_WINDOW_HOURS).toBe(24)
    expect(NEAR_DISTANCE_M).toBe(20)
    expect(RECENT_HOURS).toBe(3)
    expect(ATTACH_THRESHOLD).toBe(80)
    expect(POSSIBLE_THRESHOLD).toBe(50)
  })

  it('los aportes al score son los del doc', () => {
    expect(DUPLICATE_POINTS).toEqual({
      exactHash: 100,
      near: 50,
      within: 30,
      sameCategory: 30,
      compatibleCategory: 15,
      recent: 20,
      sameWindow: 10,
    })
  })
})

describe('Duplicados — límites exactos de distancia (§22.2)', () => {
  const at = (meters: number) => {
    const point = metersNorth(meters)
    return evaluate(makeReport({ lat: point.lat, lng: point.lng, hoursAgo: 1 }))
  }

  it('19 y 20 m puntúan como cercano; 21 m ya no', () => {
    expect(at(19)!.score).toBe(50 + 30 + 20)
    expect(at(20)!.score).toBe(50 + 30 + 20)
    expect(at(21)!.score).toBe(30 + 30 + 20)
  })

  it('59 y 60 m siguen dentro del radio; 61 m deja de ser candidato', () => {
    expect(at(59)!.score).toBe(30 + 30 + 20)
    expect(at(60)!.score).toBe(30 + 30 + 20)
    expect(at(61)).toBeNull()
  })
})

describe('Duplicados — límites exactos de tiempo (§22.2)', () => {
  const at = (hoursAgo: number) => evaluate(makeReport({ hoursAgo }))

  it('2h59 cuenta como reciente y 3h01 ya no', () => {
    expect(at(2.98)!.score).toBe(50 + 30 + 20)
    expect(at(3.02)!.score).toBe(50 + 30 + 10)
  })

  it('23h59 sigue en ventana y 24h01 deja de ser candidato', () => {
    expect(at(23.98)!.score).toBe(50 + 30 + 10)
    expect(at(24.02)).toBeNull()
  })
})

describe('Duplicados — categorías', () => {
  it('basura y drenaje obstruido son compatibles, igual que inundación y drenaje', () => {
    expect(areCompatible('basura', 'drenaje_obstruido')).toBe(true)
    expect(areCompatible('drenaje_obstruido', 'basura')).toBe(true)
    expect(areCompatible('inundacion', 'drenaje_obstruido')).toBe(true)
    expect(areCompatible('basura', 'inundacion')).toBe(false)
    expect(areCompatible('quema', 'basura')).toBe(false)
    expect(areCompatible('basura', 'basura')).toBe(true)
  })

  it('la categoría compatible aporta menos que la misma categoría', () => {
    const misma = evaluate(makeReport({ category: 'basura', hoursAgo: 1 }))!
    const compatible = evaluate(makeReport({ category: 'drenaje_obstruido', hoursAgo: 1 }))!
    expect(misma.score).toBeGreaterThan(compatible.score)
    expect(misma.score - compatible.score).toBe(
      DUPLICATE_POINTS.sameCategory - DUPLICATE_POINTS.compatibleCategory,
    )
  })

  it('una categoría incompatible no es candidata', () => {
    expect(evaluate(makeReport({ category: 'via_bloqueada', hoursAgo: 1 }))).toBeNull()
  })
})

describe('Duplicados — decisión', () => {
  it('adjunta automáticamente a partir de 80', () => {
    // mismo sitio, misma categoría, hace una hora: 50 + 30 + 20 = 100
    const candidate = evaluate(makeReport({ hoursAgo: 1 }))!
    expect(candidate.score).toBe(100)
    expect(decide(candidate)).toBe('adjuntar')
  })

  it('marca posible duplicado entre 50 y 79', () => {
    // a 40 m, categoría compatible, hace 10 h: 30 + 15 + 10 = 55
    const point = metersNorth(40)
    const candidate = evaluate(
      makeReport({ lat: point.lat, lng: point.lng, category: 'drenaje_obstruido', hoursAgo: 10 }),
    )!
    expect(candidate.score).toBe(55)
    expect(decide(candidate)).toBe('posible_duplicado')
  })

  it('sin candidatos la decisión es incidente nuevo', () => {
    expect(decide(null)).toBe('nuevo')
  })

  it('el hash idéntico dispara la decisión aunque esté lejos del radio', () => {
    const lejano = makeReport({
      lat: metersNorth(500).lat,
      hoursAgo: 5,
      photoSha256: 'abc123',
    })
    const candidate = evaluate(lejano, { photoSha256: 'abc123' })!
    expect(candidate.sameHash).toBe(true)
    expect(candidate.score).toBeGreaterThanOrEqual(ATTACH_THRESHOLD)
    expect(decide(candidate)).toBe('adjuntar')
  })

  it('una quema nunca se adjunta por categoría compatible', () => {
    // Un reporte de quema junto a uno de basura: aunque el score llegue a 80,
    // la regla del §11 impide fusionar categorías distintas si hay una quema.
    const candidate = scoreCandidate(makeReport({ category: 'basura', hoursAgo: 1 }), {
      point: BASE_POINT,
      category: 'quema',
      now,
    })
    // Sin compatibilidad declarada, no llega ni a candidato.
    expect(candidate).toBeNull()
  })

  it('dos quemas en el mismo punto sí se adjuntan: misma categoría', () => {
    const candidate = scoreCandidate(makeReport({ category: 'quema', hoursAgo: 1 }), {
      point: BASE_POINT,
      category: 'quema',
      now,
    })!
    expect(candidate.blockedFromAttach).toBe(false)
    expect(decide(candidate)).toBe('adjuntar')
  })

  it('ignora los reportes cerrados y el propio reporte', () => {
    expect(evaluate(makeReport({ hoursAgo: 1, status: 'resuelto' }))).toBeNull()
    expect(evaluate(makeReport({ hoursAgo: 1, status: 'descartado' }))).toBeNull()
    expect(evaluate(makeReport({ hoursAgo: 1, status: 'duplicado' }))).toBeNull()
    const propio = makeReport({ id: 'nuevo', hoursAgo: 0 })
    expect(evaluate(propio, { excludeId: 'nuevo' })).toBeNull()
  })

  it('elige el mejor candidato por score y, a igual score, el más cercano', () => {
    const cerca = evaluate(makeReport({ id: 'cerca', hoursAgo: 1 }))!
    const lejos = evaluate(
      makeReport({ id: 'lejos', lat: metersNorth(15).lat, hoursAgo: 1 }),
    )!
    expect(bestOf([lejos, cerca])!.reportId).toBe('cerca')

    const debil = evaluate(
      makeReport({ id: 'debil', lat: metersNorth(50).lat, category: 'drenaje_obstruido', hoursAgo: 20 }),
    )!
    expect(bestOf([debil, cerca])!.reportId).toBe('cerca')
  })
})
