'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { MapView } from '@/components/MapView'
import { RiskReasons } from '@/components/RiskReasons'
import { CategoryChip, ConfidenceBadge, StatusBadge } from '@/components/badges'
import { createReport, updateIncident, type CreatedReport } from '@/lib/client'
import { DEMO_CENTER, type LatLng } from '@/lib/geo'
import { ALLOWED_PHOTO_MIME, MAX_DESCRIPTION_CHARS, MAX_PHOTO_BYTES } from '@/lib/limits'
import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/types'

type LocationState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'ready'; point: LatLng; source: 'gps' | 'manual' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }

export default function ReportPage() {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState<LocationState>({ kind: 'idle' })
  /**
   * Encuadre del mapa, separado del punto elegido: el mapa solo se recentra
   * cuando la ubicación llega del GPS. Si se recentrara también al tocar el mapa,
   * cada clic movería el encuadre bajo el dedo de quien está eligiendo el punto.
   */
  const [mapView, setMapView] = useState<{ center: LatLng; zoom: number }>({
    center: DEMO_CENTER,
    zoom: 12,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreatedReport | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const objectUrl = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    [],
  )

  function choosePhoto(file: File | null) {
    setError(null)
    if (!file) {
      setPhoto(null)
      setPreview(null)
      return
    }
    if (!(ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) {
      setError('Formato no admitido. Usa JPG, PNG o WebP.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('La imagen supera 8 MB. Intenta con una foto más liviana.')
      return
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(file)
    setPhoto(file)
    setPreview(objectUrl.current)
  }

  // La ubicación se pide al tocar el botón, no al cargar la página (§9 del doc).
  function requestLocation() {
    if (!navigator.geolocation) {
      setLocation({ kind: 'error', message: 'Este dispositivo no permite obtener la ubicación.' })
      return
    }
    setLocation({ kind: 'requesting' })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude }
        setLocation({ kind: 'ready', point, source: 'gps' })
        setMapView({ center: point, zoom: 16 })
      },
      (err) =>
        setLocation(
          err.code === err.PERMISSION_DENIED
            ? { kind: 'denied' }
            : { kind: 'error', message: 'No pudimos obtener tu ubicación.' },
        ),
      { enableHighAccuracy: true, timeout: 8_000 },
    )
  }

  const point = location.kind === 'ready' ? location.point : null

  async function submit() {
    if (!point) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      if (photo) form.set('photo', photo)
      form.set('lat', String(point.lat))
      form.set('lng', String(point.lng))
      if (description.trim()) form.set('description', description.trim())
      setResult(await createReport(form))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function correctCategory(category: Category) {
    if (!result) return
    setCorrecting(true)
    try {
      const updated = await updateIncident(result.report.id, { category })
      setResult({ ...result, report: updated.report, risk: updated.risk })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCorrecting(false)
    }
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Reporte recibido</h1>
        <p className="mt-1 text-sm text-muted">
          Gracias. Tu reporte ya está en el mapa y alimenta el riesgo de la zona.
        </p>

        <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Lo que detectó la IA</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CategoryChip category={result.classification.category} />
            <ConfidenceBadge
              confidence={result.classification.confidence}
              engine={result.classification.engine}
            />
            <StatusBadge status={result.report.status} />
            <span className="text-xs text-muted">
              Severidad {result.classification.severity}/10
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">{result.classification.rationale}</p>

          <div className="mt-4">
            <p className="text-sm font-semibold text-ink">¿La categoría es correcta?</p>
            <p className="text-xs text-muted">
              Puedes corregirla: tu confirmación manda sobre la propuesta de la IA.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((category) => {
                const active = result.report.category === category
                return (
                  <button
                    key={category}
                    type="button"
                    disabled={correcting}
                    onClick={() => void correctCategory(category)}
                    aria-pressed={active}
                    className={`min-h-11 rounded-[var(--radius-control)] border px-3 text-sm font-medium disabled:opacity-60 ${
                      active
                        ? 'border-purple-700 bg-purple-700 text-white'
                        : 'border-line bg-white text-ink hover:border-purple-500'
                    }`}
                  >
                    <span aria-hidden className="mr-1">
                      {CATEGORY_META[category].icon}
                    </span>
                    {CATEGORY_META[category].label}
                  </button>
                )
              })}
            </div>
            {result.report.confirmedByUser && (
              <p className="mt-2 text-xs font-medium text-risk-bajo">
                Categoría confirmada por ti.
              </p>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Riesgo de la zona ahora mismo</h2>
          <div className="mt-3">
            <RiskReasons risk={result.risk} compact />
          </div>
        </section>

        {result.duplicate.decision !== 'nuevo' && (
          <section className="mt-4 rounded-[var(--radius-card)] border border-gold-500/60 bg-gold-500/10 p-4">
            <h2 className="text-sm font-semibold text-ink">
              {result.duplicate.decision === 'adjuntar'
                ? 'Este punto ya estaba reportado'
                : 'Puede que este punto ya esté reportado'}
            </h2>
            <p className="mt-1 text-sm text-ink">
              {result.duplicate.decision === 'adjuntar'
                ? 'Tu evidencia se sumó al caso existente. No se pierde: cuenta como confirmación de que el problema sigue ahí.'
                : 'Lo dejamos anotado para que el operador decida si es el mismo caso. Tu reporte entra igual.'}
            </p>
            {result.duplicate.reasons.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-muted">
                {result.duplicate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              Coincidencia {result.duplicate.score}/{result.duplicate.threshold} puntos.
            </p>
          </section>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/"
            className="min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ver en el mapa
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null)
              choosePhoto(null)
              setDescription('')
              setLocation({ kind: 'idle' })
            }}
            className="min-h-11 rounded-[var(--radius-control)] border border-line px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Reportar otro punto
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6">
      <div className="flex items-center gap-4">
        <Image
          src="/brand/logo.png"
          alt="PuntoAlerta RD — Reporta. Previene. Protege."
          width={96}
          height={98}
          className="h-auto w-20 shrink-0"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Reportar un punto</h1>
          <p className="mt-1 text-sm text-muted">
            No pedimos tu nombre ni tu teléfono. Solo la evidencia, el lugar y la hora.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-risk-critico/10 px-3 py-2 text-sm font-medium text-risk-critico">
          {error}
        </p>
      )}

      <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">1 de 3 · Evidencia</h2>
        <p className="mt-1 text-xs text-muted">Foto en JPG, PNG o WebP, hasta 8 MB. Opcional.</p>
        <input
          type="file"
          accept={ALLOWED_PHOTO_MIME.join(',')}
          capture="environment"
          onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
          className="mt-2 block w-full rounded-[var(--radius-control)] border border-line px-3 py-2.5 text-sm"
        />
        {preview && (
          // Preview local del archivo elegido: no pasa por el optimizador de imágenes.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Vista previa de la evidencia"
            className="mt-3 max-h-64 w-full rounded-[var(--radius-control)] object-cover"
          />
        )}
      </section>

      <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">2 de 3 · Ubicación</h2>
        <p className="mt-1 text-xs text-muted">
          Necesitamos las coordenadas para ubicar el punto. Puedes usar el GPS o tocar el mapa.
        </p>
        <button
          type="button"
          onClick={requestLocation}
          className="mt-2 min-h-11 rounded-[var(--radius-control)] bg-purple-700 px-4 text-sm font-semibold text-white"
        >
          {location.kind === 'requesting' ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
        </button>

        {location.kind === 'denied' && (
          <p className="mt-2 text-sm text-gold-700">
            No autorizaste el acceso a la ubicación. Toca el mapa para colocar el punto manualmente.
          </p>
        )}
        {location.kind === 'error' && (
          <p className="mt-2 text-sm text-gold-700">{location.message} Toca el mapa o intenta otra vez.</p>
        )}
        {point && (
          <p className="mt-2 text-sm text-ink">
            Punto seleccionado: <span className="tabular-nums">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>{' '}
            <span className="text-muted">({location.kind === 'ready' && location.source === 'gps' ? 'GPS' : 'manual'})</span>
          </p>
        )}

        <div className="mt-3 h-64 overflow-hidden rounded-[var(--radius-control)] border border-line">
          <MapView
            reports={[]}
            zones={[]}
            center={mapView.center}
            zoom={mapView.zoom}
            pickedPoint={point}
            onPickPoint={(picked) => setLocation({ kind: 'ready', point: picked, source: 'manual' })}
          />
        </div>
      </section>

      <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">3 de 3 · Nota</h2>
        <label htmlFor="description" className="mt-1 block text-xs text-muted">
          Opcional, hasta {MAX_DESCRIPTION_CHARS} caracteres. No incluyas datos personales.
        </label>
        <textarea
          id="description"
          value={description}
          maxLength={MAX_DESCRIPTION_CHARS}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm"
          placeholder="Ej.: imbornal tapado con basura frente a la parada."
        />
        <p className="mt-1 text-right text-xs text-muted tabular-nums">
          {description.length}/{MAX_DESCRIPTION_CHARS}
        </p>
      </section>

      <button
        type="button"
        disabled={!point || submitting}
        onClick={() => void submit()}
        className="mt-5 min-h-11 w-full rounded-[var(--radius-control)] bg-purple-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Analizando evidencia…' : 'Enviar reporte'}
      </button>
      {!point && (
        <p className="mt-2 text-center text-xs text-muted">
          Falta la ubicación para poder enviar.
        </p>
      )}
    </div>
  )
}
