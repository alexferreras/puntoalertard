import { describe, expect, it } from 'vitest'

import {
  NOTIFY_MAX_PER_DAY,
  NOTIFY_ZONE_COOLDOWN_HOURS,
  composeMessage,
  crossedUpward,
  isImmediate,
  matchesFilters,
  meetsMinLevel,
  throttle,
  type NotificationContext,
  type SubscriptionFilters,
} from '@/lib/notifications'
import { institutionCovers } from '@/lib/notify'
import { createToken, verifyToken } from '@/lib/tokens'
import { BASE_POINT, metersNorth } from './helpers'

const NOW = new Date('2026-08-28T12:00:00.000Z').getTime()

const filters = (overrides: Partial<SubscriptionFilters> = {}): SubscriptionFilters => ({
  scope: 'todas',
  zoneKeys: [],
  center: null,
  radiusMeters: null,
  categories: [],
  minLevel: 'alto',
  events: ['cambio_nivel', 'preventivo'],
  digest: 'diario',
  ...overrides,
})

const context = (overrides: Partial<NotificationContext> = {}): NotificationContext => ({
  zoneKey: '150:0:0',
  point: BASE_POINT,
  category: 'drenaje_obstruido',
  level: 'critico',
  score: 84,
  event: 'cambio_nivel',
  ...overrides,
})

describe('Cruce de nivel (docs/05 §2.4)', () => {
  it('solo avisa cuando el nivel sube', () => {
    expect(crossedUpward('alto', 'critico')).toBe(true)
    expect(crossedUpward('moderado', 'critico')).toBe(true)
    expect(crossedUpward('bajo', 'moderado')).toBe(true)
  })

  it('no avisa cuando el nivel baja o se mantiene', () => {
    expect(crossedUpward('critico', 'alto')).toBe(false)
    expect(crossedUpward('critico', 'critico')).toBe(false)
    expect(crossedUpward('alto', 'bajo')).toBe(false)
  })

  it('sin nivel anterior no hay cruce: es un punto nuevo, no una escalada', () => {
    expect(crossedUpward(null, 'critico')).toBe(false)
  })

  it('el nivel mínimo se compara por orden, no alfabéticamente', () => {
    expect(meetsMinLevel('critico', 'alto')).toBe(true)
    expect(meetsMinLevel('alto', 'alto')).toBe(true)
    expect(meetsMinLevel('moderado', 'alto')).toBe(false)
    expect(meetsMinLevel('bajo', 'bajo')).toBe(true)
  })
})

describe('Alcance de la suscripción', () => {
  it('`todas` acepta cualquier zona', () => {
    expect(matchesFilters(filters(), context())).toBe(true)
  })

  it('`zonas` solo acepta las zonas elegidas', () => {
    const f = filters({ scope: 'zonas', zoneKeys: ['150:1:1'] })
    expect(matchesFilters(f, context({ zoneKey: '150:1:1' }))).toBe(true)
    expect(matchesFilters(f, context({ zoneKey: '150:9:9' }))).toBe(false)
  })

  it('`radio` compara la distancia real al centro', () => {
    const f = filters({ scope: 'radio', center: BASE_POINT, radiusMeters: 500 })
    expect(matchesFilters(f, context({ point: metersNorth(499) }))).toBe(true)
    expect(matchesFilters(f, context({ point: metersNorth(501) }))).toBe(false)
  })

  it('`radio` sin centro o sin radio no dispara nada', () => {
    expect(matchesFilters(filters({ scope: 'radio' }), context())).toBe(false)
    expect(matchesFilters(filters({ scope: 'radio', center: BASE_POINT }), context())).toBe(false)
  })

  it('filtra por categoría cuando la suscripción declara categorías', () => {
    const f = filters({ categories: ['quema'] })
    expect(matchesFilters(f, context({ category: 'quema' }))).toBe(true)
    expect(matchesFilters(f, context({ category: 'basura' }))).toBe(false)
    // Lista vacía = todas.
    expect(matchesFilters(filters({ categories: [] }), context({ category: 'basura' }))).toBe(true)
  })

  it('filtra por evento y por nivel mínimo', () => {
    expect(matchesFilters(filters(), context({ event: 'resuelto' }))).toBe(false)
    expect(matchesFilters(filters({ minLevel: 'critico' }), context({ level: 'alto' }))).toBe(false)
  })
})

