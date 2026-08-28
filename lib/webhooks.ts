// Webhooks institucionales firmados (docs/05 §3.2).
//
// La firma y la ventana de tiempo son lo que permite a la institución confiar en
// el aviso: sin ellas, cualquiera podría inyectar incidentes falsos en su sistema.

import { createHmac } from 'node:crypto'

import { safeCompare } from './institutions'

export const SIGNATURE_HEADER = 'x-puntoalerta-signature'
export const DELIVERY_HEADER = 'x-puntoalerta-delivery'
export const TIMESTAMP_HEADER = 'x-puntoalerta-timestamp'

/** docs/05 §3.2 — se rechazan timestamps de más de 5 min (anti-replay). */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

const WEBHOOK_TIMEOUT_MS = 5_000

/** La firma cubre timestamp + cuerpo: firmar solo el cuerpo permite reenviarlo. */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export interface VerifyInput {
  secret: string
  timestamp: string | null
  signature: string | null
  body: string
  now?: number
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'faltan_cabeceras' | 'timestamp_fuera_de_ventana' | 'firma_invalida' }

export function verifySignature({
  secret,
  timestamp,
  signature,
  body,
  now = Date.now(),
}: VerifyInput): VerifyResult {
  if (!timestamp || !signature) return { valid: false, reason: 'faltan_cabeceras' }

  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_CLOCK_SKEW_MS) {
    return { valid: false, reason: 'timestamp_fuera_de_ventana' }
  }
  if (!safeCompare(signature, signPayload(secret, timestamp, body))) {
    return { valid: false, reason: 'firma_invalida' }
  }
  return { valid: true }
}

export interface WebhookResult {
  status: 'enviado' | 'fallido'
  httpStatus?: number
  deliveryId: string
  error?: string
}

/**
 * Envía un webhook firmado. No reintenta aquí: el reintento con retroceso
 * exponencial del §3.2 necesita una cola, y en el MVP el fallo queda registrado
 * en `notification_deliveries` para poder reintentar a mano.
 */
export async function sendWebhook(
  url: string,
  secret: string,
  payload: unknown,
): Promise<WebhookResult> {
  const body = JSON.stringify(payload)
  const timestamp = String(Date.now())
  const deliveryId = crypto.randomUUID()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SIGNATURE_HEADER]: signPayload(secret, timestamp, body),
        [DELIVERY_HEADER]: deliveryId,
        [TIMESTAMP_HEADER]: timestamp,
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
    return res.ok
      ? { status: 'enviado', httpStatus: res.status, deliveryId }
      : { status: 'fallido', httpStatus: res.status, deliveryId, error: `HTTP ${res.status}` }
  } catch (err) {
    return {
      status: 'fallido',
      deliveryId,
      error: err instanceof Error ? err.message : 'error desconocido',
    }
  }
}
