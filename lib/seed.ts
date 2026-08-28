// Datos de demostración: 18 reportes controlados en el Gran Santo Domingo.
//
// La zona de Gualey / Nuevo Domingo Savio está calibrada para reproducir el
// escenario del §19 de la spec: en seco el riesgo es 🟡 moderado y con el
// pronóstico de lluvia intensa salta a 🔴 crítico sin tocar ningún dato.

import { countReports, deleteAllReports, insertInstitution, insertReport } from './db'
import { env } from './env'
import { hashApiKey } from './institutions'
import { zoneKeyFor } from './geo'
import type { Category, ClassificationSignals, Report, ReportStatus } from './types'

// Las coordenadas están ajustadas a la red vial real (snapping con OSRM): un
// incidente de calle que cae a 100 m de la vía más cercana rompe el cálculo de
// rutas y la exposición.
interface SeedSpec {
  /** Antigüedad del reporte respecto al momento de sembrar. */
  hoursAgo: number
  barrio: string
  lat: number
  lng: number
  category: Category
  severity: number
  status: ReportStatus
  /** Vía principal: aporta al factor de contexto del §12.2. */
  mainRoad?: boolean
  description: string
  signals: ClassificationSignals
  confidence: number
  rationale: string
}

/**
 * Zona de la demo: seis reportes sobre la Avenida México (San Miguel), un
 * corredor real y transitado del Distrito Nacional. Al estar sobre una vía
 * principal, las rutas de brigada la atraviesan y el Exposure Score se ve.
 *
 * La composición está calibrada contra la fórmula del §12.2: 3 reportes en los
 * últimos 14 días (recurrencia 60), 6 en 180 días (historial 100), severidad
 * máxima abierta 9 y contexto 70 (drenaje + agua acumulada + vía principal).
 * Resultado: 64 🟠 en seco y 84 🔴 con 38 mm previstos.
 */
const DEMO_ZONE: SeedSpec[] = [
  {
    hoursAgo: 6,
    barrio: 'San Miguel (Av. México)',
    lat: 18.47872,
    lng: -69.88984,
    category: 'drenaje_obstruido',
    severity: 9,
    status: 'reportado',
    mainRoad: true,
    description: 'Imbornal completamente tapado con basura y fundas frente a la parada de la Av. México.',
    signals: { garbage: 0.8, water: 0.5, roadBlockage: 0.3 },
    confidence: 0.89,
    rationale: 'Se observa rejilla de drenaje cubierta por residuos sólidos y agua estancada al borde del contén.',
  },
  {
    hoursAgo: 40,
    barrio: 'San Miguel (Av. México)',
    lat: 18.47876,
    lng: -69.8896,
    category: 'basura',
    severity: 6,
    status: 'validado',
    mainRoad: true,
    description: 'Acumulación de basura en la esquina, el camión no ha pasado en cuatro días.',
    signals: { garbage: 0.85, water: 0.1, roadBlockage: 0.3 },
    confidence: 0.92,
    rationale: 'Volumen alto de residuos domésticos apilados sobre la acera.',
  },
  {
    hoursAgo: 24 * 5,
    barrio: 'San Miguel (Av. México)',
    lat: 18.4787,
    lng: -69.88995,
    category: 'inundacion',
    severity: 7,
    status: 'reportado',
    mainRoad: true,
    description: 'El agua del fin de semana no ha bajado; sigue empozada junto al contén.',
    signals: { garbage: 0.35, water: 0.8, roadBlockage: 0.5 },
    confidence: 0.86,
    rationale: 'Lámina de agua persistente sobre la calzada varios días después de la lluvia.',
  },
  {
    hoursAgo: 24 * 30,
    barrio: 'San Miguel (Av. México)',
    lat: 18.47868,
    lng: -69.89008,
    category: 'inundacion',
    severity: 7,
    status: 'resuelto',
    mainRoad: true,
    description: 'Agua acumulada hasta media rueda tras la lluvia de la madrugada.',
    signals: { garbage: 0.3, water: 0.9, roadBlockage: 0.6 },
    confidence: 0.87,
    rationale: 'Lámina de agua cubriendo el ancho de la vía; el drenaje no evacua.',
  },
  {
    hoursAgo: 24 * 20,
    barrio: 'San Miguel (Av. México)',
    lat: 18.47874,
    lng: -69.88972,
    category: 'drenaje_obstruido',
    severity: 6,
    status: 'resuelto',
    mainRoad: true,
    description: 'Mismo imbornal obstruido; ya se había limpiado el mes pasado.',
    signals: { garbage: 0.7, water: 0.45, roadBlockage: 0.2 },
    confidence: 0.84,
    rationale: 'Obstrucción recurrente en el mismo punto de drenaje.',
  },
  {
    hoursAgo: 24 * 45,
    barrio: 'San Miguel (Av. México)',
    lat: 18.47878,
    lng: -69.88992,
    category: 'basura',
    severity: 5,
    status: 'resuelto',
    mainRoad: true,
    description: 'Vertedero improvisado en el mismo tramo, retirado por la brigada.',
    signals: { garbage: 0.75, water: 0.1, roadBlockage: 0.25 },
    confidence: 0.88,
    rationale: 'Residuos acumulados sobre la acera de una vía principal.',
  },
]

