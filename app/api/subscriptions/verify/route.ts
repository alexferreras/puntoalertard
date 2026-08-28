// GET /api/subscriptions/verify?token= — cierra el doble opt-in (docs/05 §2.3).

import { apiError, handler } from '@/lib/api'
import { verifySubscriber } from '@/lib/db'
import { verifyToken } from '@/lib/tokens'

export const GET = handler(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token')
  if (!verifyToken('verificar', token)) {
    return apiError('FORBIDDEN', 'El enlace de confirmación no es válido o ya caducó.')
  }

  const subscriber = verifySubscriber(token!)
  if (!subscriber) {
    return apiError('FORBIDDEN', 'El enlace de confirmación no es válido o ya caducó.')
  }

  return Response.json({
    verified: true,
    message: 'Suscripción confirmada. A partir de ahora recibirás los avisos que elegiste.',
  })
})
