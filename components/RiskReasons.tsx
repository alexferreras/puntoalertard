import type { RiskAssessment } from '@/lib/types'
import { RiskBadge } from '@/components/badges'

/**
 * RNF-10 — el Risk Score debe poder leerse y entenderse. Se muestran los cinco
 * factores con su peso, su aporte y la frase que los justifica.
 */
export function RiskReasons({ risk, compact = false }: { risk: RiskAssessment; compact?: boolean }) {
  const factors = compact
    ? [...risk.factors].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3)
    : risk.factors

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <RiskBadge level={risk.level} score={risk.score} />
        <p className="text-sm text-muted">{risk.summary}</p>
      </div>
      {/* §7 del doc de visión: la etiqueta es obligatoria y literal. Nunca se
          presenta el score como probabilidad de que ocurra una inundación. */}
      <p className="mt-1.5 text-xs text-muted">
        Nivel de riesgo/prioridad según señales disponibles.
      </p>
      <ul className="mt-3 space-y-2">
        {factors.map((factor) => (
          <li key={factor.key} className="rounded-[var(--radius-control)] bg-canvas p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{factor.label}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {factor.score}/100 · peso {Math.round(factor.weight * 100)}%
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-purple-500"
                style={{ width: `${factor.score}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">{factor.explanation}</p>
          </li>
        ))}
      </ul>
      {compact && (
        <p className="mt-2 text-xs text-muted">
          Se muestran los factores de mayor aporte. Pesos del modelo: 30% incidentes recientes, 25%
          historial, 20% lluvia, 15% drenaje/basura, 10% contexto de alerta.
        </p>
      )}
    </div>
  )
}
