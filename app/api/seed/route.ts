// POST /api/seed — recarga los datos de demostración (§23 del doc de estándares).
// Existe para poder resetear la demo en segundos delante del jurado.

import { apiError, handler } from '@/lib/api'
import { currentRole } from '@/lib/auth'
import { env } from '@/lib/env'
import { runSeed } from '@/lib/seed'

export const POST = handler(async (req: Request) => {
  // §6 — DEMO_MODE habilita los helpers de seed. Fuera de la demo, recargar los
  // datos es una operación destructiva y exige rol de operador.
  if (!env.DEMO_MODE && (await currentRole()) !== 'operador') {
    return apiError('UNAUTHORIZED', 'Recargar los datos de demostración requiere sesión de operador.')
  }

  const reset = new URL(req.url).searchParams.get('reset') !== 'false'
  const reports = runSeed({ reset })
  return Response.json({ inserted: reports.length, reset })
})
