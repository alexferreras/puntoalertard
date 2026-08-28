'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IncidentCard } from '@/components/IncidentCard'
import { MapView } from '@/components/MapView'
import { RiskReasons } from '@/components/RiskReasons'
import { WeatherBanner } from '@/components/WeatherBanner'
import {
  fetchIncidents,
  fetchRole,
  loginOperator,
  logoutOperator,
  updateIncident,
  type IncidentsSnapshot,
  type Role,
} from '@/lib/client'
import { plural } from '@/lib/format'
import { isActive } from '@/lib/status'
import { DEMO_CENTER } from '@/lib/geo'
import type { PublicIncident } from '@/lib/public'
import { RISK_LEVELS, type ReportStatus, type RiskAssessment } from '@/lib/types'
import type { WeatherScenario } from '@/lib/weather-shared'

interface Queued {
  report: PublicIncident
  zone: RiskAssessment | null
}

/** Orden del doc §16: crítico/alto primero, luego score desc y edad asc. */
function priorityQueue(snapshot: IncidentsSnapshot): Queued[] {
  const zoneOf = new Map<string, RiskAssessment>()
  for (const zone of snapshot.zones) {
    for (const id of zone.reportIds) zoneOf.set(id, zone)
  }
  return snapshot.reports
    .filter((report) => isActive(report.status))
    .map((report) => ({ report, zone: zoneOf.get(report.id) ?? null }))
    .sort((a, b) => {
      const scoreA = a.zone?.score ?? 0
      const scoreB = b.zone?.score ?? 0
      if (scoreA !== scoreB) return scoreB - scoreA
      return new Date(a.report.createdAt).getTime() - new Date(b.report.createdAt).getTime()
    })
}

