// Tokens firmados de propósito único (docs/05 §2.3): verificar una suscripción
// y gestionarla sin cuenta ni contraseña.
//
// El propósito va dentro de la firma, así que un token de verificación no sirve
// para gestionar ni al contrario.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { env } from './env'

export type TokenPurpose = 'verificar' | 'gestionar'

const TTL_MS: Record<TokenPurpose, number> = {
  // §2.3 — la verificación caduca en 72 h; sin confirmar no se envía nada.
  verificar: 72 * 60 * 60 * 1000,
  // El enlace de gestión vive con la suscripción: es el "darse de baja" del correo.
  gestionar: 365 * 24 * 60 * 60 * 1000,
}

const secret =
  env.PUNTOALERTA_SESSION_SECRET ?? randomBytes(32).toString('hex')

function sign(payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Token con forma `propósito.id.expiración.firma`. */
export function createToken(purpose: TokenPurpose, id: string, now = Date.now()): string {
  const payload = `${purpose}.${id}.${now + TTL_MS[purpose]}`
  return `${payload}.${sign(payload)}`
}

export function verifyToken(
  purpose: TokenPurpose,
  token: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [tokenPurpose, id, expiresAt, signature] = parts
  if (tokenPurpose !== purpose) return null
  if (!safeEqual(signature, sign(`${tokenPurpose}.${id}.${expiresAt}`))) return null
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) <= now) return null
  return id
}
