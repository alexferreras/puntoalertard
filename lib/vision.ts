// Clasificador de evidencia fotográfica (RF-05, RF-06).
//
// Dos motores detrás de la misma interfaz:
//  - `mock-v1`: determinista, sin red. Es el que usa el seed y el que garantiza
//    que la demo funcione aunque no haya API key ni wifi (RNF-14).
//  - `claude-vision`: visión multimodal real cuando hay ANTHROPIC_API_KEY.
// La spec §16 es explícita: no entrenamos modelo propio, consumimos una API.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

import { activeVisionEngine } from './env'
import {
  CATEGORIES,
  CATEGORY_META,
  type Category,
  type Classification,
  type ClassificationSignals,
} from './types'

const VISION_MODEL = 'claude-opus-5'

/** Por debajo de este valor la clasificación se marca para revisión humana. */
export const LOW_CONFIDENCE = 0.6

export interface ClassifyInput {
  /** Imagen en base64, sin el prefijo `data:`. */
  imageBase64?: string | null
  /** `image/jpeg`, `image/png`, `image/webp` o `image/gif`. */
  mimeType?: string | null
  description?: string | null
  /** Ayuda al motor mock a producir escenarios reproducibles. */
  filename?: string | null
}

const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// ---------------------------------------------------------------------------
// Motor mock
// ---------------------------------------------------------------------------

/** Palabras clave por categoría, en español dominicano coloquial incluido. */
const KEYWORDS: Record<Category, string[]> = {
  basura: ['basura', 'zafacon', 'zafacón', 'vertedero', 'desecho', 'escombro', 'funda'],
  drenaje_obstruido: [
    'imbornal',
    'drenaje',
    'contén',
    'alcantarilla',
    'tragante',
    'obstru',
    'tapad',
    'rejilla',
  ],
  inundacion: ['inunda', 'agua', 'charco', 'anegad', 'laguna', 'crecida'],
  quema: ['quema', 'fuego', 'incendio', 'humo', 'candela'],
  via_bloqueada: ['vía', 'via', 'calle', 'bloque', 'derrumbe', 'árbol', 'arbol', 'tránsito'],
  // `otro` no tiene palabras clave: es el destino de la evidencia que no encaja.
  otro: [],
}

const SIGNAL_PROFILES: Record<Category, ClassificationSignals> = {
  basura: { garbage: 0.85, water: 0.1, roadBlockage: 0.3 },
  drenaje_obstruido: { garbage: 0.75, water: 0.55, roadBlockage: 0.25 },
  inundacion: { garbage: 0.3, water: 0.9, roadBlockage: 0.6 },
  quema: { garbage: 0.6, water: 0.05, roadBlockage: 0.35 },
  via_bloqueada: { garbage: 0.35, water: 0.2, roadBlockage: 0.9 },
  otro: { garbage: 0.2, water: 0.2, roadBlockage: 0.2 },
}

const BASE_SEVERITY: Record<Category, number> = {
  basura: 5,
  drenaje_obstruido: 7,
  inundacion: 8,
  quema: 8,
  via_bloqueada: 7,
  otro: 4,
}

/** Hash estable (FNV-1a) para que la misma evidencia dé siempre el mismo resultado. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * Desempate cuando el texto activa varias categorías: un imbornal tapado con
 * basura es, ante todo, un problema de drenaje. Se prioriza lo más peligroso.
 */
const TIE_BREAK: Category[] = [
  'inundacion',
  'drenaje_obstruido',
  'quema',
  'via_bloqueada',
  'basura',
  'otro',
]

function matchCategory(text: string): { category: Category; matched: boolean } {
  const normalized = text.toLowerCase()
  let best: { category: Category; hits: number } | null = null
  for (const category of TIE_BREAK) {
    const hits = KEYWORDS[category].filter((k) => normalized.includes(k)).length
    if (hits > 0 && (!best || hits > best.hits)) best = { category, hits }
  }
  if (best) return { category: best.category, matched: true }
  // Sin señales, `otro` con baja confianza es más honesto que adivinar.
  return { category: 'otro', matched: false }
}

