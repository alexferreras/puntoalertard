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

function load() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Configuración inválida en las variables de entorno:\n${detail}`)
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
