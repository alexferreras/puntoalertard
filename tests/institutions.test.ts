import { describe, expect, it } from 'vitest'

import {
  extractApiKey,
  hasJurisdiction,
  hashApiKey,
  mostSpecific,
  safeCompare,
} from '@/lib/institutions'
import { MAX_CLOCK_SKEW_MS, signPayload, verifySignature } from '@/lib/webhooks'
import type { InstitutionRow } from '@/lib/db'

const NOW = new Date('2026-08-28T12:00:00.000Z').getTime()

const institution = (overrides: Partial<InstitutionRow> = {}): InstitutionRow => ({
  id: 'i1',
  name: 'Ayuntamiento',
  type: 'ayuntamiento',
  email: 'x@y.z',
  jurisdiction: 'todas',
  zoneKeys: [],
  categories: [],
  webhookUrl: null,
  webhookSecret: null,
  ...overrides,
})

describe('Credencial institucional (docs/05 §3.1)', () => {
  it('la clave se guarda hasheada, nunca en claro', () => {
    const hash = hashApiKey('pa_demo_adn_2026')
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain('pa_demo')
    expect(hashApiKey('pa_demo_adn_2026')).toBe(hash)
    expect(hashApiKey('pa_demo_adn_2027')).not.toBe(hash)
  })

  it('acepta la credencial por Bearer y por cabecera propia', () => {
    const bearer = new Request('http://x/y', { headers: { authorization: 'Bearer clave-123' } })
    expect(extractApiKey(bearer)).toBe('clave-123')

    const propia = new Request('http://x/y', { headers: { 'x-puntoalerta-key': 'clave-456' } })
    expect(extractApiKey(propia)).toBe('clave-456')

    expect(extractApiKey(new Request('http://x/y'))).toBeNull()
    expect(extractApiKey(new Request('http://x/y', { headers: { authorization: 'Basic abc' } }))).toBeNull()
  })

  it('compara en tiempo constante y rechaza longitudes distintas', () => {
    expect(safeCompare('abc', 'abc')).toBe(true)
    expect(safeCompare('abc', 'abd')).toBe(false)
    expect(safeCompare('abc', 'abcd')).toBe(false)
  })
})

describe('Jurisdicción (docs/05 §3.4)', () => {
  it('`todas` cubre cualquier zona; por zonas solo las suyas', () => {
    expect(hasJurisdiction(institution(), { zoneKey: 'z1', category: 'basura' })).toBe(true)

    const local = institution({ jurisdiction: 'zonas', zoneKeys: ['z1'] })
    expect(hasJurisdiction(local, { zoneKey: 'z1', category: 'basura' })).toBe(true)
    expect(hasJurisdiction(local, { zoneKey: 'z2', category: 'basura' })).toBe(false)
  })

  it('respeta las categorías declaradas', () => {
    const ambiente = institution({ categories: ['quema', 'basura'] })
    expect(hasJurisdiction(ambiente, { zoneKey: 'z1', category: 'quema' })).toBe(true)
    expect(hasJurisdiction(ambiente, { zoneKey: 'z1', category: 'inundacion' })).toBe(false)
  })

  it('con varias candidatas gana la jurisdicción más pequeña (RF-20)', () => {
    const nacional = institution({ id: 'nacional', jurisdiction: 'todas' })
    const municipal = institution({ id: 'municipal', jurisdiction: 'zonas', zoneKeys: ['z1', 'z2'] })
    const barrio = institution({ id: 'barrio', jurisdiction: 'zonas', zoneKeys: ['z1'] })

    const elegida = mostSpecific([nacional, municipal, barrio], { zoneKey: 'z1', category: 'basura' })
    expect(elegida?.id).toBe('barrio')
  })

  it('sin candidatas devuelve null: el incidente queda sin institución asignada', () => {
    const local = institution({ jurisdiction: 'zonas', zoneKeys: ['z9'] })
    expect(mostSpecific([local], { zoneKey: 'z1', category: 'basura' })).toBeNull()
  })

  it('a igual tamaño de zona, gana la que declara menos categorías', () => {
    const amplia = institution({ id: 'amplia', jurisdiction: 'zonas', zoneKeys: ['z1'], categories: [] })
    const estrecha = institution({
      id: 'estrecha',
      jurisdiction: 'zonas',
      zoneKeys: ['z1'],
      categories: ['basura'],
    })
    expect(mostSpecific([amplia, estrecha], { zoneKey: 'z1', category: 'basura' })?.id).toBe('estrecha')
  })
})

describe('Firma de webhook (docs/05 §3.2)', () => {
  const secret = 'secreto-de-prueba'
  const body = JSON.stringify({ event: 'cambio_nivel', score: 84 })
  const timestamp = String(NOW)

  it('una firma correcta se acepta', () => {
    const signature = signPayload(secret, timestamp, body)
    expect(verifySignature({ secret, timestamp, signature, body, now: NOW })).toEqual({ valid: true })
  })

  it('la firma cubre el timestamp: reenviarla con otro no vale', () => {
    const signature = signPayload(secret, timestamp, body)
    const otro = String(NOW + 1000)
    expect(verifySignature({ secret, timestamp: otro, signature, body, now: NOW })).toEqual({
      valid: false,
      reason: 'firma_invalida',
    })
  })

  it('rechaza un cuerpo alterado', () => {
    const signature = signPayload(secret, timestamp, body)
    const alterado = JSON.stringify({ event: 'cambio_nivel', score: 10 })
    expect(verifySignature({ secret, timestamp, signature, body: alterado, now: NOW }).valid).toBe(false)
  })

  it('rechaza un secreto distinto', () => {
    const signature = signPayload('otro-secreto', timestamp, body)
    expect(verifySignature({ secret, timestamp, signature, body, now: NOW }).valid).toBe(false)
  })

  it('rechaza timestamps fuera de la ventana de 5 minutos', () => {
    const dentro = String(NOW - MAX_CLOCK_SKEW_MS + 1000)
    const fuera = String(NOW - MAX_CLOCK_SKEW_MS - 1000)
    expect(
      verifySignature({ secret, timestamp: dentro, signature: signPayload(secret, dentro, body), body, now: NOW }),
    ).toEqual({ valid: true })
    expect(
      verifySignature({ secret, timestamp: fuera, signature: signPayload(secret, fuera, body), body, now: NOW }),
    ).toEqual({ valid: false, reason: 'timestamp_fuera_de_ventana' })
  })

  it('rechaza la ausencia de cabeceras', () => {
    expect(verifySignature({ secret, timestamp: null, signature: 'x', body, now: NOW })).toEqual({
      valid: false,
      reason: 'faltan_cabeceras',
    })
    expect(verifySignature({ secret, timestamp, signature: null, body, now: NOW })).toEqual({
      valid: false,
      reason: 'faltan_cabeceras',
    })
  })
})
