// POST /api/subscriptions — crea una suscripción y manda la verificación.
//
// docs/05 §2.6 — responde **siempre 202**, exista o no el correo: confirmar si
// una dirección está registrada convertiría el endpoint en un oráculo de correos.

import { z } from 'zod'

import { apiError, clientKey, fieldErrorsOf, handler, isRateLimited } from '@/lib/api'
import { insertDelivery, insertSubscription, upsertSubscriber } from '@/lib/db'
import { DEMO_BOUNDS, isInDemoArea } from '@/lib/geo'
import { DIGESTS, NOTIFICATION_EVENTS, SCOPES } from '@/lib/notifications'
import { createToken } from '@/lib/tokens'
import { CATEGORIES, RISK_LEVELS } from '@/lib/types'

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    scope: z.enum(SCOPES).default('todas'),
    zoneKeys: z.array(z.string().max(40)).max(50).default([]),
    center: z.object({ lat: z.number(), lng: z.number() }).nullish(),
    radiusMeters: z.number().int().min(500).max(5000).nullish(),
    categories: z.array(z.enum(CATEGORIES)).default([]),
    minLevel: z.enum(RISK_LEVELS).default('alto'),
    events: z.array(z.enum(NOTIFICATION_EVENTS)).min(1).default(['cambio_nivel', 'preventivo']),
    digest: z.enum(DIGESTS).default('diario'),
    /** Consentimiento explícito: sin él no hay tratamiento del dato. */
    consent: z.literal(true),
  })
  .refine((v) => v.scope !== 'zonas' || v.zoneKeys.length > 0, {
    message: 'Elige al menos una zona.',
    path: ['zoneKeys'],
  })
  .refine((v) => v.scope !== 'radio' || (v.center && v.radiusMeters), {
    message: 'Un alcance por radio necesita centro y radio.',
    path: ['center'],
  })
  .refine((v) => v.scope !== 'radio' || !v.center || isInDemoArea(v.center), {
    message: `El centro está fuera del área cubierta (${DEMO_BOUNDS.minLat}..${DEMO_BOUNDS.maxLat}).`,
    path: ['center'],
  })

export const POST = handler(async (req: Request) => {
  if (isRateLimited(`sub:${clientKey(req)}`)) {
    return apiError('RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.')
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Revisa los datos de la suscripción.', fieldErrorsOf(parsed.error))
  }
  const input = parsed.data

  const verificationToken = createToken('verificar', crypto.randomUUID())
  const subscriber = upsertSubscriber(input.email, verificationToken)

  insertSubscription(subscriber.id, {
    scope: input.scope,
    zoneKeys: input.zoneKeys,
    centerLat: input.center?.lat ?? null,
    centerLng: input.center?.lng ?? null,
    radiusMeters: input.radiusMeters ?? null,
    categories: input.categories,
    minLevel: input.minLevel,
    events: input.events,
    digest: input.digest,
  })

  // El correo de verificación también se registra como envío: con el proveedor
  // mock, la bandeja del dashboard es donde se ve el enlace.
  const origin = new URL(req.url).origin
  const verifyUrl = `${origin}/suscripciones?verificar=${encodeURIComponent(verificationToken)}`
  const manageUrl = `${origin}/suscripciones?token=${encodeURIComponent(
    createToken('gestionar', subscriber.id),
  )}`

  insertDelivery({
    channel: 'email',
    targetType: 'suscriptor',
    targetId: subscriber.id,
    targetEmail: input.email,
    reportId: null,
    // Una verificación no pertenece a ninguna zona ni tiene riesgo asociado.
    zoneKey: '-',
    eventType: 'verificacion',
    level: 'bajo',
    score: 0,
    subject: 'Confirma tus avisos de PuntoAlerta RD',
    body: [
      'Para empezar a recibir avisos, confirma esta dirección:',
      verifyUrl,
      '',
      'Si no fuiste tú, ignora este mensaje: sin confirmar no se envía ningún aviso.',
      `Gestionar o cancelar: ${manageUrl}`,
    ].join('\n'),
    status: subscriber.verifiedAt ? 'enviado' : 'pendiente_verificacion',
  })

  // Siempre 202, sin revelar si el correo ya existía ni si está verificado.
  return Response.json(
    { accepted: true, message: 'Si la dirección es válida, recibirás un correo para confirmar.' },
    { status: 202 },
  )
})
