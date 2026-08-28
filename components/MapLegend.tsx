import { CATEGORY_META, CATEGORIES, RISK_LEVELS, RISK_LEVEL_META } from '@/lib/types'

export function MapLegend() {
  return (
    <section
      aria-label="Leyenda del mapa"
      className="rounded-[var(--radius-card)] border border-line bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-ink">Leyenda</h2>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Nivel de riesgo</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
            {RISK_LEVELS.map((level) => (
              <li key={level} className="flex items-center gap-1.5 text-xs text-ink">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_LEVEL_META[level].color }}
                />
                {RISK_LEVEL_META[level].label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Categorías</p>
          <ul className="mt-1.5 grid gap-1.5">
            {CATEGORIES.map((category) => (
              <li key={category} className="flex items-center gap-1.5 text-xs text-ink">
                <span aria-hidden>{CATEGORY_META[category].icon}</span>
                {CATEGORY_META[category].label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        El círculo marca la zona de agregación (150 m), no el límite exacto del problema.
      </p>
    </section>
  )
}
