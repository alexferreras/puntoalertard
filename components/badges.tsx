import {
  CATEGORY_META,
  RISK_LEVEL_META,
  STATUS_LABELS,
  type Category,
  type ReportStatus,
  type RiskLevel,
} from '@/lib/types'
import { percent } from '@/lib/format'

/** §17.3: el nivel se comunica con símbolo + palabra + score, no solo con color. */
const RISK_SYMBOL: Record<RiskLevel, string> = {
  bajo: '✓',
  moderado: '●',
  alto: '▲',
  critico: '!',
}

const RISK_CLASS: Record<RiskLevel, string> = {
  bajo: 'border-risk-bajo/30 bg-risk-bajo/10 text-risk-bajo',
  moderado: 'border-risk-moderado/30 bg-risk-moderado/10 text-risk-moderado',
  alto: 'border-risk-alto/30 bg-risk-alto/10 text-risk-alto',
  critico: 'border-risk-critico/30 bg-risk-critico/10 text-risk-critico',
}

export function RiskBadge({
  level,
  score,
  size = 'md',
}: {
  level: RiskLevel
  score: number
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${RISK_CLASS[level]} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      <span aria-hidden>{RISK_SYMBOL[level]}</span>
      {RISK_LEVEL_META[level].label}
      <span className="tabular-nums opacity-80">{score}</span>
    </span>
  )
}

const STATUS_CLASS: Record<ReportStatus, string> = {
  reportado: 'bg-line text-ink',
  en_revision: 'bg-gold-500/20 text-gold-700',
  derivado: 'bg-purple-900/10 text-purple-900',
  validado: 'bg-purple-500/15 text-purple-700',
  asignado: 'bg-purple-500/25 text-purple-700',
  en_proceso: 'bg-gold-500/25 text-gold-700',
  resuelto: 'bg-risk-bajo/15 text-risk-bajo',
  descartado: 'bg-muted/15 text-muted',
  duplicado: 'bg-muted/15 text-muted',
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function CategoryChip({ category }: { category: Category }) {
  const meta = CATEGORY_META[category]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink ring-1 ring-line">
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  )
}

/** Confianza de la IA: se muestra siempre, también cuando es baja (RNF-10). */
export function ConfidenceBadge({ confidence, engine }: { confidence: number; engine?: string | null }) {
  const low = confidence < 0.6
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        low ? 'bg-gold-500/25 text-gold-700' : 'bg-purple-500/12 text-purple-700'
      }`}
      title={engine ? `Motor: ${engine}` : undefined}
    >
      {low ? 'Confianza baja' : 'Confianza'} {percent(confidence)}
    </span>
  )
}
