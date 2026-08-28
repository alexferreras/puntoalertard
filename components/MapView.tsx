'use client'

import dynamic from 'next/dynamic'

import type { MapRoute, IncidentMapProps } from '@/components/IncidentMap'

export type MapRouteInput = MapRoute

// Leaflet toca `window` al importarse: el mapa solo puede cargarse en cliente.
const IncidentMap = dynamic(() => import('@/components/IncidentMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-line/40" role="status">
      <span className="text-sm text-muted">Cargando mapa…</span>
    </div>
  ),
})

export function MapView(props: IncidentMapProps) {
  return <IncidentMap {...props} />
}