const OTHER_ZONES: SeedSpec[] = [
  {
    hoursAgo: 5,
    barrio: 'La Ciénaga',
    lat: 18.488,
    lng: -69.905,
    category: 'drenaje_obstruido',
    severity: 7,
    status: 'reportado',
    description: 'Tragante tapado frente al colmado, el agua se devuelve hacia las casas.',
    signals: { garbage: 0.72, water: 0.6, roadBlockage: 0.25 },
    confidence: 0.86,
    rationale: 'Drenaje obstruido con residuos y retorno de agua visible.',
  },
  {
    hoursAgo: 200,
    barrio: 'La Ciénaga',
    lat: 18.4882,
    lng: -69.9052,
    category: 'basura',
    severity: 5,
    status: 'resuelto',
    description: 'Vertedero improvisado al lado del puente.',
    signals: { garbage: 0.8, water: 0.15, roadBlockage: 0.2 },
    confidence: 0.9,
    rationale: 'Residuos acumulados en terreno abierto junto a la vía.',
  },
  {
    hoursAgo: 12,
    barrio: 'Villa Duarte',
    lat: 18.4763,
    lng: -69.8534,
    category: 'inundacion',
    severity: 7,
    status: 'en_proceso',
    description: 'La calle lleva dos días con agua acumulada, huele mal.',
    signals: { garbage: 0.35, water: 0.85, roadBlockage: 0.55 },
    confidence: 0.88,
    rationale: 'Agua estancada ocupando gran parte de la calzada.',
  },
  {
    hoursAgo: 8,
    barrio: 'Herrera',
    lat: 18.46994,
    lng: -70.00756,
    category: 'via_bloqueada',
    severity: 7,
    status: 'validado',
    description: 'Árbol caído bloquea un carril completo de la avenida.',
    signals: { garbage: 0.2, water: 0.1, roadBlockage: 0.9 },
    confidence: 0.93,
    rationale: 'Obstáculo de gran tamaño sobre la vía, tránsito reducido a un carril.',
  },
  {
    hoursAgo: 26,
    barrio: 'Villa Mella',
    lat: 18.5486,
    lng: -69.9186,
    category: 'quema',
    severity: 8,
    status: 'reportado',
    description: 'Están quemando basura al aire libre cerca de la escuela.',
    signals: { garbage: 0.65, water: 0.05, roadBlockage: 0.3 },
    confidence: 0.85,
    rationale: 'Humo denso y residuos en combustión a cielo abierto.',
  },
  {
    hoursAgo: 20,
    barrio: 'Los Alcarrizos',
    lat: 18.5175,
    lng: -70.0192,
    category: 'basura',
    severity: 5,
    status: 'reportado',
    description: 'Zafacones desbordados en la parada de guaguas.',
    signals: { garbage: 0.78, water: 0.1, roadBlockage: 0.25 },
    confidence: 0.89,
    rationale: 'Contenedores rebasados con residuos en la acera.',
  },
  {
    hoursAgo: 50,
    barrio: 'Cristo Rey',
    lat: 18.501,
    lng: -69.925,
    category: 'drenaje_obstruido',
    severity: 6,
    status: 'reportado',
    description: 'Alcantarilla sin tapa y llena de sedimento.',
    signals: { garbage: 0.6, water: 0.4, roadBlockage: 0.35 },
    confidence: 0.81,
    rationale: 'Registro de drenaje descubierto y colmatado.',
  },
  {
    hoursAgo: 15,
    barrio: 'Naco',
    lat: 18.474,
    lng: -69.933,
    category: 'basura',
    severity: 3,
    status: 'resuelto',
    description: 'Escombros de una remodelación en la acera.',
    signals: { garbage: 0.55, water: 0.05, roadBlockage: 0.4 },
    confidence: 0.83,
    rationale: 'Escombros de construcción ocupando parte de la acera.',
  },
  {
    hoursAgo: 60,
    barrio: 'Km 9 Autopista Duarte',
    lat: 18.506,
    lng: -69.974,
    category: 'inundacion',
    severity: 6,
    status: 'reportado',
    mainRoad: true,
    description: 'Se empoza el agua en el carril derecho cada vez que llueve.',
    signals: { garbage: 0.25, water: 0.75, roadBlockage: 0.5 },
    confidence: 0.8,
    rationale: 'Encharcamiento recurrente sobre la calzada.',
  },
  {
    hoursAgo: 70,
    barrio: 'Sabana Perdida',
    lat: 18.56322,
    lng: -69.87897,
    category: 'via_bloqueada',
    severity: 5,
    status: 'reportado',
    description: 'Zanja abierta sin señalizar en el medio de la calle.',
    signals: { garbage: 0.2, water: 0.3, roadBlockage: 0.7 },
    confidence: 0.79,
    rationale: 'Excavación sin protección que reduce el paso de vehículos.',
  },
  {
    hoursAgo: 3,
    barrio: 'Ciudad Colonial',
    lat: 18.4728,
    lng: -69.8836,
    category: 'basura',
    severity: 4,
    status: 'reportado',
    description: 'Fundas de basura fuera de horario frente al parque.',
    signals: { garbage: 0.7, water: 0.05, roadBlockage: 0.15 },
    confidence: 0.87,
    rationale: 'Bolsas de residuos depositadas fuera del horario de recogida.',
  },
  {
    hoursAgo: 45,
    barrio: 'Ensanche Ozama',
    lat: 18.482,
    lng: -69.86,
    category: 'quema',
    severity: 6,
    status: 'validado',
    description: 'Quema de neumáticos en un solar.',
    signals: { garbage: 0.6, water: 0.05, roadBlockage: 0.2 },
    confidence: 0.84,
    rationale: 'Combustión de residuos con humo negro visible.',
  },
]

