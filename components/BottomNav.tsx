'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Navegación inferior para móvil (RNF-02).
 *
 * Las cinco secciones no caben en una línea junto a la marca: en la barra
 * superior quedaban cortadas, y una palabra cortada en el borde se lee como un
 * fallo, no como un carril deslizable. Abajo caben las cinco, se alcanzan con el
 * pulgar y ninguna queda oculta.
 *
 * Se oculta desde `sm`, donde los enlaces vuelven a la barra superior.
 */

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'size-[22px]',
  'aria-hidden': true,
}

const MapIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 21s-6.5-6.1-6.5-10.5a6.5 6.5 0 1 1 13 0C18.5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="10.5" r="2.3" />
  </svg>
)

const ReportIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.9a1.5 1.5 0 0 0 1.3-.75l.8-1.4A1.5 1.5 0 0 1 10.8 4h2.4a1.5 1.5 0 0 1 1.3.85l.8 1.4A1.5 1.5 0 0 0 16.6 7h1.9A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
)

const QueueIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 6h10M4 12h16M4 18h7" />
    <circle cx="18.5" cy="6" r="1.6" />
  </svg>
)

const RouteIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18h4.3a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.8" />
  </svg>
)

const BellIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15L18 15.5Z" />
    <path d="M10 21h4" />
  </svg>
)

const ITEMS = [
  { href: '/', label: 'Mapa', Icon: MapIcon },
  { href: '/reportar', label: 'Reportar', Icon: ReportIcon },
  { href: '/dashboard', label: 'Cola', Icon: QueueIcon },
  { href: '/rutas', label: 'Rutas', Icon: RouteIcon },
  { href: '/suscripciones', label: 'Avisos', Icon: BellIcon },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Secciones"
      // z-1100: Leaflet usa hasta 1000 para sus paneles y controles.
      className="fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-white/95 backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-[520px]">
        {ITEMS.map(({ href, label, Icon }) => {
          // `/` solo está activo en la raíz; el resto acepta subrutas.
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 pb-1 text-[11px] font-medium leading-none transition ${
                  active ? 'text-purple-700' : 'text-muted'
                }`}
              >
                <Icon />
                {label}
                {/* Subrayado del activo: el color solo no basta (WCAG 2.2). */}
                <span
                  aria-hidden
                  className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? 'bg-purple-700' : 'bg-transparent'}`}
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
