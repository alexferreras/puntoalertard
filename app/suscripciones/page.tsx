'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { MapView } from '@/components/MapView'
import { RiskBadge } from '@/components/badges'
import { Card, SegmentedControl } from '@/components/ui'
import {
  fetchIncidents,
  fetchSubscriptions,
  setSubscriptionsActive,
  subscribe,
  unsubscribe,
  verifySubscription,
  type IncidentsSnapshot,
  type ManagedSubscription,
} from '@/lib/client'
import { plural } from '@/lib/format'
import { DEMO_CENTER, type LatLng } from '@/lib/geo'
import {
  CATEGORIES,
  CATEGORY_META,
  CATEGORY_SHORT_LABELS,
  RISK_LEVELS,
  RISK_LEVEL_META,
  type Category,
} from '@/lib/types'
import {
  DIGESTS,
  NOTIFICATION_EVENTS,
  type Digest,
  type NotificationEvent,
} from '@/lib/notifications'

/** Textos de cada evento: el nombre técnico no le dice nada a quien se suscribe. */
const EVENT_LABELS: Record<NotificationEvent, string> = {
  cambio_nivel: 'Cuando la zona sube de nivel de riesgo',
  preventivo: 'Cuando se prevé lluvia sobre un punto ya crítico',
  nuevo_reporte: 'Cuando alguien reporta algo nuevo',
  cambio_estado: 'Cuando un incidente avanza de estado',
  resuelto: 'Cuando un incidente se resuelve',
}

const DIGEST_LABELS: Record<Digest, string> = {
  inmediato: 'Al momento',
  diario: 'Diario',
  semanal: 'Semanal',
}

function SubscriptionsContent() {
  const params = useSearchParams()
  const manageToken = params.get('token')
  const verifyTokenParam = params.get('verificar')
  const preselectedZone = params.get('zona')

  if (verifyTokenParam) return <VerifyView token={verifyTokenParam} />
  if (manageToken) return <ManageView token={manageToken} />
  return <SubscribeForm preselectedZone={preselectedZone} />
}

// ---------------------------------------------------------------------------
// Confirmar (doble opt-in)
// ---------------------------------------------------------------------------

