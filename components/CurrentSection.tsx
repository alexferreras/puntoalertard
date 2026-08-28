'use client'

import { usePathname } from 'next/navigation'

/**
 * Nombre de la sección actual, solo en móvil.
 *
 * Con la navegación abajo, la barra superior se quedaba con la marca y nada
 * más: parecía que faltaba algo. Mostrar dónde estás usa ese espacio para algo
 * útil y es el patrón habitual cuando la navegación vive en una barra inferior.
 */
const TITLES: { prefix: string; label: string }[] = [
  { prefix: '/reportar', label: 'Reportar' },
  { prefix: '/dashboard/notificaciones', label: 'Bandeja de avisos' },
  { prefix: '/dashboard', label: 'Prioridades' },
  { prefix: '/rutas', label: 'Rutas' },
  { prefix: '/suscripciones', label: 'Avisos' },
]

export function CurrentSection() {
  const pathname = usePathname()
  if (pathname === '/') return null

  const match = TITLES.find((t) => pathname.startsWith(t.prefix))
  if (!match) return null

  return (
    <span className="min-w-0 truncate text-sm text-white/70 sm:hidden">
      <span aria-hidden className="mr-1.5 text-white/40">
        /
      </span>
      {match.label}
    </span>
  )
}
