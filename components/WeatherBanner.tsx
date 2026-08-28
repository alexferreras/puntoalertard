'use client'

import { ALERT_META, type WeatherScenario, type WeatherSnapshot } from '@/lib/weather-shared'

const SCENARIOS: { value: WeatherScenario; label: string; hint: string }[] = [
  { value: 'real', label: 'Clima real', hint: 'Pronóstico en vivo de Open-Meteo' },
  { value: 'seco', label: 'Sin lluvia', hint: 'Escenario simulado: 0 mm' },
  { value: 'lluvia', label: 'Lluvia intensa', hint: 'Escenario simulado: 38 mm en 6 h' },
]

export function WeatherBanner({
  weather,
  scenario,
  onScenarioChange,
}: {
  weather: WeatherSnapshot | null
  scenario: WeatherScenario
  onScenarioChange: (next: WeatherScenario) => void
}) {
  const isSimulated = weather?.source === 'demo'
  const isStale = weather?.isStale === true
  const isUnavailable = weather?.source === 'unavailable'

  return (
    <section
      aria-label="Contexto meteorológico"
      className="rounded-[var(--radius-card)] border border-line bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl">
          {weather ? ALERT_META[weather.alert].icon : '⏳'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">
            {weather ? ALERT_META[weather.alert].label : 'Consultando pronóstico…'}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {weather?.summary ?? 'El riesgo se muestra con el último dato conocido.'}
          </p>
          {isStale && (
            <p className="mt-1 text-xs font-medium text-gold-700">
              Dato no vigente: se muestra el último pronóstico conocido y los reportes siguen
              disponibles.
            </p>
          )}
          {isUnavailable && (
            <p className="mt-1 text-xs font-medium text-gold-700">
              Clima no disponible: el riesgo se calcula sin el factor meteorológico, no se inventa un
              pronóstico.
            </p>
          )}
          {isSimulated && (
            <p className="mt-1 text-xs font-medium text-gold-700">
              Modo simulación: el pronóstico es forzado para demostrar el recálculo de riesgo.
            </p>
          )}
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
          Escenario meteorológico
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCENARIOS.map((option) => {
            const active = option.value === scenario
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onScenarioChange(option.value)}
                aria-pressed={active}
                title={option.hint}
                className={`min-h-11 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition ${
                  active
                    ? 'border-purple-700 bg-purple-700 text-white'
                    : 'border-line bg-white text-ink hover:border-purple-500'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}