function VerifyView({ token }: { token: string }) {
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    verifySubscription(token)
      .then((res) => setState({ ok: res.verified, message: res.message }))
      .catch((err: Error) => setState({ ok: false, message: err.message }))
  }, [token])

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Confirmación de avisos</h1>
      {!state && <p className="mt-3 text-sm text-muted">Confirmando…</p>}
      {state && (
        <p
          role="status"
          className={`mt-3 rounded-[var(--radius-card)] border p-4 text-sm ${
            state.ok
              ? 'border-risk-bajo/40 bg-risk-bajo/10 text-ink'
              : 'border-risk-critico/40 bg-risk-critico/10 text-ink'
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gestionar (pausar, reactivar, darse de baja)
// ---------------------------------------------------------------------------

function ManageView({ token }: { token: string }) {
  const [subscriptions, setSubscriptions] = useState<ManagedSubscription[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchSubscriptions(token, controller.signal)
      .then((res) => setSubscriptions(res.subscriptions))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [token])

  async function toggle(active: boolean) {
    setNotice(null)
    try {
      await setSubscriptionsActive(token, active)
      const res = await fetchSubscriptions(token)
      setSubscriptions(res.subscriptions)
      setNotice(active ? 'Avisos reactivados.' : 'Avisos pausados. Tu configuración se conserva.')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function baja() {
    setNotice(null)
    try {
      await unsubscribe(token)
      setGone(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (gone) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Baja completada</h1>
        <p className="mt-2 text-sm text-muted">
          Tu dirección y tus preferencias fueron borradas. No conservamos ningún dato tuyo.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Tus avisos</h1>
      <p className="mt-1 text-sm text-muted">
        Este enlace es tu acceso: no hay cuenta ni contraseña. Puedes pausar los avisos sin perder la
        configuración, o darte de baja y borrar todo.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-risk-critico/10 px-3 py-2 text-sm font-medium text-risk-critico">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-[var(--radius-control)] bg-risk-bajo/10 px-3 py-2 text-sm font-medium text-ink">
          {notice}
        </p>
      )}

      {!subscriptions && !error && <p className="mt-4 text-sm text-muted">Cargando…</p>}

      {subscriptions?.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          No hay suscripciones activas para este enlace. Puede que ya te hayas dado de baja, o que
          aún no hayas confirmado la dirección.
        </p>
      )}

      {subscriptions?.map((subscription) => (
        <Card key={subscription.id} title={subscription.active ? 'Suscripción activa' : 'Suscripción pausada'}>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Alcance</dt>
              <dd className="text-ink">
                {subscription.scope === 'todas' && 'Todas las zonas'}
                {subscription.scope === 'zonas' && `${plural(subscription.zoneKeys.length, 'zona elegida', 'zonas elegidas')}`}
                {subscription.scope === 'radio' && `${subscription.radiusMeters} m alrededor de un punto`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Nivel mínimo</dt>
              <dd className="text-ink capitalize">{subscription.minLevel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Frecuencia</dt>
              <dd className="text-ink">{DIGEST_LABELS[subscription.digest as Digest]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Categorías</dt>
              <dd className="text-right text-ink">
                {subscription.categories.length === 0
                  ? 'Todas'
                  : subscription.categories
                      .map((c) => CATEGORY_META[c as Category].label)
                      .join(', ')}
              </dd>
            </div>
          </dl>
        </Card>
      ))}

      {subscriptions && subscriptions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void toggle(!subscriptions[0].active)}
            className="min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 text-sm font-semibold text-white"
          >
            {subscriptions[0].active ? 'Pausar avisos' : 'Reactivar avisos'}
          </button>
          <button
            type="button"
            onClick={() => void baja()}
            className="min-h-11 rounded-[var(--radius-control)] border border-risk-critico/40 px-4 text-sm font-semibold text-risk-critico"
          >
            Darme de baja y borrar mis datos
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Suscribirse
// ---------------------------------------------------------------------------

function SubscribeForm({ preselectedZone }: { preselectedZone: string | null }) {
  const [email, setEmail] = useState('')
  const [scope, setScope] = useState<'todas' | 'zonas' | 'radio'>(preselectedZone ? 'zonas' : 'todas')
  const [zoneKeys, setZoneKeys] = useState<string[]>(preselectedZone ? [preselectedZone] : [])
  const [center, setCenter] = useState<LatLng | null>(null)
  const [radiusMeters, setRadiusMeters] = useState(1000)
  const [categories, setCategories] = useState<Category[]>([])
  const [minLevel, setMinLevel] = useState<string>('alto')
  const [events, setEvents] = useState<NotificationEvent[]>(['cambio_nivel', 'preventivo'])
  const [digest, setDigest] = useState<Digest>('diario')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<IncidentsSnapshot | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchIncidents({ scenario: 'real' }, controller.signal)
      .then(setSnapshot)
      .catch(() => null)
    return () => controller.abort()
  }, [])

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const puedeEnviar =
    email.includes('@') &&
    consent &&
    events.length > 0 &&
    (scope !== 'zonas' || zoneKeys.length > 0) &&
    (scope !== 'radio' || center !== null)

  async function enviar() {
    setSending(true)
    setError(null)
    try {
      const res = await subscribe({
        email,
        scope,
        zoneKeys,
        center: scope === 'radio' ? center : null,
        radiusMeters: scope === 'radio' ? radiusMeters : null,
        categories,
        minLevel,
        events,
        digest,
        consent: true,
      })
      setResult(res.message)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Casi listo</h1>
        <p className="mt-3 rounded-[var(--radius-card)] border border-gold-500/60 bg-gold-500/10 p-4 text-sm text-ink">
          {result}
        </p>
        <p className="mt-3 text-sm text-muted">
          Sin confirmar la dirección no enviamos ningún aviso. En esta demo el correo no sale al
          exterior: el enlace de confirmación aparece en la bandeja de avisos del dashboard.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Recibir avisos por correo</h1>
      <p className="mt-1 text-sm text-muted">
        Elige de qué zonas quieres enterarte. Solo pedimos un correo; puedes pausar o darte de baja en
        un clic desde cualquier aviso.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-risk-critico/10 px-3 py-2 text-sm font-medium text-risk-critico">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[1fr_380px]">
        <div className="contents lg:block">
          <Card title="Correo" className="order-1 lg:order-none lg:mt-4">
            <label htmlFor="email" className="mt-1 block text-xs text-muted">
              Es el único dato que guardamos.
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="tu@correo.do"
              className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-line px-3 text-sm"
            />
          </Card>

          <Card title="De qué zonas" className="order-2 lg:order-none lg:mt-4">
            <SegmentedControl
              className="mt-2"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'todas', label: 'Todas' },
                { value: 'zonas', label: 'Elegir zonas' },
                { value: 'radio', label: 'Radio' },
              ]}
            />

            {scope === 'zonas' && (
              <div className="mt-3">
                <p className="text-xs text-muted">
                  Pulsa los círculos del mapa para elegir zonas. {plural(zoneKeys.length, 'elegida', 'elegidas')}.
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {zoneKeys.map((key) => {
                    const zone = snapshot?.zones.find((z) => z.zoneKey === key)
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setZoneKeys((prev) => prev.filter((k) => k !== key))}
                          className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink ring-1 ring-line"
                        >
                          {zone
                            ? `${plural(zone.reportIds.length, 'reporte')} · ${zone.score}/100`
                            : key}{' '}
                          <span aria-hidden>×</span>
                          <span className="sr-only">Quitar zona</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {scope === 'radio' && (
              <div className="mt-3">
                <p className="text-xs text-muted">
                  Toca el mapa para fijar el centro.{' '}
                  {center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : 'Sin centro aún.'}
                </p>
                <label htmlFor="radio" className="mt-2 block text-xs text-muted">
                  Radio: {radiusMeters} m
                </label>
                <input
                  id="radio"
                  type="range"
                  min={500}
                  max={5000}
                  step={500}
                  value={radiusMeters}
                  onChange={(event) => setRadiusMeters(Number(event.target.value))}
                  className="mt-1 w-full"
                />
              </div>
            )}
          </Card>

          <Card title="Qué avisos" className="order-5 lg:order-none lg:mt-4">
            <ul className="mt-2 space-y-1.5">
              {NOTIFICATION_EVENTS.map((event) => (
                <li key={event}>
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={events.includes(event)}
                      onChange={() => setEvents((prev) => toggleIn(prev, event))}
                      className="mt-1"
                    />
                    {EVENT_LABELS[event]}
                  </label>
                </li>
              ))}
            </ul>
            {events.length === 0 && (
              <p className="mt-2 text-xs font-medium text-gold-700">Elige al menos un aviso.</p>
            )}
          </Card>

          <Card title="Cuánto ruido" className="order-6 lg:order-none lg:mt-4">
            <label htmlFor="nivel" className="mt-1 block text-xs text-muted">
              Nivel mínimo para avisarte. Por debajo de esto no molestamos.
            </label>
            <select
              id="nivel"
              value={minLevel}
              onChange={(event) => setMinLevel(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-line px-3 text-sm"
            >
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {RISK_LEVEL_META[level].label}
                </option>
              ))}
            </select>

            <SegmentedControl
              className="mt-3"
              label="Frecuencia"
              value={digest}
              onChange={setDigest}
              options={DIGESTS.map((value) => ({ value, label: DIGEST_LABELS[value] }))}
            />
            <p className="mt-1.5 text-xs text-muted">
              Un nivel crítico se envía siempre al momento, aunque elijas resumen.
            </p>
          </Card>

          <Card title="Categorías (opcional)" className="order-7 lg:order-none lg:mt-4">
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategories((prev) => toggleIn(prev, category))}
                  aria-pressed={categories.includes(category)}
                  className={`min-h-9 rounded-full border px-3 text-[13px] font-medium leading-none ${
                    categories.includes(category)
                      ? 'border-purple-700 bg-purple-700 text-white'
                      : 'border-line bg-white text-ink hover:border-purple-500'
                  }`}
                >
                  <span aria-hidden className="mr-1">
                    {CATEGORY_META[category].icon}
                  </span>
                  {CATEGORY_SHORT_LABELS[category]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Sin selección, te avisamos de todas.</p>
          </Card>

          <Card title="Consentimiento" className="order-8 lg:order-none lg:mt-4">
            <label className="mt-1 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1"
              />
              Autorizo el uso de mi correo únicamente para enviarme estos avisos. Sé que puedo darme
              de baja en un clic y que mis datos se borran al hacerlo.
            </label>
          </Card>

          <button
            type="button"
            disabled={!puedeEnviar || sending}
            onClick={() => void enviar()}
            className="order-9 mt-4 min-h-11 w-full rounded-[var(--radius-control)] bg-purple-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? 'Enviando…' : 'Recibir avisos'}
          </button>
          <p className="order-9 mt-2 text-center text-xs text-muted">
            Te enviaremos un correo para confirmar. Sin confirmar, no enviamos nada.
          </p>
        </div>

        <div className="contents lg:block lg:space-y-4">
          <div className="order-3 h-[46vh] min-h-[300px] overflow-hidden rounded-[var(--radius-card)] border border-line lg:order-none lg:h-[420px]">
            <MapView
              reports={snapshot?.reports ?? []}
              zones={snapshot?.zones ?? []}
              center={center ?? DEMO_CENTER}
              zoom={center ? 14 : 12}
              pickedPoint={scope === 'radio' ? center : null}
              onPickPoint={scope === 'radio' ? (point) => setCenter(point) : undefined}
              onSelectZone={
                scope === 'zonas'
                  ? (zone) => setZoneKeys((prev) => toggleIn(prev, zone.zoneKey))
                  : undefined
              }
              selectedZoneKey={scope === 'zonas' ? (zoneKeys.at(-1) ?? null) : null}
            />
          </div>

          {snapshot && snapshot.zones.length > 0 && (
            <section className="order-4 rounded-[var(--radius-card)] border border-line bg-white p-4 lg:order-none">
              <h2 className="text-sm font-semibold text-ink">Zonas con mayor riesgo ahora</h2>
              <ul className="mt-2 space-y-1.5">
                {snapshot.zones.slice(0, 4).map((zone) => {
                  const elegida = zoneKeys.includes(zone.zoneKey)
                  return (
                    <li key={zone.zoneKey}>
                      <button
                        type="button"
                        disabled={scope !== 'zonas'}
                        onClick={() => setZoneKeys((prev) => toggleIn(prev, zone.zoneKey))}
                        aria-pressed={elegida}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left disabled:opacity-60 ${
                          elegida ? 'border-purple-700 bg-purple-700/5' : 'border-line'
                        }`}
                      >
                        <span className="text-sm text-ink">
                          {plural(zone.reportIds.length, 'reporte')} en {zone.radiusMeters} m
                        </span>
                        <RiskBadge level={zone.level} score={zone.score} size="sm" />
                      </button>
                    </li>
                  )
                })}
              </ul>
              {scope !== 'zonas' && (
                <p className="mt-2 text-xs text-muted">
                  Cambia el alcance a &quot;Elegir zonas&quot; para seleccionarlas.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SubscriptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[640px] px-4 py-10 text-sm text-muted">Cargando…</div>
      }
    >
      <SubscriptionsContent />
    </Suspense>
  )
}