export const SEED_SPECS: SeedSpec[] = [...DEMO_ZONE, ...OTHER_ZONES]

/** Celda de la zona calibrada para la demo (se usa para abrirla directo en el dashboard). */
export const DEMO_ZONE_POINT = { lat: DEMO_ZONE[0].lat, lng: DEMO_ZONE[0].lng }

function toNewReport(spec: SeedSpec, now: number) {
  const createdAt = new Date(now - spec.hoursAgo * 3_600_000).toISOString()
  return {
    createdAt,
    lat: spec.lat,
    lng: spec.lng,
    category: spec.category,
    severity: spec.severity,
    status: spec.status,
    // El barrio va en la descripción: el MVP no geocodifica direcciones.
    description: `${spec.barrio}: ${spec.description}`,
    photoPath: null,
    aiCategory: spec.category,
    aiConfidence: spec.confidence,
    aiSignals: spec.signals,
    aiRationale: spec.rationale,
    mainRoad: spec.mainRoad ?? false,
    aiEngine: 'seed-v1',
    confirmedByUser: true,
    resolvedAt: spec.status === 'resuelto' ? createdAt : null,
  }
}

/**
 * Los reportes de demostración como objetos de dominio, sin pasar por SQLite.
 * Permite fijar en tests los números exactos de la demo (Av. México: 64 en seco,
 * 84 con lluvia) sin levantar base de datos.
 */
