'use client'

import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useState } from 'react'
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'

import { CategoryChip, RiskBadge, StatusBadge } from '@/components/badges'
import { relativeTime } from '@/lib/format'
import { DEMO_CENTER, DEMO_ZOOM, type LatLng } from '@/lib/geo'
import type { PublicIncident } from '@/lib/public'
import { CATEGORY_META, RISK_LEVEL_META, type RiskAssessment } from '@/lib/types'

export interface MapRoute {
  id: string
  label: string
  geometry: LatLng[]
  color: string
  dashed?: boolean
}

export interface IncidentMapProps {
  reports: PublicIncident[]
  zones: RiskAssessment[]
  routes?: MapRoute[]
  center?: LatLng
  zoom?: number
  selectedReportId?: string | null
  /** Zona resaltada en el mapa, para sincronizar con la selección del panel. */
  selectedZoneKey?: string | null
  onSelectReport?: (report: PublicIncident) => void
  /** Permite elegir zonas pulsando su círculo (suscripciones por zona). */
  onSelectZone?: (zone: RiskAssessment) => void
  /** Permite elegir un punto en el mapa (formulario de reporte, origen/destino de ruta). */
  onPickPoint?: (point: LatLng) => void
  pickedPoint?: LatLng | null
  className?: string
}

/** Pin con el ícono de la categoría, coloreado por el riesgo de su zona. */
function categoryIcon(report: PublicIncident, color: string, selected: boolean): L.DivIcon {
  const size = selected ? 40 : 32
  return L.divIcon({
    className: 'pa-marker',
    html: `<span style="
        display:flex;align-items:center;justify-content:center;
        width:${size}px;height:${size}px;border-radius:9999px;
        background:#fff;border:3px solid ${color};
        box-shadow:0 2px 6px rgba(36,23,45,.25);
        font-size:${selected ? 18 : 15}px;line-height:1;
      ">${CATEGORY_META[report.category].icon}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function pickedIcon(): L.DivIcon {
  return L.divIcon({
    className: 'pa-picked',
    html: `<span style="
        display:block;width:18px;height:18px;border-radius:9999px;
        background:#532275;border:3px solid #fff;
        box-shadow:0 0 0 3px rgba(83,34,117,.35);
      "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

/** §18 — a partir de este zoom se ven los reportes uno a uno; por debajo, agrupados. */
const CLUSTER_MAX_ZOOM = 13

/**
 * Marcador de zona agrupada: un círculo con el número de reportes. Se agrupa por
 * la zona que ya calcula el Risk Engine, así que el "cluster" del mapa y la zona
 * del modelo son la misma cosa; un clustering por píxeles habría inventado una
 * segunda agrupación que no significa nada en el dominio.
 */
function clusterIcon(count: number, color: string): L.DivIcon {
  const size = count > 4 ? 46 : 38
  return L.divIcon({
    className: 'pa-cluster',
    html: `<span style="
        display:flex;align-items:center;justify-content:center;
        width:${size}px;height:${size}px;border-radius:9999px;
        background:#fff;border:3px solid ${color};
        box-shadow:0 2px 6px rgba(36,23,45,.25);
        font-size:14px;font-weight:600;color:#24172d;line-height:1;
      ">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Sigue el zoom para decidir entre marcadores agrupados o individuales. */
function useZoom(initial: number): number {
  const map = useMap()
  const [zoom, setZoom] = useState(initial)
  useEffect(() => {
    const update = () => setZoom(map.getZoom())
    update()
    map.on('zoomend', update)
    return () => {
      map.off('zoomend', update)
    }
  }, [map])
  return zoom
}

function ClickHandler({ onPickPoint }: { onPickPoint?: (point: LatLng) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!onPickPoint) return
    const handler = (event: L.LeafletMouseEvent) => {
      onPickPoint({ lat: event.latlng.lat, lng: event.latlng.lng })
    }
    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [map, onPickPoint])
  return null
}

/**
 * `center` y `zoom` de `MapContainer` son **solo valores iniciales**: cambiarlos
 * después no mueve el mapa. Sin este componente, seleccionar una zona en el panel
 * no tenía ningún efecto visible — el mapa sí actualizaba el panel, pero no al
 * revés.
 */
function Recenter({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom)
  }, [map, center.lat, center.lng, zoom])
  return null
}

/** Ajusta el encuadre cuando cambian las rutas dibujadas. */
function FitRoutes({ routes }: { routes: MapRoute[] }) {
  const map = useMap()
  const signature = routes.map((r) => `${r.id}:${r.geometry.length}`).join('|')
  useEffect(() => {
    const points = routes.flatMap((r) => r.geometry)
    if (points.length < 2) return
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [40, 40] },
    )
    // `signature` resume las rutas: evita reencuadrar en cada render.
  }, [map, signature]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function IncidentMap({
  reports,
  zones,
  routes = [],
  center = DEMO_CENTER,
  zoom = DEMO_ZOOM,
  selectedReportId = null,
  selectedZoneKey = null,
  onSelectReport,
  onSelectZone,
  onPickPoint,
  pickedPoint = null,
  className = 'h-full w-full',
}: IncidentMapProps) {
  const zoneByReport = new Map<string, RiskAssessment>()
  for (const zone of zones) {
    for (const reportId of zone.reportIds) zoneByReport.set(reportId, zone)
  }

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className={className} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />

      {zones.map((zone) => {
        const selected = zone.zoneKey === selectedZoneKey
        return (
          <Circle
            key={zone.zoneKey}
            center={[zone.lat, zone.lng]}
            radius={zone.radiusMeters}
            pathOptions={{
              color: RISK_LEVEL_META[zone.level].color,
              fillColor: RISK_LEVEL_META[zone.level].color,
              fillOpacity: selected
                ? 0.4
                : zone.level === 'critico'
                  ? 0.28
                  : zone.level === 'alto'
                    ? 0.2
                    : 0.12,
              // La zona seleccionada se distingue por trazo, no solo por relleno.
              weight: selected ? 4 : zone.level === 'critico' ? 2 : 1,
              dashArray: selected ? '6 4' : undefined,
            }}
            eventHandlers={onSelectZone ? { click: () => onSelectZone(zone) } : undefined}
          >
            <Tooltip permanent={selected}>
              <strong>
                {RISK_LEVEL_META[zone.level].icon} {zone.score}/100 ·{' '}
                {RISK_LEVEL_META[zone.level].label}
              </strong>
              <br />
              {zone.reportIds.length} reporte(s) en un radio de {zone.radiusMeters} m
            </Tooltip>
          </Circle>
        )
      })}

      {routes.map((route) => (
        <Polyline
          key={route.id}
          positions={route.geometry.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{
            color: route.color,
            weight: 5,
            opacity: 0.9,
            dashArray: route.dashed ? '8 8' : undefined,
          }}
        >
          <Tooltip sticky>{route.label}</Tooltip>
        </Polyline>
      ))}

      <Markers
        reports={reports}
        zones={zones}
        zoneByReport={zoneByReport}
        selectedReportId={selectedReportId}
        onSelectReport={onSelectReport}
        initialZoom={zoom}
      />

      {pickedPoint && <Marker position={[pickedPoint.lat, pickedPoint.lng]} icon={pickedIcon()} />}

      <Recenter center={center} zoom={zoom} />
      <ClickHandler onPickPoint={onPickPoint} />
      <FitRoutes routes={routes} />
    </MapContainer>
  )
}

function Markers({
  reports,
  zones,
  zoneByReport,
  selectedReportId,
  onSelectReport,
  initialZoom,
}: {
  reports: PublicIncident[]
  zones: RiskAssessment[]
  zoneByReport: Map<string, RiskAssessment>
  selectedReportId: string | null
  onSelectReport?: (report: PublicIncident) => void
  initialZoom: number
}) {
  const zoom = useZoom(initialZoom)

  // Alejado: un marcador por zona con el número de reportes.
  if (zoom <= CLUSTER_MAX_ZOOM) {
    return (
      <>
        {zones.map((zone) => (
          <Marker
            key={`cluster-${zone.zoneKey}`}
            position={[zone.lat, zone.lng]}
            icon={clusterIcon(zone.reportIds.length, RISK_LEVEL_META[zone.level].color)}
            eventHandlers={
              onSelectReport
                ? {
                    click: () => {
                      const first = reports.find((r) => zone.reportIds.includes(r.id))
                      if (first) onSelectReport(first)
                    },
                  }
                : undefined
            }
          >
            <Tooltip>
              <strong>
                {RISK_LEVEL_META[zone.level].icon} {zone.score}/100 ·{' '}
                {RISK_LEVEL_META[zone.level].label}
              </strong>
              <br />
              {zone.reportIds.length} reporte(s) en {zone.radiusMeters} m · acerca el mapa para
              verlos
            </Tooltip>
          </Marker>
        ))}
      </>
    )
  }

  return (
    <>
      {reports.map((report) => {
        const zone = zoneByReport.get(report.id)
        const color = zone ? RISK_LEVEL_META[zone.level].color : '#7542a6'
        return (
          <Marker
            key={report.id}
            position={[report.lat, report.lng]}
            icon={categoryIcon(report, color, report.id === selectedReportId)}
            eventHandlers={onSelectReport ? { click: () => onSelectReport(report) } : undefined}
          >
            <Popup>
              <div className="space-y-1.5">
                <CategoryChip category={report.category} />
                <p className="text-sm text-ink">{report.description ?? 'Sin descripción'}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={report.status} />
                  {zone && <RiskBadge level={zone.level} score={zone.score} size="sm" />}
                </div>
                <p className="text-xs text-muted">
                  Severidad {report.severity}/10 · {relativeTime(report.createdAt)}
                </p>
              </div>
            </Popup>
          </Marker>
        )
      })}

    </>
  )
}
