'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CategoryFilter } from '@/components/CategoryFilter'
import { IncidentList } from '@/components/IncidentList'
import { MapLegend } from '@/components/MapLegend'
import { MapView } from '@/components/MapView'
import { RiskReasons } from '@/components/RiskReasons'
import { WeatherBanner } from '@/components/WeatherBanner'
import { RiskBadge } from '@/components/badges'
import { fetchIncidents, type IncidentsSnapshot } from '@/lib/client'
import { DEMO_CENTER, DEMO_ZOOM, type LatLng } from '@/lib/geo'
import { relativeTime } from '@/lib/format'
import type { Category, RiskAssessment } from '@/lib/types'
import type { WeatherScenario } from '@/lib/weather-shared'

interface ScoreChange {
  zone: RiskAssessment
  previousScore: number
  previousLevel: RiskAssessment['level']
}

export default function MapPage() {
  const [scenario, setScenario] = useState<WeatherScenario>('real')
  const [category, setCategory] = useState<Category | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [center, setCenter] = useState<LatLng>(DEMO_CENTER)
  const [zoom, setZoom] = useState(DEMO_ZOOM)
  const [change, setChange] = useState<ScoreChange | null>(null)

  // La clave identifica la consulta vigente; `loading` se deriva de si ya llegó
  // su respuesta, en lugar de escribir estado dentro del efecto.
  const queryKey = `${scenario}|${category ?? 'todas'}|${attempt}`
  const [result, setResult] = useState<{ key: string; data: IncidentsSnapshot } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const loading = result?.key !== queryKey && failure?.key !== queryKey

  // Scores anteriores: permiten mostrar el salto 🟡 → 🔴 al cambiar de escenario.
  const previousZones = useRef<Map<string, RiskAssessment>>(new Map())

  useEffect(() => {
    const controller = new AbortController()
    fetchIncidents({ scenario, category }, controller.signal)
      .then((snapshot) => {
        const worst = snapshot.zones[0]
        const previous = worst ? previousZones.current.get(worst.zoneKey) : undefined
        setChange(
          worst && previous && previous.score !== worst.score
            ? { zone: worst, previousScore: previous.score, previousLevel: previous.level }
            : null,
        )
        previousZones.current = new Map(snapshot.zones.map((zone) => [zone.zoneKey, zone]))
        setResult({ key: queryKey, data: snapshot })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setFailure({ key: queryKey, message: err.message })
      })
    return () => controller.abort()
  }, [queryKey, scenario, category])

  const data = result?.data ?? null
  const error = failure?.key === queryKey ? failure.message : null

  const zone = data?.zones.find((z) => z.zoneKey === selectedZone) ?? data?.zones[0] ?? null

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <section className="overflow-hidden rounded-[var(--radius-card)] bg-purple-900 text-white">
        <div className="flex flex-col-reverse items-center gap-6 px-5 py-6 sm:flex-row sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-500">
              Reporta. Previene. Protege.
            </p>
            <h1 className="mt-1.5 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Reporta un punto. Anticipa el riesgo.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              Los reportes ciudadanos se convierten en zonas con un nivel de riesgo/prioridad
              explicable, que se recalcula cuando cambia el pronóstico de lluvia.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/reportar"
                className="min-h-11 rounded-[var(--radius-control)] bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-95"
              >
                Reportar un punto
              </Link>
              <Link
                href="/dashboard"
                className="min-h-11 rounded-[var(--radius-control)] border border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Ver prioridades
              </Link>
            </div>
          </div>
          <Image
            src="/brand/symbol.png"
            alt="PuntoAlerta RD"
            width={176}
            height={176}
            priority
            className="size-28 shrink-0 sm:size-40"
          />
        </div>
      </section>

      {change && (
        <p
          role="status"
          className="mt-4 rounded-[var(--radius-card)] border border-gold-500/60 bg-gold-500/15 px-4 py-3 text-sm font-medium text-ink"
        >
          El riesgo de la zona más expuesta cambió de{' '}
          <strong className="tabular-nums">{change.previousScore}</strong> ({change.previousLevel}) a{' '}
          <strong className="tabular-nums">{change.zone.score}</strong> ({change.zone.level}) al
          actualizar el contexto meteorológico.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <WeatherBanner weather={data?.weather ?? null} scenario={scenario} onScenarioChange={setScenario} />

          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: 'Reportes', value: data?.reports.length ?? '—' },
              { label: 'Zonas', value: data?.zones.length ?? '—' },
              { label: 'Recurrentes', value: data?.recurrent.length ?? '—' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-center"
              >
                <dt className="text-xs text-muted">{kpi.label}</dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">{kpi.value}</dd>
              </div>
            ))}
          </dl>

          <CategoryFilter value={category} onChange={setCategory} />

          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">Zonas con mayor riesgo</h2>
            {loading && !data && <p className="mt-2 text-sm text-muted">Calculando riesgo…</p>}
            {data?.zones.length === 0 && (
              <p className="mt-2 text-sm text-muted">
                No hay reportes en el área. Sé la primera persona en reportar un punto.
              </p>
            )}
            <ul className="mt-2 space-y-1.5">
              {data?.zones.slice(0, 5).map((z) => (
                <li key={z.zoneKey}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedZone(z.zoneKey)
                      setCenter({ lat: z.lat, lng: z.lng })
                      // Zoom 16 saca al mapa del modo agrupado: se ven los
                      // reportes individuales de la zona elegida.
                      setZoom(16)
                    }}
                    aria-pressed={z.zoneKey === zone?.zoneKey}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left transition ${
                      z.zoneKey === zone?.zoneKey
                        ? 'border-purple-700 bg-purple-700/5'
                        : 'border-line hover:border-purple-500'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {z.reportIds.length} reporte(s) en un radio de {z.radiusMeters} m
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {z.lat.toFixed(4)}, {z.lng.toFixed(4)} · actualizado{' '}
                        {relativeTime(z.computedAt)}
                      </span>
                    </span>
                    <RiskBadge level={z.level} score={z.score} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <MapLegend />
        </div>

        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-card)] border border-risk-critico/30 bg-risk-critico/10 p-4"
            >
              <p className="text-sm font-medium text-ink">{error}</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="mt-2 min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 text-sm font-semibold text-white"
              >
                Intentar nuevamente
              </button>
            </div>
          )}

          <div className="h-[420px] overflow-hidden rounded-[var(--radius-card)] border border-line lg:h-[560px]">
            <MapView
              reports={data?.reports ?? []}
              zones={data?.zones ?? []}
              center={center}
              zoom={zoom}
              selectedZoneKey={zone?.zoneKey ?? null}
              selectedReportId={selectedReport}
              onSelectReport={(report) => {
                setSelectedReport(report.id)
                const owner = data?.zones.find((z) => z.reportIds.includes(report.id))
                if (owner) setSelectedZone(owner.zoneKey)
              }}
            />
          </div>

          <IncidentList
            reports={data?.reports ?? []}
            zones={data?.zones ?? []}
            selectedId={selectedReport}
            onSelect={(report) => {
              setSelectedReport(report.id)
              setCenter({ lat: report.lat, lng: report.lng })
              setZoom(17)
              const owner = data?.zones.find((z) => z.reportIds.includes(report.id))
              if (owner) setSelectedZone(owner.zoneKey)
            }}
          />

          {zone && (
            <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">
                  ¿Por qué esta zona tiene ese riesgo?
                </h2>
                <Link
                  href={`/suscripciones?zona=${encodeURIComponent(zone.zoneKey)}`}
                  className="min-h-11 rounded-[var(--radius-control)] border border-purple-700 px-3 py-2 text-sm font-semibold text-purple-700"
                >
                  Avisarme de esta zona
                </Link>
              </div>
              <div className="mt-3">
                <RiskReasons risk={zone} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