export function classifyMock(input: ClassifyInput): Classification {
  const text = `${input.filename ?? ''} ${input.description ?? ''}`.trim()
  const { category, matched } = matchCategory(text || 'evidencia sin texto')
  const seed = hash(`${text}|${input.imageBase64?.length ?? 0}`)

  const jitter = ((seed >>> 8) % 5) / 10 - 0.2 // -0.2 .. +0.2
  const signals = SIGNAL_PROFILES[category]
  const severity = Math.max(1, Math.min(10, Math.round(BASE_SEVERITY[category] + jitter * 5)))
  const confidence = matched ? 0.78 + ((seed >>> 3) % 15) / 100 : 0.45 + ((seed >>> 3) % 20) / 100

  return {
    category,
    severity,
    confidence: Number(Math.min(0.97, confidence).toFixed(2)),
    signals,
    rationale: matched
      ? `Clasificado como ${CATEGORY_META[category].label.toLowerCase()} por las señales descritas en el reporte.`
      : 'Sin señales concluyentes en la evidencia: queda como otra condición para que la persona elija la categoría correcta.',
    engine: 'mock-v1',
  }
}

// ---------------------------------------------------------------------------
// Motor Claude
// ---------------------------------------------------------------------------

const VisionOutput = z.object({
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
  garbage: z.number().min(0).max(1),
  water: z.number().min(0).max(1),
  road_blockage: z.number().min(0).max(1),
  rationale: z.string().max(240),
})

/** Invariantes del prompt: privacidad (RNF-06/07) y explicabilidad (RNF-10). */
const VISION_SYSTEM = `Eres el clasificador de evidencia de PuntoAlerta RD, una plataforma dominicana de riesgo urbano.
Analizas una foto ciudadana de un problema en la vía pública del Gran Santo Domingo.

Reglas:
- Clasifica solo lo que se ve. Si la foto es ambigua, baja la confianza; no inventes.
- No describas personas, rostros, placas de vehículos ni datos identificables.
- severity 1-10: 1 = molestia menor, 10 = peligro inmediato para la vida o el tránsito.
- garbage, water y road_blockage son señales 0-1 de cuánta basura, agua acumulada y
  obstrucción de la vía se observan.
- rationale: una o dos frases en español, concretas, que un operador municipal pueda leer.`

let client: Anthropic | null = null
function anthropic(): Anthropic {
  client ??= new Anthropic()
  return client
}

export function visionEngineName(): 'mock-v1' | 'claude-vision' {
  return activeVisionEngine() === 'claude' ? 'claude-vision' : 'mock-v1'
}

async function classifyWithClaude(input: ClassifyInput): Promise<Classification> {
  const mimeType = input.mimeType ?? ''
  if (!input.imageBase64 || !SUPPORTED_MIME.has(mimeType)) {
    throw new Error(`Evidencia no apta para visión (mime: ${mimeType || 'desconocido'})`)
  }

  const response = await anthropic().messages.parse({
    model: VISION_MODEL,
    max_tokens: 4096,
    system: VISION_SYSTEM,
    output_config: {
      effort: 'low',
      format: zodOutputFormat(VisionOutput),
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: input.imageBase64,
            },
          },
          {
            type: 'text',
            text: input.description
              ? `Comentario del ciudadano: "${input.description}". Clasifica la evidencia.`
              : 'El ciudadano no escribió comentario. Clasifica la evidencia.',
          },
        ],
      },
    ],
  })

  const parsed = response.parsed_output
  if (!parsed) throw new Error('El modelo no devolvió una clasificación válida')

  return {
    category: parsed.category,
    severity: parsed.severity,
    confidence: Number(parsed.confidence.toFixed(2)),
    signals: {
      garbage: parsed.garbage,
      water: parsed.water,
      roadBlockage: parsed.road_blockage,
    },
    rationale: parsed.rationale,
    engine: 'claude-vision',
  }
}

/**
 * Clasifica una evidencia. Nunca lanza: si el motor de visión falla se degrada
 * al mock para que el ciudadano igual pueda reportar (RNF-14).
 */
export async function classify(input: ClassifyInput): Promise<Classification> {
  if (visionEngineName() === 'mock-v1') return classifyMock(input)
  try {
    return await classifyWithClaude(input)
  } catch (err) {
    console.warn('[vision] degradando a mock-v1:', err instanceof Error ? err.message : err)
    const fallback = classifyMock(input)
    return { ...fallback, engine: 'mock-v1-fallback' }
  }
}