describe('Inmediatez y antirruido (docs/05 §2.4)', () => {
  it('un nivel crítico se envía al momento aunque la suscripción sea de resumen', () => {
    expect(isImmediate(filters({ digest: 'semanal' }), 'critico')).toBe(true)
    expect(isImmediate(filters({ digest: 'diario' }), 'alto')).toBe(false)
    expect(isImmediate(filters({ digest: 'inmediato' }), 'bajo')).toBe(true)
  })

  it('respeta el enfriamiento de 6 h por zona', () => {
    expect(NOTIFY_ZONE_COOLDOWN_HOURS).toBe(6)
    const hace = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()

    expect(throttle({ lastZoneDeliveryAt: hace(5.9), deliveriesLastDay: 1 }, NOW)).toBe(
      'descartado_antirruido',
    )
    expect(throttle({ lastZoneDeliveryAt: hace(6.1), deliveriesLastDay: 1 }, NOW)).toBe('enviar')
    expect(throttle({ lastZoneDeliveryAt: null, deliveriesLastDay: 0 }, NOW)).toBe('enviar')
  })

  it('respeta el tope diario y lo prioriza sobre el enfriamiento', () => {
    expect(NOTIFY_MAX_PER_DAY).toBe(10)
    expect(throttle({ lastZoneDeliveryAt: null, deliveriesLastDay: 9 }, NOW)).toBe('enviar')
    expect(throttle({ lastZoneDeliveryAt: null, deliveriesLastDay: 10 }, NOW)).toBe(
      'descartado_tope_diario',
    )
  })
})

describe('Contenido del aviso (docs/05 §2.5)', () => {
  const message = composeMessage(context(), ['Severidad observada 9/10'], {
    kind: 'suscriptor',
    manageUrl: 'https://x/gestionar',
  })

  it('lleva nivel, score y razones', () => {
    expect(message.subject).toContain('CRITICO')
    expect(message.body).toContain('84/100')
    expect(message.body).toContain('Severidad observada 9/10')
  })

  it('lleva la zona aproximada, no la coordenada exacta', () => {
    expect(message.body).toContain('18.4787')
    expect(message.body).not.toContain(String(BASE_POINT.lat))
  })

  it('repite que no es una alerta oficial y ofrece la baja', () => {
    expect(message.body).toContain('No sustituye alertas oficiales')
    expect(message.body).toContain('https://x/gestionar')
  })

  it('a una institución no le ofrece darse de baja: su canal es administrativo', () => {
    const institucional = composeMessage(context(), [], {
      kind: 'institucion',
      name: 'Ayuntamiento del Distrito Nacional',
    })
    expect(institucional.body).not.toContain('Gestionar o cancelar')
    expect(institucional.body).toContain('registro institucional')
    expect(institucional.body).toContain('Ayuntamiento del Distrito Nacional')
  })
})

describe('Jurisdicción institucional (docs/05 §3.4)', () => {
  const institution = (overrides: Partial<Parameters<typeof institutionCovers>[0]> = {}) => ({
    id: 'i1',
    name: 'Ayuntamiento',
    type: 'ayuntamiento',
    email: 'x@y.z',
    jurisdiction: 'todas',
    zoneKeys: [] as string[],
    categories: [] as string[],
    webhookUrl: null,
    webhookSecret: null,
    ...overrides,
  })

  it('una jurisdicción `todas` cubre cualquier zona', () => {
    expect(institutionCovers(institution(), context())).toBe(true)
  })

  it('una jurisdicción por zonas solo cubre las suyas', () => {
    const i = institution({ jurisdiction: 'zonas', zoneKeys: ['150:1:1'] })
    expect(institutionCovers(i, context({ zoneKey: '150:1:1' }))).toBe(true)
    expect(institutionCovers(i, context({ zoneKey: '150:2:2' }))).toBe(false)
  })

  it('respeta las categorías de las que se hace cargo', () => {
    const i = institution({ categories: ['quema', 'basura'] })
    expect(institutionCovers(i, context({ category: 'quema' }))).toBe(true)
    expect(institutionCovers(i, context({ category: 'drenaje_obstruido' }))).toBe(false)
  })
})

describe('Tokens de suscripción (docs/05 §2.3)', () => {
  it('un token válido devuelve el identificador', () => {
    const token = createToken('verificar', 'abc', NOW)
    expect(verifyToken('verificar', token, NOW)).toBe('abc')
  })

  it('un token de verificación no sirve para gestionar', () => {
    const token = createToken('verificar', 'abc', NOW)
    expect(verifyToken('gestionar', token, NOW)).toBeNull()
  })

  it('la verificación caduca a las 72 h', () => {
    const token = createToken('verificar', 'abc', NOW)
    const ttl = 72 * 3_600_000
    expect(verifyToken('verificar', token, NOW + ttl - 1)).toBe('abc')
    expect(verifyToken('verificar', token, NOW + ttl)).toBeNull()
  })

  it('rechaza firma manipulada, forma inválida y ausencia de token', () => {
    const token = createToken('gestionar', 'abc', NOW)
    const [purpose, id, expiry, signature] = token.split('.')
    expect(verifyToken('gestionar', `${purpose}.${id}.${expiry}.${signature.slice(0, -1)}z`, NOW)).toBeNull()
    expect(verifyToken('gestionar', `${purpose}.${id}.${Number(expiry) + 1}.${signature}`, NOW)).toBeNull()
    expect(verifyToken('gestionar', 'a.b.c', NOW)).toBeNull()
    expect(verifyToken('gestionar', null, NOW)).toBeNull()
  })
})
