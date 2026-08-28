// Sesión anónima del ciudadano (§8, §19).
//
// El identificador es un UUID que el navegador genera y guarda localmente. No es
// una identidad: sirve para control de abuso y para que la persona pueda seguir
// su propio reporte. Se hashea con el secreto del servidor antes de persistir,
// así que ni un volcado de la base permite correlacionar reportes con un
// dispositivo sin conocer el secreto.

import { createHmac, randomBytes } from 'node:crypto'

import { env } from './env'

const secret = env.PUNTOALERTA_SESSION_SECRET ?? randomBytes(32).toString('hex')

export function hashSessionId(sessionId: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('hex')
}
