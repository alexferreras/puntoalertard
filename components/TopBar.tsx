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
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/brand/symbol.png"
            alt=""
            aria-hidden
            width={32}
            height={32}
            priority
            className="size-8"
          />
          <span className="text-[17px] font-semibold leading-none tracking-tight">
            PuntoAlerta<span className="text-gold-500">RD</span>
          </span>
        </Link>

        {/*
          Los cinco enlaces no caben en una línea junto a la marca en un móvil:
          quedaban cortados en el borde derecho, que se lee como un fallo. En
          móvil la navegación vive en `BottomNav`; aquí aparece desde `sm`.
        */}
        <nav
          aria-label="Secciones"
          className="hidden flex-1 items-center gap-0.5 sm:flex"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {/*
        El aviso legal va en su propia franja: dentro de la barra obligaba a
        elegir entre truncarlo o partir la navegación en varias líneas.
      */}
      <p className="border-t border-white/10 px-4 py-1.5 text-center text-[11px] leading-snug text-white/65">
        Información complementaria. No sustituye alertas oficiales del COE ni del 9-1-1.
      </p>
    </header>
  )
}
