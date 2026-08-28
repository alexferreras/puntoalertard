import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import { BottomNav } from '@/components/BottomNav'
import { ConnectionBanner } from '@/components/ConnectionBanner'
import { TopBar } from '@/components/TopBar'

import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PuntoAlerta RD — Reporta. Previene. Protege.',
  description:
    'Plataforma dominicana de reporte ciudadano e inteligencia de riesgo urbano: reportes, Risk Score explicable, clima y rutas de menor exposición.',
}

export const viewport: Viewport = {
  themeColor: '#3b1558',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <ConnectionBanner />
        <TopBar />
        {/* `pb-16` reserva el alto de la barra inferior en móvil. */}
        <main className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</main>
        <BottomNav />
      </body>
    </html>
  )
}
