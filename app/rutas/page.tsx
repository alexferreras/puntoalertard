'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { MapView, type MapRouteInput } from '@/components/MapView'
import { RiskBadge } from '@/components/badges'
import { WeatherBanner } from '@/components/WeatherBanner'
import { compareRoutes, fetchIncidents, type IncidentsSnapshot } from '@/lib/client'
import { kilometersOf, minutesOf, plural } from '@/lib/format'
import { DEMO_CENTER, type LatLng } from '@/lib/geo'
import type { RouteComparison, VerificationLevel } from '@/lib/routes'
import { CATEGORY_META } from '@/lib/types'

/** §15.2 — cómo se comunica el peso de verificación en la tarjeta de ruta. */
const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  operador: 'validado por operador',
  ia: 'clasificado por IA',
  sin_verificar: 'sin verificar',
}
import { WEATHER_SCENARIOS, type WeatherScenario } from '@/lib/weather-shared'

/** Par calibrado para la demo: la ruta directa cruza la zona crítica. */
const DEMO_ORIGIN: LatLng = { lat: 18.4795, lng: -69.87 }
const DEMO_DESTINATION: LatLng = { lat: 18.483, lng: -69.925 }

function parsePoints(raw: string | null): LatLng[] {
  if (!raw) return []
  return raw
    .split(';')
    .map((chunk) => chunk.split(',').map(Number))
    .filter((parts) => parts.length === 2 && parts.every(Number.isFinite))
    .map(([lat, lng]) => ({ lat, lng }))
}

