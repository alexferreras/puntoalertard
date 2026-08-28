// Motor de notificaciones (cambio para forzar reconstrucción) (docs/05). Decide **a quién** hay que avisar y **si
// toca avisar ahora**; el envío lo hace un `EmailProvider` sustituible.
//
// Las funciones de decisión son puras para poder fijar en tests las reglas que
// evitan la fatiga de notificaciones: solo cruces hacia arriba, antirruido por
// zona y tope diario.

import type { LatLng } from './geo'
import { haversineMeters } from './geo'
import { RISK_LEVELS, type Category, type RiskLevel } from './types'

/** docs/05 §2.4 — un correo inmediato por zona cada 6 h como máximo. */
export const NOTIFY_ZONE_COOLDOWN_HOURS = 6
/** docs/05 §2.4 — tope diario por suscriptor. */
export const NOTIFY_MAX_PER_DAY = 10

export const NOTIFICATION_EVENTS = [
  'nuevo_reporte',
  'cambio_nivel',
  'preventivo',
  'cambio_estado',
  'resuelto',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export const DIGESTS = ['inmediato', 'diario', 'semanal'] as const
export type Digest = (typeof DIGESTS)[number]

export const SCOPES = ['todas', 'zonas', 'radio'] as const
export type Scope = (typeof SCOPES)[number]

export interface SubscriptionFilters {
  scope: Scope
  zoneKeys: string[]
  center: LatLng | null
  radiusMeters: number | null
  /** Vacío significa todas las categorías. */
  categories: Category[]
  minLevel: RiskLevel
  events: NotificationEvent[]
  digest: Digest
}

/** Contexto del incidente que dispara la evaluación. */
export interface NotificationContext {
  zoneKey: string
  point: LatLng
  category: Category
  level: RiskLevel
  score: number
  event: NotificationEvent
}

const levelIndex = (level: RiskLevel) => RISK_LEVELS.indexOf(level)

/**
 * docs/05 §2.4 — solo se avisa de cruces hacia arriba. Que una zona baje de
 * crítico a alto es una buena noticia, no una urgencia.
 */
export function crossedUpward(previous: RiskLevel | null, current: RiskLevel): boolean {
  if (previous === null) return false
  return levelIndex(current) > levelIndex(previous)
}

export function meetsMinLevel(level: RiskLevel, minLevel: RiskLevel): boolean {
  return levelIndex(level) >= levelIndex(minLevel)
}

/** ¿El incidente cae dentro del alcance geográfico y de categoría de la suscripción? */
export function matchesFilters(filters: SubscriptionFilters, context: NotificationContext): boolean {
  if (!filters.events.includes(context.event)) return false
  if (!meetsMinLevel(context.level, filters.minLevel)) return false
  if (filters.categories.length > 0 && !filters.categories.includes(context.category)) return false

  switch (filters.scope) {
    case 'todas':
      return true
    case 'zonas':
      return filters.zoneKeys.includes(context.zoneKey)
    case 'radio': {
      if (!filters.center || !filters.radiusMeters) return false
      return haversineMeters(filters.center, context.point) <= filters.radiusMeters
    }
  }
}

/**
 * docs/05 §2.2 — un nivel crítico se envía siempre al momento, aunque la
 * suscripción sea de resumen: retenerlo hasta el lunes vacía su utilidad.
 */
export function isImmediate(filters: SubscriptionFilters, level: RiskLevel): boolean {
  return filters.digest === 'inmediato' || level === 'critico'
}

export interface ThrottleState {
  /** Fecha ISO del último envío inmediato a este destinatario para esta zona. */
  lastZoneDeliveryAt: string | null
  /** Envíos al destinatario en las últimas 24 h. */
  deliveriesLastDay: number
}

export type ThrottleDecision = 'enviar' | 'descartado_antirruido' | 'descartado_tope_diario'

/** docs/05 §2.4 — antirruido por zona y tope diario. */
export function throttle(state: ThrottleState, now = Date.now()): ThrottleDecision {
  if (state.deliveriesLastDay >= NOTIFY_MAX_PER_DAY) return 'descartado_tope_diario'
  if (state.lastZoneDeliveryAt) {
    const elapsedHours = (now - new Date(state.lastZoneDeliveryAt).getTime()) / 3_600_000
    if (elapsedHours < NOTIFY_ZONE_COOLDOWN_HOURS) return 'descartado_antirruido'
  }
  return 'enviar'
}

// ---------------------------------------------------------------------------
// Redacción del aviso
// ---------------------------------------------------------------------------

const EVENT_SUBJECTS: Record<NotificationEvent, (c: NotificationContext) => string> = {
  nuevo_reporte: (c) => `Nuevo reporte en tu zona (riesgo ${c.score}/100)`,
  cambio_nivel: (c) => `Tu zona pasó a riesgo ${c.level.toUpperCase()} (${c.score}/100)`,
  preventivo: (c) => `Lluvia prevista sobre un punto en riesgo ${c.level} (${c.score}/100)`,
  cambio_estado: (c) => `Actualización de un incidente en tu zona (riesgo ${c.score}/100)`,
  resuelto: () => 'Un incidente de tu zona fue resuelto',
}

export interface NotificationMessage {
  subject: string
  body: string
}

/**
 * El cuerpo no lleva evidencia ni coordenada exacta (docs/05 §2.5): la zona va
 * redondeada como en el mapa público.
 */
export function composeMessage(
  context: NotificationContext,
  reasons: string[],
  /**
   * Enlace de gestión para suscriptores. Una institución no se "da de baja":
   * su canal es administrativo, así que recibe una nota en lugar de un enlace.
   */
  footer: { kind: 'suscriptor'; manageUrl: string } | { kind: 'institucion'; name: string },
): NotificationMessage {
  const zona = `${context.point.lat.toFixed(4)}, ${context.point.lng.toFixed(4)}`
  const motivos = reasons.length > 0 ? reasons.map((r) => `  - ${r}`).join('\n') : '  - Sin factores destacados'

  return {
    subject: EVENT_SUBJECTS[context.event](context),
    body: [
      `Nivel de riesgo/prioridad: ${context.level} (${context.score}/100)`,
      `Zona aproximada: ${zona}`,
      '',
      'Por qué:',
      motivos,
      '',
      'Información complementaria de PuntoAlerta RD. No sustituye alertas oficiales del COE ni del 9-1-1.',
      footer.kind === 'suscriptor'
        ? `Gestionar o cancelar estos avisos: ${footer.manageUrl}`
        : `Este aviso llega por el registro institucional de ${footer.name}. Para cambiar jurisdicción o canales, contacta a la administración de la plataforma.`,
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Proveedor de correo
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

export interface EmailResult {
  status: 'enviado' | 'fallido'
  error?: string
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<EmailResult>
}

/**
 * Proveedor de demostración: no envía nada. La fila en `notification_deliveries`
 * **es** el registro del envío, y la bandeja del dashboard la renderiza. La misma
 * interfaz acepta Resend o SES después sin tocar el motor.
 */
export const mockEmailProvider: EmailProvider = {
  name: 'mock',
  async send() {
    return { status: 'enviado' }
  },
}
