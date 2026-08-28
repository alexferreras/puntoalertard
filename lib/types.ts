// Dominio central de PuntoAlerta RD. Todo lo demás (API, UI, motores) depende de esto.

export const CATEGORIES = [
  'basura',
  'drenaje_obstruido',
  'inundacion',
  'quema',
  'via_bloqueada',
  'otro',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_META: Record<Category, { label: string; icon: string }> = {
  basura: { label: 'Residuos', icon: '🗑️' },
  drenaje_obstruido: { label: 'Drenaje obstruido', icon: '🕳️' },
  inundacion: { label: 'Inundación / agua acumulada', icon: '🌊' },
  quema: { label: 'Quema / incendio', icon: '🔥' },
  via_bloqueada: { label: 'Vía afectada', icon: '🚧' },
  // §2 del doc: existe OTHER para que la evidencia ambigua no se fuerce a una
  // categoría equivocada. Nunca la propone la IA con confianza alta.
  otro: { label: 'Otra condición', icon: '❓' },
}

// RF-15 y §16 — ciclo de vida del reporte. El orden es lógico, pero las
// transiciones válidas están en `lib/status.ts`: el grafo no es lineal.
export const STATUSES = [
  'reportado',
  'en_revision',
  'derivado',
  'validado',
  'asignado',
  'en_proceso',
  'resuelto',
  'descartado',
  'duplicado',
] as const
export type ReportStatus = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<ReportStatus, string> = {
  reportado: 'Reportado',
  en_revision: 'En revisión',
  derivado: 'Derivado',
  validado: 'Validado',
  asignado: 'Asignado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
  duplicado: 'Duplicado',
}

export const RISK_LEVELS = ['bajo', 'moderado', 'alto', 'critico'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const RISK_LEVEL_META: Record<RiskLevel, { label: string; icon: string; color: string }> = {
  bajo: { label: 'Bajo', icon: '🟢', color: '#16a34a' },
  moderado: { label: 'Moderado', icon: '🟡', color: '#eab308' },
  alto: { label: 'Alto', icon: '🟠', color: '#ea580c' },
  critico: { label: 'Crítico', icon: '🔴', color: '#dc2626' },
}

/** Umbrales del doc §18. */
export function riskLevelFor(score: number): RiskLevel {
  if (score <= 25) return 'bajo'
  if (score <= 50) return 'moderado'
  if (score <= 75) return 'alto'
  return 'critico'
}

/** Señales que el clasificador de visión extrae de la evidencia. */
export interface ClassificationSignals {
  /** 0-1: cuánta basura se observa. */
  garbage: number
  /** 0-1: presencia de agua acumulada. */
  water: number
  /** 0-1: obstrucción de la vía (0 = libre, 1 = intransitable). */
  roadBlockage: number
}

export interface Classification {
  category: Category
  /** 1-10, RF-06. */
  severity: number
  /** 0-1, mostrado al ciudadano como %. */
  confidence: number
  signals: ClassificationSignals
  /** Texto corto y legible que explica el resultado (RNF-10). */
  rationale: string
  /** Identificador del motor que produjo el resultado (p. ej. "mock-v1", "claude-vision"). */
  engine: string
}

export interface Report {
  id: string
  createdAt: string
  lat: number
  lng: number
  /** Categoría vigente: la corrección del ciudadano si existe, si no la de la IA (RF-07). */
  category: Category
  severity: number
  status: ReportStatus
  description: string | null
  photoPath: string | null
  /** Celda de agregación geográfica (~150 m) usada para zonas y recurrencia. */
  zoneKey: string
  /** Vía principal según el seed: pesa en el factor de contexto (§12.2). */
  mainRoad: boolean
  /** sha256 de la evidencia: detecta la misma foto enviada dos veces (§11). */
  photoSha256: string | null
  /** Institución a la que se derivó automáticamente el incidente (RF-20). */
  assignedInstitutionId: string | null
  /**
   * Hash de la sesión anónima que envió el reporte (§8, §19). Nunca se guarda el
   * identificador en claro y nunca sale en la proyección pública: sirve para
   * control de abuso y para que la persona pueda seguir su propio reporte.
   */
  sessionHash: string | null
  /** Reporte canónico si este se adjuntó o se marcó como posible duplicado. */
  duplicateOf: string | null
  /** Score de duplicado con el que se tomó la decisión. */
  duplicateScore: number | null
  aiCategory: Category | null
  aiConfidence: number | null
  aiSignals: ClassificationSignals | null
  aiRationale: string | null
  aiEngine: string | null
  confirmedByUser: boolean
  resolvedAt: string | null
}

/** Contribución de un factor al Risk Score, con su peso (RNF-10: debe ser explicable). */
export interface RiskFactor {
  key:
    | 'severidad_observada'
    | 'recurrencia_reciente'
    | 'lluvia_prevista'
    | 'historial_punto'
    | 'contexto'
  label: string
  /** 0-100 */
  score: number
  /** 0-1, suma 1 entre todos los factores. */
  weight: number
  /** Frase en español que explica de dónde sale el score. */
  explanation: string
}

export interface RiskAssessment {
  zoneKey: string
  lat: number
  lng: number
  /**
   * Radio en metros con el que se agruparon los reportes de esta zona. Viaja con
   * la evaluación para que la UI nunca tenga que suponer el perímetro: decir
   * "6 reportes" sin decir "en cuántos metros" no explica nada.
   */
  radiusMeters: number
  /** Radio de vecindad con el que se contaron recurrencia e historial. */
  neighbourhoodMeters: number
  /** 0-100 */
  score: number
  level: RiskLevel
  factors: RiskFactor[]
  /** 1-3 razones ordenadas por contribución absoluta (§12.4). */
  reasons: string[]
  reportIds: string[]
  computedAt: string
  /** Versión de la fórmula, para que un score viejo siga siendo interpretable. */
  formulaVersion: string
  /** Resumen de una línea para tooltips y listas. */
  summary: string
}
