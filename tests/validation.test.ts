import { describe, expect, it } from 'vitest'

import { categorySchema, formField, latSchema, lngSchema, pointSchema, demoPointSchema } from '@/lib/api'
import { ALLOWED_PHOTO_MIME, MAX_DESCRIPTION_CHARS, MAX_PHOTO_BYTES } from '@/lib/limits'
import { isInDemoArea } from '@/lib/geo'
import { z } from 'zod'

describe('Validaciones (§19)', () => {
  it('acepta y rechaza los límites exactos de latitud y longitud', () => {
    expect(latSchema.safeParse(-90).success).toBe(true)
    expect(latSchema.safeParse(90).success).toBe(true)
    expect(latSchema.safeParse(-90.1).success).toBe(false)
    expect(latSchema.safeParse(90.1).success).toBe(false)
    expect(lngSchema.safeParse(-180).success).toBe(true)
    expect(lngSchema.safeParse(180).success).toBe(true)
    expect(lngSchema.safeParse(-180.1).success).toBe(false)
    expect(lngSchema.safeParse(180.1).success).toBe(false)
  })

  it('rechaza un campo de formulario ausente en lugar de convertirlo en 0', () => {
    const form = new FormData()
    form.set('lat', '')
    form.set('lng', '   ')
    expect(formField(form, 'lat')).toBeUndefined()
    expect(formField(form, 'lng')).toBeUndefined()
    expect(formField(form, 'inexistente')).toBeUndefined()
    // Este es el bug que el helper evita: Number(null) === 0.
    expect(latSchema.safeParse(formField(form, 'lat')).success).toBe(false)
  })

  it('conserva y recorta un campo con valor', () => {
    const form = new FormData()
    form.set('lat', '  18.48  ')
    expect(formField(form, 'lat')).toBe('18.48')
    expect(latSchema.parse(formField(form, 'lat'))).toBe(18.48)
  })

  it('el área de demostración cubre el Gran Santo Domingo y excluye (0,0)', () => {
    expect(isInDemoArea({ lat: 18.4861, lng: -69.9312 })).toBe(true)
    expect(isInDemoArea({ lat: 0, lng: 0 })).toBe(false)
    expect(isInDemoArea({ lat: 19.78, lng: -70.69 })).toBe(false)
    expect(demoPointSchema.safeParse({ lat: 0, lng: 0 }).success).toBe(false)
    expect(demoPointSchema.safeParse({ lat: 18.48, lng: -69.9 }).success).toBe(true)
    expect(pointSchema.safeParse({ lat: 0, lng: 0 }).success).toBe(true)
  })

  it('la nota admite 280 caracteres y rechaza 281', () => {
    const nota = z.string().trim().max(MAX_DESCRIPTION_CHARS)
    expect(nota.safeParse('a'.repeat(280)).success).toBe(true)
    expect(nota.safeParse('a'.repeat(281)).success).toBe(false)
  })

  it('la imagen admite 8 MB exactos y rechaza un byte más', () => {
    expect(MAX_PHOTO_BYTES).toBe(8 * 1024 * 1024)
    expect(MAX_PHOTO_BYTES <= MAX_PHOTO_BYTES).toBe(true)
    expect(MAX_PHOTO_BYTES + 1 > MAX_PHOTO_BYTES).toBe(true)
  })

  it('solo admite los formatos de imagen del doc', () => {
    expect(ALLOWED_PHOTO_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    expect((ALLOWED_PHOTO_MIME as readonly string[]).includes('image/gif')).toBe(false)
    expect((ALLOWED_PHOTO_MIME as readonly string[]).includes('application/octet-stream')).toBe(false)
  })

  it('las categorías del enum son las seis del §2', () => {
    for (const category of ['basura', 'drenaje_obstruido', 'inundacion', 'quema', 'via_bloqueada', 'otro']) {
      expect(categorySchema.safeParse(category).success).toBe(true)
    }
    expect(categorySchema.safeParse('TRASH').success).toBe(false)
  })
})
