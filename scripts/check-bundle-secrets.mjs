// §28 — "No existen secretos en repositorio, browser bundle o logs".
//
// Comprueba que ni los valores por defecto de configuración sensible ni los
// nombres de las variables de entorno del servidor acaben en el bundle del
// navegador. Se disparó de verdad una vez: un componente de cliente importaba un
// valor de `lib/weather.ts`, que importa `lib/env.ts`, y el código de operador
// terminó en `.next/static`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BUNDLE_DIR = '.next/static'

/** Cadenas que no pueden aparecer nunca en código que se descarga al navegador. */
const FORBIDDEN = [
  'operador-demo',
  'pa_demo_adn_2026',
  'pa_demo_ambiente_2026',
  'pa_demo_webhook_secret',
  'PUNTOALERTA_OPERATOR_CODE',
  'PUNTOALERTA_SESSION_SECRET',
  'ANTHROPIC_API_KEY',
]

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

let files = 0
const hits = []

try {
  for (const file of walk(BUNDLE_DIR)) {
    if (!/\.(js|mjs|css|json)$/.test(file)) continue
    files += 1
    const content = readFileSync(file, 'utf8')
    for (const needle of FORBIDDEN) {
      if (content.includes(needle)) hits.push({ file, needle })
    }
  }
} catch {
  console.error(`No se encontró ${BUNDLE_DIR}. Ejecuta "npm run build" antes de esta comprobación.`)
  process.exit(1)
}

if (hits.length > 0) {
  console.error(`FALLO: ${hits.length} secreto(s) en el bundle del navegador:`)
  for (const hit of hits) console.error(`  ${hit.needle} -> ${hit.file}`)
  console.error(
    '\nCausa habitual: un componente de cliente importa un valor de un módulo que importa lib/env.ts.',
  )
  process.exit(1)
}

console.log(`OK: ${files} ficheros del bundle revisados, ningún secreto expuesto.`)