function RoutesContent() {
  const params = useSearchParams()
  const fromQuery = parsePoints(params.get('puntos'))
  const scenarioParam = params.get('escenario')

  const [scenario, setScenario] = useState<WeatherScenario>(
    (WEATHER_SCENARIOS as readonly string[]).includes(scenarioParam ?? '')
      ? (scenarioParam as WeatherScenario)
      : 'lluvia',
  )
  const [origin, setOrigin] = useState<LatLng>(fromQuery[0] ?? DEMO_ORIGIN)
  const [destination, setDestination] = useState<LatLng>(
    fromQuery.length >= 2 ? fromQuery[fromQuery.length - 1] : DEMO_DESTINATION,
  )
  const [via, setVia] = useState<LatLng[]>(fromQuery.slice(1, -1))
  const [picking, setPicking] = useState<'origen' | 'destino'>('origen')
  const [attempt, setAttempt] = useState(0)

  const [snapshot, setSnapshot] = useState<IncidentsSnapshot | null>(null)
  const [comparison, setComparison] = useState<(RouteComparison & { weather: unknown }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchIncidents({ scenario }, controller.signal)
      .then(setSnapshot)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [scenario, attempt])

  async function compare() {
    setLoading(true)
    setError(null)
    try {
      setComparison(await compareRoutes({ origin, destination, via, scenario }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const routeColors = (id: string): { color: string; dashed: boolean } => {
    if (!comparison) return { color: '#7542a6', dashed: false }
    if (id === comparison.leastExposed.id) return { color: '#2e7d32', dashed: false }
    if (id === comparison.fastest.id) return { color: '#b42318', dashed: false }
    return { color: '#625a68', dashed: true }
  }

  const mapRoutes: MapRouteInput[] =
    comparison?.options.map((option) => ({
      id: option.id,
      label: `${option.label} · ${minutesOf(option.durationSeconds)} min · exposición ${option.exposure.score}`,
      geometry: option.geometry,
      ...routeColors(option.id),
    })) ?? []

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Comparar rutas</h1>
      <p className="mt-1 text-sm text-muted">
        Se comparan rutas reales de OpenStreetMap por tiempo y por exposición a los incidentes
        reportados. El tiempo y la distancia se muestran siempre: el trade-off no se esconde.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <WeatherBanner weather={snapshot?.weather ?? null} scenario={scenario} onScenarioChange={setScenario} />

          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">Origen y destino</h2>
            <p className="mt-1 text-xs text-muted">
              Elige qué punto vas a mover y toca el mapa.
            </p>
            <div className="mt-2 flex gap-2">
              {(['origen', 'destino'] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  onClick={() => setPicking(which)}
                  aria-pressed={picking === which}
                  className={`min-h-11 flex-1 rounded-[var(--radius-control)] border px-3 text-sm font-medium capitalize ${
                    picking === which
                      ? 'border-purple-700 bg-purple-700 text-white'
                      : 'border-line bg-white text-ink'
                  }`}
                >
                  {which}
                </button>
              ))}
            </div>
            <dl className="mt-3 space-y-1 text-xs text-muted">
              <div className="flex justify-between gap-2">
                <dt>Origen</dt>
                <dd className="tabular-nums text-ink">
                  {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Destino</dt>
                <dd className="tabular-nums text-ink">
                  {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
                </dd>
              </div>
              {via.length > 0 && (
                <div className="flex justify-between gap-2">
                  <dt>Puntos intermedios</dt>
                  <dd className="text-ink">{via.length}</dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void compare()}
                disabled={loading}
                className="min-h-11 flex-1 rounded-[var(--radius-control)] bg-purple-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? 'Calculando rutas…' : 'Comparar rutas'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrigin(DEMO_ORIGIN)
                  setDestination(DEMO_DESTINATION)
                  setVia([])
                  setAttempt((n) => n + 1)
                }}
                className="min-h-11 rounded-[var(--radius-control)] border border-line px-3 text-sm font-medium text-ink"
              >
                Escenario de la demo
              </button>
            </div>
          </section>

          {error && (
            <p role="alert" className="rounded-[var(--radius-control)] bg-risk-critico/10 px-3 py-2 text-sm font-medium text-risk-critico">
              {error}
            </p>
          )}

          {comparison && (
            <section className="rounded-[var(--radius-card)] border border-gold-500/60 bg-gold-500/10 p-4">
              <h2 className="text-sm font-semibold text-ink">Recomendación</h2>
              <p className="mt-1 text-sm text-ink">{comparison.recommendation}</p>
              <p className="mt-2 text-xs text-muted">
                Basado en incidentes reportados y verificados en la plataforma. No refleja
                condiciones de tránsito en tiempo real.
              </p>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <div className="h-[420px] overflow-hidden rounded-[var(--radius-card)] border border-line lg:h-[480px]">
            <MapView
              reports={snapshot?.reports ?? []}
              zones={snapshot?.zones ?? []}
              routes={mapRoutes}
              center={snapshot?.zones[0] ? { lat: snapshot.zones[0].lat, lng: snapshot.zones[0].lng } : DEMO_CENTER}
              zoom={13}
              pickedPoint={picking === 'origen' ? origin : destination}
              onPickPoint={(point) => (picking === 'origen' ? setOrigin(point) : setDestination(point))}
            />
          </div>

          {comparison && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {comparison.options.map((option) => {
                const recommended = option.id === comparison.recommendedRouteId
                const { color } = routeColors(option.id)
                return (
                  <li
                    key={option.id}
                    className={`rounded-[var(--radius-card)] border bg-white p-4 ${
                      recommended ? 'border-risk-bajo' : 'border-line'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="h-1.5 w-6 rounded-full" style={{ backgroundColor: color }} />
                      <h3 className="text-sm font-semibold text-ink">{option.label}</h3>
                    </div>
                    <p className="mt-2 text-sm text-ink">
                      <span className="text-xl font-semibold tabular-nums">
                        {minutesOf(option.durationSeconds)} min
                      </span>{' '}
                      <span className="text-muted">· {kilometersOf(option.distanceMeters)}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      Exposición <span className="font-semibold tabular-nums">{option.exposure.score}</span>/100
                      {option.exposure.criticalCount > 0 && (
                        <span className="text-risk-critico">
                          {' '}· {plural(option.exposure.criticalCount, 'zona crítica', 'zonas críticas')}
                        </span>
                      )}
                    </p>
                    {option.exposure.incidents.length === 0 ? (
                      <p className="mt-2 text-xs text-risk-bajo">
                        No pasa cerca de incidentes reportados.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {option.exposure.incidents.slice(0, 3).map((incident) => (
                          <li
                            key={incident.reportId}
                            className="flex flex-wrap items-center gap-1.5 text-xs text-muted"
                          >
                            <RiskBadge level={incident.level} score={incident.riskScore} size="sm" />
                            <span>
                              {CATEGORY_META[incident.category].label.toLowerCase()} a{' '}
                              {incident.distanceMeters} m
                            </span>
                            <span className="text-muted/80">
                              (×{incident.distanceWeight} distancia, ×{incident.verificationWeight}{' '}
                              {VERIFICATION_LABELS[incident.verification]})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {recommended && (
                      <p className="mt-2 text-xs font-semibold text-risk-bajo">Ruta recomendada</p>
                    )}
                    {option.source === 'sintetica' && (
                      <p className="mt-2 text-xs text-gold-700">
                        Trazado estimado: el motor de rutas no respondió.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RoutesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 text-sm text-muted">
          Cargando comparador de rutas…
        </div>
      }
    >
      <RoutesContent />
    </Suspense>
  )
}