export default function DashboardPage() {
  const [scenario, setScenario] = useState<WeatherScenario>('lluvia')
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [code, setCode] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  const queryKey = `${scenario}|${attempt}`
  const [result, setResult] = useState<{ key: string; data: IncidentsSnapshot } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchIncidents({ scenario }, controller.signal)
      .then((snapshot) => setResult({ key: queryKey, data: snapshot }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setFailure({ key: queryKey, message: err.message })
      })
    return () => controller.abort()
  }, [queryKey, scenario])

  useEffect(() => {
    const controller = new AbortController()
    fetchRole(controller.signal)
      .then(({ role: current }) => setRole(current))
      .catch(() => setRole(null))
    return () => controller.abort()
  }, [])

  async function login() {
    setAuthError(null)
    try {
      const { role: current } = await loginOperator(code)
      setRole(current)
      setCode('')
    } catch (err) {
      setAuthError((err as Error).message)
    }
  }

  async function logout() {
    await logoutOperator().catch(() => null)
    setRole(null)
  }

  const data = result?.data ?? null
  const error = failure?.key === queryKey ? failure.message : null
  const queue = data ? priorityQueue(data) : []
  const selected = queue.find((item) => item.report.id === selectedId) ?? queue[0] ?? null

  /**
   * Seleccionar un incidente en el mapa sí marcaba su tarjeta, pero la tarjeta
   * podía estar muy abajo en la cola y no se veía nada: parecía que el mapa no
   * hacía nada. `block: 'nearest'` no mueve la vista si ya está visible, así que
   * también es inocuo al pulsar la tarjeta directamente.
   */
  useEffect(() => {
    if (!selectedId) return
    document
      .getElementById(`incidente-${selectedId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedId])

  async function advance(report: PublicIncident, status: ReportStatus, note?: string) {
    setBusyId(report.id)
    try {
      await updateIncident(report.id, { status, note, scenario })
      setAttempt((n) => n + 1)
    } catch (err) {
      setFailure({ key: queryKey, message: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  const counts = {
    activos: queue.length,
    criticos: queue.filter((item) => item.zone?.level === 'critico').length,
    recurrentes: data?.recurrent.length ?? 0,
    cerrados: data?.reports.filter((report) => !isActive(report.status)).length ?? 0,
  }

  // Ruta de brigada con los tres puntos más prioritarios (RF-16).
  const brigadeHref = (() => {
    const points = queue.slice(0, 3).map((item) => `${item.report.lat},${item.report.lng}`)
    return points.length >= 2 ? `/rutas?puntos=${points.join(';')}&escenario=${scenario}` : '/rutas'
  })()

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Prioridades de intervención</h1>
          <p className="mt-1 text-sm text-muted">
            Cola ordenada por riesgo de la zona. Los pesos del modelo son configurables y no
            constituyen una predicción científica validada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={brigadeHref}
            className="min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ruta de brigada con el top 3
          </Link>
          {role === 'operador' && (
            <Link
              href="/dashboard/notificaciones"
              className="min-h-11 rounded-[var(--radius-control)] border border-line px-4 py-2.5 text-sm font-medium text-ink"
            >
              Bandeja de avisos
            </Link>
          )}
          {role === 'operador' && (
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-11 rounded-[var(--radius-control)] border border-line px-4 py-2.5 text-sm font-medium text-ink"
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </div>

      {role !== 'operador' && (
        <section className="mt-4 rounded-[var(--radius-card)] border border-gold-500/60 bg-gold-500/10 p-4">
          <h2 className="text-sm font-semibold text-ink">Modo consulta</h2>
          <p className="mt-1 text-sm text-muted">
            Puedes ver la cola priorizada, pero validar, asignar o cerrar incidentes requiere sesión
            de operador.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="codigo" className="block text-xs font-medium text-ink">
                Código de acceso
              </label>
              <input
                id="codigo"
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void login()
                }}
                autoComplete="off"
                className="mt-1 min-h-11 rounded-[var(--radius-control)] border border-line px-3 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={code.length === 0}
              onClick={() => void login()}
              className="min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Entrar como operador
            </button>
          </div>
          {authError && (
            <p role="alert" className="mt-2 text-sm font-medium text-risk-critico">
              {authError}
            </p>
          )}
        </section>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Incidentes activos', value: counts.activos },
          { label: 'En zona crítica', value: counts.criticos },
          { label: 'Puntos recurrentes', value: counts.recurrentes },
          { label: 'Cerrados', value: counts.cerrados },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-3">
            <dt className="text-xs text-muted">{kpi.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums text-ink">{kpi.value}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <div role="alert" className="mt-4 rounded-[var(--radius-card)] border border-risk-critico/30 bg-risk-critico/10 p-4">
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <WeatherBanner weather={data?.weather ?? null} scenario={scenario} onScenarioChange={setScenario} />
          {!data && <p className="mt-4 text-sm text-muted">Cargando cola de incidentes…</p>}
          {data && queue.length === 0 && (
            <p className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm text-muted">
              No hay incidentes activos. Cuando llegue un reporte aparecerá aquí ordenado por riesgo.
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {queue.map((item, index) => (
              <IncidentCard
                key={item.report.id}
                report={item.report}
                zone={item.zone}
                priority={index + 1}
                selected={item.report.id === selected?.report.id}
                busy={busyId === item.report.id}
                canAct={role === 'operador'}
                onSelect={() => setSelectedId(item.report.id)}
                onAdvance={(status, note) => void advance(item.report, status, note)}
              />
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="h-64 overflow-hidden rounded-[var(--radius-card)] border border-line sm:h-72">
            {/*
              Solo los incidentes de la cola: el mapa mostraba también los
              cerrados y, al pulsar uno, `selectedId` apuntaba a algo que no
              existe en la lista y la selección revertía en silencio a la primera
              tarjeta. Parecía que el mapa no hacía nada.
            */}
            <MapView
              reports={queue.map((item) => item.report)}
              zones={data?.zones ?? []}
              center={
                selected ? { lat: selected.report.lat, lng: selected.report.lng } : DEMO_CENTER
              }
              // 14 en lugar de 12: por debajo de 13 el mapa agrupa y al pulsar
              // se seleccionaba "algún" reporte de la zona, no el que se veía.
              zoom={selected ? 16 : 14}
              selectedReportId={selected?.report.id ?? null}
              onSelectReport={(report) => setSelectedId(report.id)}
            />
          </div>

          {selected?.zone && (
            <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <h2 className="text-sm font-semibold text-ink">Desglose del riesgo</h2>
              <div className="mt-3">
                <RiskReasons risk={selected.zone} />
              </div>
            </section>
          )}

          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">Distribución por nivel</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {RISK_LEVELS.map((level) => (
                <li key={level} className="flex items-center justify-between">
                  <span className="capitalize">{level}</span>
                  <span className="tabular-nums text-muted">
                    {plural(data?.zones.filter((zone) => zone.level === level).length ?? 0, 'zona')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
