import { describe, expect, it } from 'vitest'

import { hashSessionId } from '@/lib/sessions'

/**
 * Los límites de `capturedAt` viven en el route handler, así que aquí se fija la
 * regla con la misma aritmética: 10 min de tolerancia hacia el futuro y 24 h
 * hacia el pasado (§19).
 */
const MAX_FUTURE_MS = 10 * 60 * 1000
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function capturedAtIsValid(value: string, now = Date.now()): boolean {
  const delta = now - new Date(value).getTime()
  return delta >= -MAX_FUTURE_MS && delta <= MAX_AGE_MS
}

const NOW = new Date('2026-08-28T12:00:00.000Z').getTime()
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

describe('Fecha de captura (§19)', () => {
  it('acepta el momento actual y el pasado reciente', () => {
    expect(capturedAtIsValid(iso(0), NOW)).toBe(true)
    expect(capturedAtIsValid(iso(-60_000), NOW)).toBe(true)
    expect(capturedAtIsValid(iso(-MAX_AGE_MS + 1000), NOW)).toBe(true)
  })

  it('rechaza más de 24 h en el pasado: no describe la situación de ahora', () => {
    expect(capturedAtIsValid(iso(-MAX_AGE_MS - 1000), NOW)).toBe(false)
    expect(capturedAtIsValid(iso(-7 * MAX_AGE_MS), NOW)).toBe(false)
  })

  it('tolera hasta 10 min en el futuro por relojes desajustados', () => {
    expect(capturedAtIsValid(iso(MAX_FUTURE_MS - 1000), NOW)).toBe(true)
    expect(capturedAtIsValid(iso(MAX_FUTURE_MS + 1000), NOW)).toBe(false)
    expect(capturedAtIsValid(iso(3 * 3_600_000), NOW)).toBe(false)
  })
})

describe('Sesión anónima (§8, §19)', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

  it('el identificador nunca se guarda en claro', () => {
    const hash = hashSessionId(uuid)
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain(uuid)
    expect(hash).not.toContain('3f2504e0')
  })

  it('es estable para el mismo identificador y distinto para otro', () => {
    expect(hashSessionId(uuid)).toBe(hashSessionId(uuid))
    expect(hashSessionId(uuid)).not.toBe(hashSessionId('3f2504e0-4f89-11d3-9a0c-0305e82c3302'))
  })
})

describe('Configuración desde el entorno', () => {
  it('trata la cadena vacía como ausencia de valor', async () => {
    // Compose y los paneles pasan `VAR: ""` cuando la variable no se configura.
    // Sin limpiarlas, el contenedor no arranca por una API key vacía.
    const original = { ...process.env }
    try {
      process.env.ANTHROPIC_API_KEY = ''
      process.env.PUNTOALERTA_OSRM_URL = '   '
      // Importación dinámica con caché invalidada: env se evalúa al importar.
      const mod = await import(`@/lib/env?empty=${Date.now()}`)
      expect(mod.env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(mod.env.PUNTOALERTA_OSRM_URL).toBe('https://router.project-osrm.org')
    } finally {
      process.env = original
    }
  })
})
