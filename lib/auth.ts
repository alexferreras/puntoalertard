// Sesión de operador (§8: el PATCH de estado es solo OPERATOR/ADMIN; §28: "el
// dashboard exige rol").
//
// El doc contempla Supabase Auth; este MVP usa una cookie firmada con
// HMAC-SHA256 porque no hay proveedor de identidad. Es suficiente para separar
// ciudadano de operador y para que la matriz de permisos sea real, pero no
// sustituye a un IdP: no hay usuarios, solo un rol compartido.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { env } from './env'

export const SESSION_COOKIE = 'pa_operador'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export type Role = 'operador'

/**
 * Sin secreto configurado se usa uno efímero: las sesiones mueren al reiniciar
 * el proceso. Aceptable en desarrollo, no en producción — de ahí el aviso.
 */
const secret =
  env.PUNTOALERTA_SESSION_SECRET ??
  (() => {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[auth] PUNTOALERTA_SESSION_SECRET no está definido: las sesiones de operador se invalidarán en cada reinicio.',
      )
    }
    return randomBytes(32).toString('hex')
  })()

function sign(payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Token con forma `rol.expiración.firma`. */
export function createSessionToken(role: Role = 'operador', now = Date.now()): string {
  const payload = `${role}.${now + SESSION_TTL_MS}`
  return `${payload}.${sign(payload)}`
}

/** Comparación en tiempo constante: una comparación normal filtra la firma. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function verifySessionToken(token: string | undefined, now = Date.now()): Role | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [role, expiresAt, signature] = parts
  if (role !== 'operador') return null
  if (!safeEqual(signature, sign(`${role}.${expiresAt}`))) return null
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) <= now) return null
  return 'operador'
}

/** El código de acceso también se compara en tiempo constante. */
export function isValidOperatorCode(code: string): boolean {
  return safeEqual(code, env.PUNTOALERTA_OPERATOR_CODE)
}

export async function currentRole(): Promise<Role | null> {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

export async function startSession(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
