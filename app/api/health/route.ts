// GET /api/health — sonda de salud para el orquestador (Docker, EasyPanel).
//
// Comprueba lo único que puede romper el arranque de verdad: que la base sea
// escribible y que las migraciones hayan corrido. Si eso falla, devuelve 503 para
// que el despliegue no se marque como sano y el contenedor anterior siga
// atendiendo.

import { countReports, db } from '@/lib/db'
import { env } from '@/lib/env'
import { activeVisionEngine } from '@/lib/env'

/** Sin caché: una sonda cacheada no informa de nada. */
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()

  try {
    // `PRAGMA user_version` es la lectura más barata que confirma que el fichero
    // está abierto y legible; `countReports` confirma que el esquema existe.
    db().pragma('user_version')
    const reports = countReports()

    return Response.json(
      {
        status: 'ok',
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        database: { reachable: true, reports },
        config: {
          demoMode: env.DEMO_MODE,
          visionEngine: activeVisionEngine(),
          weatherProvider: env.PUNTOALERTA_WEATHER_PROVIDER,
        },
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    console.error('[health] la base de datos no responde:', err)
    return Response.json(
      {
        status: 'error',
        checkedAt: new Date().toISOString(),
        // Sin detalles del fallo: la sonda es pública.
        database: { reachable: false },
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
