'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { fetchDeliveries, type DeliveryRecord } from '@/lib/client'
import { relativeTime } from '@/lib/format'

/** Cada estado de envío se explica: la bandeja también documenta el antirruido. */
const STATUS_META: Record<string, { label: string; hint: string; className: string }> = {
  enviado: {
    label: 'Enviado',
    hint: 'Salió al destinatario.',
    className: 'bg-risk-bajo/15 text-risk-bajo',
  },
  pendiente_verificacion: {
    label: 'Pendiente de confirmar',
    hint: 'Sin doble opt-in no se envía ningún aviso.',
    className: 'bg-gold-500/25 text-gold-700',
  },
  pendiente_resumen: {
    label: 'En resumen',
    hint: 'La suscripción es de resumen: se agrupa en el envío diario o semanal.',
    className: 'bg-purple-500/15 text-purple-700',
  },
  descartado_antirruido: {
    label: 'Descartado por antirruido',
    hint: 'Ya se avisó de esta zona en las últimas 6 h.',
    className: 'bg-line text-muted',
  },
  descartado_tope_diario: {
    label: 'Descartado por tope diario',
    hint: 'El destinatario ya recibió 10 avisos hoy.',
    className: 'bg-line text-muted',
  },
  fallido: {
    label: 'Fallido',
    hint: 'El proveedor rechazó el envío.',
    className: 'bg-risk-critico/15 text-risk-critico',
  },
}

export default function NotificacionesPage() {
  const [deliveries, setDeliveries] = useState<DeliveryRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchDeliveries(controller.signal)
      .then(({ deliveries: rows }) => setDeliveries(rows))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [attempt])

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Bandeja de avisos</h1>
          <p className="mt-1 text-sm text-muted">
            Proveedor de correo en modo <strong>mock</strong>: no se envía nada al exterior. Cada fila
            es el registro real del envío que se habría hecho, con el motivo cuando se descarta.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="min-h-11 rounded-[var(--radius-control)] border border-line px-4 text-sm font-medium text-ink"
          >
            Actualizar
          </button>
          <Link
            href="/dashboard"
            className="min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Volver a la cola
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-card)] border border-risk-critico/30 bg-risk-critico/10 p-4"
        >
          <p className="text-sm font-medium text-ink">{error}</p>
          <p className="mt-1 text-xs text-muted">
            La bandeja requiere sesión de operador. Inicia sesión en el dashboard y vuelve.
          </p>
        </div>
      )}

      {!deliveries && !error && <p className="mt-4 text-sm text-muted">Cargando envíos…</p>}

      {deliveries?.length === 0 && (
        <p className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm text-muted">
          Todavía no hay avisos. Crea un reporte o cambia el escenario meteorológico para que una zona
          suba de nivel.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {deliveries?.map((delivery) => {
          const meta = STATUS_META[delivery.status] ?? {
            label: delivery.status,
            hint: '',
            className: 'bg-line text-ink',
          }
          const open = expanded === delivery.id
          return (
            <li key={delivery.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{delivery.subject}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {delivery.targetType === 'institucion' ? 'Institución' : 'Suscriptor'} ·{' '}
                    {delivery.targetEmail} · {relativeTime(delivery.createdAt)}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}>
                  {meta.label}
                </span>
              </div>

              {meta.hint && <p className="mt-1.5 text-xs text-muted">{meta.hint}</p>}

              <button
                type="button"
                onClick={() => setExpanded(open ? null : delivery.id)}
                aria-expanded={open}
                className="mt-2 text-xs font-medium text-purple-700 underline-offset-2 hover:underline"
              >
                {open ? 'Ocultar contenido' : 'Ver contenido del aviso'}
              </button>

              {open && (
                <pre className="mt-2 overflow-x-auto rounded-[var(--radius-control)] bg-canvas p-3 text-xs text-ink">
                  {delivery.body}
                </pre>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