export function demoReports(now = Date.now()): Report[] {
  return SEED_SPECS.map((spec, index) => {
    const base = toNewReport(spec, now)
    return {
      ...base,
      id: `seed-${index}`,
      zoneKey: zoneKeyFor({ lat: spec.lat, lng: spec.lng }),
      resolvedAt: base.resolvedAt ?? null,
      photoSha256: null,
      duplicateOf: null,
      duplicateScore: null,
      assignedInstitutionId: null,
      sessionHash: null,
    }
  })
}

/**
 * docs/05 §6 — dos instituciones sembradas para poder demostrar el enrutamiento
 * sin dar de alta nada a mano. El correo es de ejemplo: el proveedor es mock.
 */
/**
 * Credenciales de demostración. Son públicas a propósito: existen para que la
 * demo se pueda ejecutar sin dar de alta nada a mano. En cualquier despliegue
 * real la clave se genera al registrar la institución y se muestra una sola vez.
 */
export const DEMO_INSTITUTION_KEYS = {
  'inst-adn': 'pa_demo_adn_2026',
  'inst-medioambiente': 'pa_demo_ambiente_2026',
} as const

const DEMO_WEBHOOK_SECRET = 'pa_demo_webhook_secret_2026'

export function seedInstitutions(): void {
  insertInstitution({
    id: 'inst-adn',
    name: 'Ayuntamiento del Distrito Nacional',
    type: 'ayuntamiento',
    email: 'brigadas@adn.gob.do.ejemplo',
    jurisdiction: 'todas',
    zoneKeys: [],
    // Se hace cargo de residuos, drenaje, agua acumulada y vías.
    categories: ['basura', 'drenaje_obstruido', 'inundacion', 'via_bloqueada'],
    // Apunta a la sonda local: así la demo muestra un webhook firmado de verdad.
    webhookUrl: `${env.PUNTOALERTA_BASE_URL}/api/dev/webhook-sink`,
    webhookSecret: DEMO_WEBHOOK_SECRET,
    apiKeyHash: hashApiKey(DEMO_INSTITUTION_KEYS['inst-adn']),
  })
  insertInstitution({
    id: 'inst-medioambiente',
    name: 'Ministerio de Medio Ambiente',
    type: 'ministerio',
    email: 'denuncias@ambiente.gob.do.ejemplo',
    jurisdiction: 'todas',
    zoneKeys: [],
    // Solo quema y residuos.
    categories: ['quema', 'basura'],
    webhookUrl: null,
    webhookSecret: null,
    apiKeyHash: hashApiKey(DEMO_INSTITUTION_KEYS['inst-medioambiente']),
  })
}

export function runSeed({ reset = true, now = Date.now() } = {}): Report[] {
  if (reset) deleteAllReports()
  seedInstitutions()
  return SEED_SPECS.map((spec) => insertReport(toNewReport(spec, now)))
}

/** Siembra solo si la base está vacía: primer arranque y demo a prueba de sustos. */
export function ensureSeeded(): void {
  if (countReports() === 0) runSeed({ reset: false })
}

export const SEEDED_INSTITUTIONS = ['inst-adn', 'inst-medioambiente'] as const
