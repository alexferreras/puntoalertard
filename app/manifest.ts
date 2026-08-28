import type { MetadataRoute } from 'next'

/** PWA instalable (§2 del doc: "PWA responsive"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PuntoAlerta RD',
    short_name: 'PuntoAlerta',
    description:
      'Reporta. Previene. Protege. Reportes ciudadanos convertidos en riesgo urbano priorizado para el Gran Santo Domingo.',
    lang: 'es-DO',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#faf8fc',
    theme_color: '#3b1558',
    categories: ['utilities', 'government', 'navigation'],
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
