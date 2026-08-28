import Image from 'next/image'
import Link from 'next/link'

const LINKS = [
  { href: '/', label: 'Mapa' },
  { href: '/reportar', label: 'Reportar' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/rutas', label: 'Rutas' },
  { href: '/suscripciones', label: 'Avisos' },
] as const

export function TopBar() {
  return (
    <header className="bg-purple-900 text-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/brand/symbol.png"
            alt=""
            aria-hidden
            width={36}
            height={36}
            priority
            className="size-9"
          />
          <span className="text-lg font-semibold leading-tight tracking-tight">
            PuntoAlerta<span className="text-gold-500">RD</span>
          </span>
        </Link>
        <nav aria-label="Secciones" className="flex flex-1 flex-wrap items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-white/70">
          Información complementaria. No sustituye alertas oficiales del COE ni del 9-1-1.
        </p>
      </div>
    </header>
  )
}
