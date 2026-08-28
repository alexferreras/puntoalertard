// Configuración validada al arranque (§6 del doc de estándares).
//
// Se valida una sola vez al importar el módulo: si falta un secreto que el
// provider activo necesita, el servidor falla de inmediato con un mensaje claro
// en lugar de degradar en silencio a mitad de una demo.

import { z } from 'zod'

const schema = z
  .object({
    /** `auto` usa Claude si hay API key y mock si no. */
    PUNTOALERTA_VISION_ENGINE: z.enum(['auto', 'mock', 'claude']).default('auto'),
    ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
    PUNTOALERTA_WEATHER_PROVIDER: z.enum(['open_meteo', 'mock']).default('open_meteo'),
    PUNTOALERTA_OSRM_URL: z.string().url().default('https://router.project-osrm.org'),
    PUNTOALERTA_DB_FILE: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/, 'Debe ser solo un nombre de fichero, sin rutas')
      .default('puntoalertard.db'),
    /** URL base pública, usada para construir enlaces y el webhook de la demo. */
    PUNTOALERTA_BASE_URL: z.string().url().default('http://localhost:3000'),
    /** Código de acceso del operador. Cámbialo en cualquier despliegue real. */
    PUNTOALERTA_OPERATOR_CODE: z.string().trim().min(4).default('operador-demo'),
    /** Secreto de firma de sesiones. Sin él se genera uno efímero por proceso. */
    PUNTOALERTA_SESSION_SECRET: z.string().trim().min(16).optional(),
    /** Habilita los escenarios meteorológicos simulados y el endpoint de seed. */
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  .refine((env) => env.PUNTOALERTA_VISION_ENGINE !== 'claude' || Boolean(env.ANTHROPIC_API_KEY), {
    message: 'PUNTOALERTA_VISION_ENGINE=claude requiere ANTHROPIC_API_KEY',
    path: ['ANTHROPIC_API_KEY'],
  })

/** Valor por defecto del código de operador: aceptable en desarrollo, nunca en producción. */
const DEFAULT_OPERATOR_CODE = 'operador-demo'

/**
 * `next build` corre con NODE_ENV=production pero sin los secretos del entorno
 * de ejecución: si las exigencias de producción se aplicaran también al build,
 * la imagen no se podría construir. Next marca la fase con NEXT_PHASE.
 */
function isBuildPhase(): boolean {
  return (process.env.NEXT_PHASE ?? '').includes('build')
}

/**
 * Exigencias que solo aplican al ejecutar en producción. Fallar al arrancar es
 * deliberado: un despliegue con el código de operador por defecto deja el
 * dashboard abierto, y sin secreto de sesión las sesiones mueren en cada
 * reinicio o redespliegue.
 */
function assertProductionReady(env: z.infer<typeof schema>): string[] {
  const problemas: string[] = []

  if (env.PUNTOALERTA_OPERATOR_CODE === DEFAULT_OPERATOR_CODE) {
    problemas.push(
      'PUNTOALERTA_OPERATOR_CODE sigue con el valor por defecto: cámbialo antes de desplegar.',
    )
  }
  if (!env.PUNTOALERTA_SESSION_SECRET) {
    problemas.push(
      'PUNTOALERTA_SESSION_SECRET es obligatorio en producción: sin él las sesiones y los tokens de suscripción se invalidan en cada reinicio.',
    )
  }
  if (env.PUNTOALERTA_VISION_ENGINE === 'claude' && !env.ANTHROPIC_API_KEY) {
    problemas.push('PUNTOALERTA_VISION_ENGINE=claude requiere ANTHROPIC_API_KEY.')
  }
  return problemas
}

function load() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Configuración inválida en las variables de entorno:\n${detail}`)
  }

  if (process.env.NODE_ENV === 'production' && !isBuildPhase()) {
    const problemas = assertProductionReady(parsed.data)
    if (problemas.length > 0) {
      throw new Error(
        `Configuración no apta para producción:\n${problemas.map((p) => `  - ${p}`).join('\n')}`,
      )
    }
    if (parsed.data.DEMO_MODE) {
      console.warn(
        '[env] DEMO_MODE=true en producción: los escenarios simulados y el endpoint de seed están habilitados.',
      )
    }
  }

  return parsed.data
}

export const env = load()

/** Motor de visión efectivo, ya resuelto el modo `auto`. */
export function activeVisionEngine(): 'mock' | 'claude' {
  if (env.PUNTOALERTA_VISION_ENGINE === 'auto') {
    return env.ANTHROPIC_API_KEY ? 'claude' : 'mock'
  }
  return env.PUNTOALERTA_VISION_ENGINE
}
