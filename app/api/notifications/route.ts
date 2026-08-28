// GET /api/notifications — bandeja simulada de envíos (solo operador).
//
// Con el proveedor `mock` no se envía correo: la fila en `notification_deliveries`
// es el registro del envío, y esta bandeja es lo que permite demostrar el ciclo
// completo sin montar SMTP.

import { apiError, handler } from '@/lib/api'
import { currentRole } from '@/lib/auth'
import { listDeliveries } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

export const GET = handler(async (req: Request) => {
  if ((await currentRole()) !== 'operador') {
    return apiError('UNAUTHORIZED', 'La bandeja de avisos requiere sesión de operador.')
  }
  ensureSeeded()

  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 50)
  const deliveries = listDeliveries(Number.isFinite(limit) ? Math.min(limit, 200) : 50)
  return Response.json({ deliveries, provider: 'mock', updatedAt: new Date().toISOString() })
})
