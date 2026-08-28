// GET|PATCH|DELETE /api/subscriptions/manage?token= — gestión sin cuenta
// (docs/05 §2.3): pausar, reactivar o darse de baja en un clic.

import { z } from 'zod'

import { apiError, fieldErrorsOf, handler } from '@/lib/api'
import { deleteSubscriber, listVerifiedSubscriptions, setSubscriptionActive } from '@/lib/db'
import { verifyToken } from '@/lib/tokens'

function subscriberFrom(req: Request): string | null {
  return verifyToken('gestionar', new URL(req.url).searchParams.get('token'))
}

const INVALID = 'El enlace de gestión no es válido o ya caducó.'

export const GET = handler(async (req: Request) => {
  const subscriberId = subscriberFrom(req)
  if (!subscriberId) return apiError('FORBIDDEN', INVALID)

  const subscriptions = listVerifiedSubscriptions().filter((s) => s.subscriberId === subscriberId)
  return Response.json({ subscriberId, subscriptions })
})

const patchSchema = z.object({ active: z.boolean() })

export const PATCH = handler(async (req: Request) => {
  const subscriberId = subscriberFrom(req)
  if (!subscriberId) return apiError('FORBIDDEN', INVALID)

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Indica `active`.', fieldErrorsOf(parsed.error))
  }

  const changed = setSubscriptionActive(subscriberId, parsed.data.active)
  return Response.json({ updated: changed, active: parsed.data.active })
})

export const DELETE = handler(async (req: Request) => {
  const subscriberId = subscriberFrom(req)
  if (!subscriberId) return apiError('FORBIDDEN', INVALID)

  // Baja definitiva: borrado físico, no lógico (docs/05 §2.6).
  deleteSubscriber(subscriberId)
  return Response.json({ deleted: true })
})
