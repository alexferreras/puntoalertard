import { describe, expect, it } from 'vitest'

import {
  SESSION_TTL_MS,
  createSessionToken,
  isValidOperatorCode,
  verifySessionToken,
} from '@/lib/auth'

const NOW = new Date('2026-08-28T12:00:00.000Z').getTime()

describe('Sesión de operador (§8, §28)', () => {
  it('un token recién firmado se verifica como operador', () => {
    const token = createSessionToken('operador', NOW)
    expect(verifySessionToken(token, NOW)).toBe('operador')
  })

  it('sin token no hay rol', () => {
    expect(verifySessionToken(undefined)).toBeNull()
    expect(verifySessionToken('')).toBeNull()
  })

  it('rechaza un token con forma inválida', () => {
    expect(verifySessionToken('operador')).toBeNull()
    expect(verifySessionToken('operador.123')).toBeNull()
    expect(verifySessionToken('a.b.c.d')).toBeNull()
  })

  it('rechaza una firma manipulada', () => {
    const token = createSessionToken('operador', NOW)
    const [role, expiry, signature] = token.split('.')
    expect(verifySessionToken(`${role}.${expiry}.${signature.slice(0, -1)}x`, NOW)).toBeNull()
  })

  it('rechaza un intento de alargar la caducidad', () => {
    const token = createSessionToken('operador', NOW)
    const [role, expiry, signature] = token.split('.')
    const alargado = `${role}.${Number(expiry) + 86_400_000}.${signature}`
    expect(verifySessionToken(alargado, NOW)).toBeNull()
  })

  it('rechaza un rol inventado aunque la forma sea válida', () => {
    expect(verifySessionToken(`admin.${NOW + SESSION_TTL_MS}.firma`, NOW)).toBeNull()
  })

  it('caduca exactamente al vencer el TTL', () => {
    const token = createSessionToken('operador', NOW)
    expect(verifySessionToken(token, NOW + SESSION_TTL_MS - 1)).toBe('operador')
    expect(verifySessionToken(token, NOW + SESSION_TTL_MS)).toBeNull()
    expect(verifySessionToken(token, NOW + SESSION_TTL_MS + 1)).toBeNull()
  })

  it('valida el código de acceso configurado y rechaza el resto', () => {
    // El valor por defecto de desarrollo, declarado en lib/env.ts.
    expect(isValidOperatorCode('operador-demo')).toBe(true)
    expect(isValidOperatorCode('operador-dem')).toBe(false)
    expect(isValidOperatorCode('OPERADOR-DEMO')).toBe(false)
    expect(isValidOperatorCode('')).toBe(false)
    expect(isValidOperatorCode('otro-codigo-cualquiera')).toBe(false)
  })
})
