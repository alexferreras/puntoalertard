'use client'

import { CATEGORIES, CATEGORY_META, CATEGORY_SHORT_LABELS, type Category } from '@/lib/types'

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium leading-none transition ${
        active
          ? 'border-purple-700 bg-purple-700 text-white'
          : 'border-line bg-white text-ink hover:border-purple-500'
      }`}
    >
      {children}
    </button>
  )
}

export function CategoryFilter({
  value,
  onChange,
}: {
  value: Category | null
  onChange: (next: Category | null) => void
}) {
  return (
    <fieldset className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(36,23,45,0.04)]">
      <legend className="text-sm font-semibold text-ink">Filtrar por categoría</legend>
      {/*
        Con etiquetas largas, siete píldoras formaban cuatro filas irregulares.
        Ahora son cortas y van en un carril: una sola línea que se desplaza si no
        cabe, en lugar de un bloque de altura variable.
      */}
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
        <Chip active={value === null} onClick={() => onChange(null)}>
          Todas
        </Chip>
        {CATEGORIES.map((category) => {
          const active = value === category
          return (
            <Chip
              key={category}
              active={active}
              onClick={() => onChange(active ? null : category)}
            >
              <span aria-hidden className="mr-1">
                {CATEGORY_META[category].icon}
              </span>
              {CATEGORY_SHORT_LABELS[category]}
            </Chip>
          )
        })}
      </div>
    </fieldset>
  )
}
