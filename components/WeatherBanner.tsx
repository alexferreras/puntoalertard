'use client'

import type { ReactNode } from 'react'

import { IconBubble, SegmentedControl } from '@/components/ui'
import { ALERT_META, type WeatherScenario, type WeatherSnapshot } from '@/lib/weather-shared'

const SCENARIOS: { value: WeatherScenario; label: string; hint: string }[] = [
  { value: 'real', label: 'Real', hint: 'Pronóstico en vivo de Open-Meteo' },
  { value: 'seco', label: 'Sin lluvia', hint: 'Escenario simulado: 0 mm' },
  { value: 'lluvia', label: 'Lluvia', hint: 'Escenario simulado: 38 mm en 6 h' },
]

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 rounded-[8px] bg-gold-500/12 px-2.5 py-1.5 text-xs font-medium text-gold-700">
      {children}
    </p>
  )
}

/** Procedencia del dato, en el orden en que importa saberla. */
function ProvenanceNotice({ weather }: { weather: WeatherSnapshot }) {
  if (weather.source === 'unavailable') {
    return (
      <Notice>
        Clima no disponible: el riesgo se calcula sin el factor meteorológico, no se inventa un
        pronóstico.
      </Notice>
    )
  }
  if (weather.isStale) {
    return <Notice>Dato no vigente: se muestra el último pronóstico conocido.</Notice>
  }
  if (weather.source === 'demo') {
    return <Notice>Simulación: el pronóstico es forzado para demostrar el recálculo.</Notice>
  }
  return null
}

export function WeatherBanner({
  weather,
  scenario,
  onScenarioChange,
}: {
  weather: WeatherSnapshot | null
  scenario: WeatherScenario
  onScenarioChange: (next: WeatherScenario) => void
}) {
  return (
    <section
      aria-label="Contexto meteorológico"
      className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(36,23,45,0.04)]"
    >
      <div className="flex items-center gap-3">
        <IconBubble tone={weather && weather.alert !== 'ninguna' ? 'gold' : 'neutral'}>
          {weather ? ALERT_META[weather.alert].icon : '⏳'}
        </IconBubble>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-ink">
            {weather ? ALERT_META[weather.alert].label : 'Consultando pronóstico…'}
          </h2>
          {weather && weather.source !== 'unavailable' && (
            <p className="mt-0.5 text-xs tabular-nums text-muted">
              {weather.precipitation6hMm.toFixed(1)} mm en 6 h ·{' '}
              {Math.round(weather.rainProbability * 100)}% de probabilidad
            </p>
          )}
        </div>
      </div>

      {/* `text-pretty` evita que la última palabra quede sola en su propia línea. */}
      {weather?.source === 'unavailable' ? null : (
        <p className="mt-2 text-pretty text-sm leading-snug text-muted">
          {weather?.summary ?? 'El riesgo se muestra con el último dato conocido.'}
        </p>
      )}

      {weather && <ProvenanceNotice weather={weather} />}

      <SegmentedControl
        className="mt-3"
        label="Escenario meteorológico"
        options={SCENARIOS}
        value={scenario}
        onChange={onScenarioChange}
      />
    </section>
  )
}
