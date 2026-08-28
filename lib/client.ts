// Cliente HTTP tipado para los componentes de UI. Nada de lógica de negocio:
// solo llamar a la API y devolver tipos del dominio.

import type { PublicIncident } from './public'
import type { Category, Report, ReportStatus, RiskAssessment } from './types'
import type { LatLng } from './geo'
import type { RouteComparison } from './routes'
import type { WeatherScenario, WeatherSnapshot } from './weather-shared'

interface ApiErrorBody {
  error?: { code: string; message: string; fieldErrors: Record<string, string[]> | null }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null
  if (!res.ok) {
    throw new Error(body?.error?.message ?? 'No pudimos completar la operación. Intenta de nuevo.')
  }
  if (!body) throw new Error('Respuesta vacía del servidor.')
  return body
}

export interface IncidentsSnapshot {
  /** Proyección pública: nunca trae la ruta de la evidencia. */
  reports: PublicIncident[]
  zones: RiskAssessment[]
  recurrent: RiskAssessment[]
  weather: WeatherSnapshot
  updatedAt: string
}

export function fetchIncidents(
  { scenario, category }: { scenario: WeatherScenario; category?: Category | null },
  signal?: AbortSignal,
): Promise<IncidentsSnapshot> {
  const params = new URLSearchParams({ scenario })
  if (category) params.set('category', category)
  return request<IncidentsSnapshot>(`/api/incidents?${params}`, { signal, cache: 'no-store' })
}

export interface CreatedReport {
  report: Report
  classification: {
    category: Category
    severity: number
    confidence: number
    rationale: string
    engine: string
  }
  risk: RiskAssessment
  weather: WeatherSnapshot
  /** Resultado de la detección de duplicados (§11). */
  duplicate: {
    decision: 'adjuntar' | 'posible_duplicado' | 'nuevo'
    threshold: number
    canonicalId: string | null
    score: number
    reasons: string[]
    candidates: number
  }
}

export function createReport(form: FormData): Promise<CreatedReport> {
  return request<CreatedReport>('/api/reports', { method: 'POST', body: form })
}

export interface RiskSnapshot {
  computedAt: string
  score: number
  level: string
  formulaVersion: string
  reasons: string[]
  triggerReportId: string | null
}

export interface IncidentDetail {
  report: Report
  history: { at: string; fromStatus: ReportStatus | null; toStatus: ReportStatus; note: string | null }[]
  risk: RiskAssessment
  /** Evolución del riesgo de la zona, del snapshot más reciente al más antiguo. */
  riskHistory: RiskSnapshot[]
  weather: WeatherSnapshot
}

export function updateIncident(
  id: string,
  body: {
    status?: ReportStatus
    category?: Category
    severity?: number
    note?: string
    scenario?: WeatherScenario
  },
): Promise<IncidentDetail> {
  return request<IncidentDetail>(`/api/incidents/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface DeliveryRecord {
  id: number
  channel: 'email' | 'webhook'
  targetType: 'suscriptor' | 'institucion'
  targetEmail: string
  zoneKey: string
  eventType: string
  level: string
  score: number
  subject: string
  body: string
  status: string
  createdAt: string
}

export function fetchDeliveries(signal?: AbortSignal): Promise<{ deliveries: DeliveryRecord[] }> {
  return request<{ deliveries: DeliveryRecord[] }>('/api/notifications', {
    signal,
    cache: 'no-store',
  })
}

export interface SubscriptionInput {
  email: string
  scope: 'todas' | 'zonas' | 'radio'
  zoneKeys?: string[]
  center?: { lat: number; lng: number } | null
  radiusMeters?: number | null
  categories?: Category[]
  minLevel: string
  events: string[]
  digest: 'inmediato' | 'diario' | 'semanal'
  consent: true
}

export function subscribe(input: SubscriptionInput): Promise<{ accepted: boolean; message: string }> {
  return request<{ accepted: boolean; message: string }>('/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function verifySubscription(token: string): Promise<{ verified: boolean; message: string }> {
  return request<{ verified: boolean; message: string }>(
    `/api/subscriptions/verify?token=${encodeURIComponent(token)}`,
  )
}

export interface ManagedSubscription {
  id: string
  scope: string
  zoneKeys: string[]
  radiusMeters: number | null
  categories: string[]
  minLevel: string
  events: string[]
  digest: string
  active: boolean
}

export function fetchSubscriptions(
  token: string,
  signal?: AbortSignal,
): Promise<{ subscriberId: string; subscriptions: ManagedSubscription[] }> {
  return request(`/api/subscriptions/manage?token=${encodeURIComponent(token)}`, {
    signal,
    cache: 'no-store',
  })
}

export function setSubscriptionsActive(token: string, active: boolean): Promise<{ updated: number }> {
  return request(`/api/subscriptions/manage?token=${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ active }),
  })
}

export function unsubscribe(token: string): Promise<{ deleted: boolean }> {
  return request(`/api/subscriptions/manage?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
}

export type Role = 'operador' | null

export function fetchRole(signal?: AbortSignal): Promise<{ role: Role }> {
  return request<{ role: Role }>('/api/auth/operador', { signal, cache: 'no-store' })
}

export function loginOperator(code: string): Promise<{ role: Role }> {
  return request<{ role: Role }>('/api/auth/operador', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
}

export function logoutOperator(): Promise<{ role: Role }> {
  return request<{ role: Role }>('/api/auth/operador', { method: 'DELETE' })
}

export function compareRoutes(body: {
  origin: LatLng
  destination: LatLng
  via?: LatLng[]
  scenario: WeatherScenario
}): Promise<RouteComparison & { weather: WeatherSnapshot }> {
  return request<RouteComparison & { weather: WeatherSnapshot }>('/api/routes/compare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
