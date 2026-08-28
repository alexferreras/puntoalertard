import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

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
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  )
}
