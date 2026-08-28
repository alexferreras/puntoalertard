'use client'

import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/types'

export function CategoryFilter({
  value,
  onChange,
}: {
  value: Category | null
  onChange: (next: Category | null) => void
}) {
  return (
    <fieldset className="rounded-[var(--radius-card)] border border-line bg-white p-4">
      <legend className="text-sm font-semibold text-ink">Filtrar por categoría</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`min-h-11 rounded-[var(--radius-control)] border px-3 text-sm font-medium ${
            value === null ? 'border-purple-700 bg-purple-700 text-white' : 'border-line bg-white text-ink'
          }`}
        >
          Todas
        </button>
        {CATEGORIES.map((category) => {
          const active = value === category
          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange(active ? null : category)}
              aria-pressed={active}
              className={`min-h-11 rounded-[var(--radius-control)] border px-3 text-sm font-medium ${
                active ? 'border-purple-700 bg-purple-700 text-white' : 'border-line bg-white text-ink'
              }`}
            >
              <span aria-hidden className="mr-1">
                {CATEGORY_META[category].icon}
              </span>
              {CATEGORY_META[category].label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
