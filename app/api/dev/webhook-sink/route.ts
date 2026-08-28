// POST /api/dev/webhook-sink — sonda local que hace de institución receptora.
//
// Existe para demostrar el webhook firmado sin depender de un servidor externo:
// verifica la firma HMAC y la ventana de tiempo exactamente como debería hacerlo
// el sistema de un ayuntamiento, y registra el resultado en el log del servidor.

import { apiError, handler } from '@/lib/api'
import { listInstitutions } from '@/lib/db'
import { DELIVERY_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from '@/lib/webhooks'

/** Entregas ya vistas: el §3.2 exige tolerar el mismo `delivery_id` dos veces. */
const globalForSink = globalThis as unknown as { puntoAlertaSink?: Set<string> }
const seen = (globalForSink.puntoAlertaSink ??= new Set<string>())

export const POST = handler(async (req: Request) => {
  const body = await req.text()
  const deliveryId = req.headers.get(DELIVERY_HEADER)

  // El secreto se busca entre las instituciones con webhook configurado.
  const secret = listInstitutions().find((i) => i.webhookSecret)?.webhookSecret
  if (!secret) {
    return apiError('VALIDATION_ERROR', 'No hay ninguna institución con webhook configurado.')
  }

  const result = verifySignature({
    secret,
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
    body,
  })
  if (!result.valid) {
    console.warn(`[webhook-sink] rechazado: ${result.reason}`)
    return apiError('FORBIDDEN', `Webhook rechazado: ${result.reason}`)
  }

  const duplicate = Boolean(deliveryId && seen.has(deliveryId))
  if (deliveryId) seen.add(deliveryId)

  console.info(
    `[webhook-sink] recibido ${deliveryId ?? 'sin-id'}${duplicate ? ' (duplicado, ignorado)' : ''}`,
  )
  return Response.json({ received: true, duplicate, deliveryId })
})
