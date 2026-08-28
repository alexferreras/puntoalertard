'use client'

import type { ReactNode } from 'react'

/**
 * Primitivas visuales compartidas. Existen para que las pantallas no repitan
 * clases de Tailwind: cuando cada tarjeta llevaba su propia combinación de
 * borde, radio y espaciado, la interfaz se veía distinta en cada sitio sin que
 * nadie lo hubiera decidido.
 */

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(36,23,45,0.04)] ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {title && (
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  hint?: string
}

/**
 * Control segmentado para elecciones mutuamente excluyentes. Tres botones
 * sueltos de anchos distintos no comunican "elige uno"; un solo carril con la
 * opción activa rellena, sí. Los segmentos comparten ancho para que el grupo no
 * cambie de forma al cambiar de idioma o de etiqueta.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  label?: string
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
      )}
      <div
        role="group"
        aria-label={label}
        className="flex gap-1 rounded-[var(--radius-control)] bg-canvas p-1 ring-1 ring-line"
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              title={option.hint}
              className={`min-h-9 flex-1 rounded-[8px] px-2.5 text-[13px] font-medium leading-tight transition ${
                active
                  ? 'bg-purple-700 text-white shadow-[0_1px_2px_rgba(36,23,45,0.15)]'
                  : 'text-ink hover:bg-white'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Contenedor para los emoji del dominio. Suelto, un emoji flota con un tamaño
 * óptico distinto al del texto; dentro de un círculo tintado de tamaño fijo se
 * lee como un icono y alinea con la línea base.
 */
export function IconBubble({
  children,
  tone = 'neutral',
  size = 'md',
}: {
  children: ReactNode
  tone?: 'neutral' | 'purple' | 'gold'
  size?: 'sm' | 'md'
}) {
  const tones = {
    neutral: 'bg-canvas ring-line',
    purple: 'bg-purple-500/10 ring-purple-500/20',
    gold: 'bg-gold-500/15 ring-gold-500/30',
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full ring-1 ${tones[tone]} ${
        size === 'sm' ? 'size-7 text-[13px]' : 'size-9 text-base'
      }`}
    >
      {children}
    </span>
  )
}

/** Cifra con su etiqueta. Se usa en las filas de indicadores. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-center">
      <dt className="text-[11px] leading-tight text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold leading-none tabular-nums text-ink">{value}</dd>
    </div>
  )
}
