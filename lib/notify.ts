// Despachador de avisos: une el motor de decisión (`lib/notifications.ts`) con
// los datos y el proveedor de correo. Es la única pieza que escribe en
// `notification_deliveries`.
//
// Nunca lanza hacia el flujo del ciudadano: si el aviso falla, el reporte ya
// está guardado y lo que se pierde es la notificación, no la evidencia.

import {
  insertDelivery,
  listInstitutions,
  listVerifiedSubscriptions,
  throttleStateFor,
  type InstitutionRow,
  type SubscriptionRow,
} from './db'
import {
  composeMessage,
  isImmediate,
  matchesFilters,
  mockEmailProvider,
  throttle,
  type NotificationContext,
  type NotificationEvent,
  type SubscriptionFilters,
} from './notifications'
import type { Category, Report, RiskAssessment, RiskLevel } from './types'
import { sendWebhook } from './webhooks'

const provider = mockEmailProvider

function filtersOf(row: SubscriptionRow): SubscriptionFilters {
  return {
    scope: row.scope as SubscriptionFilters['scope'],
    zoneKeys: row.zoneKeys,
    center: row.centerLat !== null && row.centerLng !== null ? { lat: row.centerLat, lng: row.centerLng } : null,
    radiusMeters: row.radiusMeters,
    categories: row.categories as Category[],
    minLevel: row.minLevel as RiskLevel,
    events: row.events as NotificationEvent[],
    digest: row.digest as SubscriptionFilters['digest'],
  }
}

/** Una institución cubre el incidente si su jurisdicción y categorías lo incluyen. */
export function institutionCovers(institution: InstitutionRow, context: NotificationContext): boolean {
  const enJurisdiccion =
    institution.jurisdiction === 'todas' || institution.zoneKeys.includes(context.zoneKey)
  const enCategorias =
    institution.categories.length === 0 || institution.categories.includes(context.category)
  return enJurisdiccion && enCategorias
}

export interface NotifyResult {
  evaluated: number
  sent: number
  throttled: number
}

/**
 * Evalúa suscriptores e instituciones para un incidente y registra los envíos.
 * `manageUrlFor` construye el enlace de gestión de cada suscriptor.
 */
export async function dispatchNotifications(
  context: NotificationContext,
  risk: RiskAssessment,
  reportId: string | null,
  manageUrlFor: (subscriberId: string) => string,
): Promise<NotifyResult> {
  const result: NotifyResult = { evaluated: 0, sent: 0, throttled: 0 }

  const destinatarios: {
    targetType: 'suscriptor' | 'institucion'
    targetId: string
    email: string
    immediate: boolean
    footer: Parameters<typeof composeMessage>[2]
  }[] = []

  for (const row of listVerifiedSubscriptions()) {
    const filters = filtersOf(row)
    if (!matchesFilters(filters, context)) continue
    destinatarios.push({
      targetType: 'suscriptor',
      targetId: row.subscriberId,
      email: row.email,
      immediate: isImmediate(filters, context.level),
      footer: { kind: 'suscriptor', manageUrl: manageUrlFor(row.subscriberId) },
    })
  }

  const instituciones = listInstitutions().filter((i) => institutionCovers(i, context))

  // Canal webhook: se envía firmado y en paralelo al correo (docs/05 §3.2).
  await Promise.all(
    instituciones
      .filter((i) => i.webhookUrl && i.webhookSecret)
      .map(async (institution) => {
        const outcome = await sendWebhook(institution.webhookUrl!, institution.webhookSecret!, {
          event: context.event,
          incident: {
            reportId,
            zoneKey: context.zoneKey,
            category: context.category,
            level: context.level,
            score: context.score,
            reasons: risk.reasons,
            // Zona aproximada, igual que en el mapa público.
            lat: Number(context.point.lat.toFixed(4)),
            lng: Number(context.point.lng.toFixed(4)),
          },
        })
        insertDelivery({
          channel: 'webhook',
          targetType: 'institucion',
          targetId: institution.id,
          targetEmail: institution.webhookUrl!,
          reportId,
          zoneKey: context.zoneKey,
          eventType: context.event,
          level: context.level,
          score: context.score,
          subject: `Webhook ${context.event} (${outcome.deliveryId})`,
          body: outcome.error ?? `Entregado con firma HMAC. HTTP ${outcome.httpStatus ?? '-'}`,
          status: outcome.status,
          error: outcome.error ?? null,
        })
      }),
  )

  for (const institution of instituciones) {
    destinatarios.push({
      targetType: 'institucion',
      targetId: institution.id,
      email: institution.email,
      // Una institución con jurisdicción no espera al resumen.
      immediate: true,
      footer: { kind: 'institucion', name: institution.name },
    })
  }

  for (const destinatario of destinatarios) {
    result.evaluated += 1
    const message = composeMessage(context, risk.reasons, destinatario.footer)

    if (!destinatario.immediate) {
      insertDelivery({
        channel: 'email',
        targetType: destinatario.targetType,
        targetId: destinatario.targetId,
        targetEmail: destinatario.email,
        reportId,
        zoneKey: context.zoneKey,
        eventType: context.event,
        level: context.level,
        score: context.score,
        subject: message.subject,
        body: message.body,
        status: 'pendiente_resumen',
      })
      continue
    }

    const decision = throttle(throttleStateFor(destinatario.targetId, context.zoneKey))
    if (decision !== 'enviar') {
      result.throttled += 1
      insertDelivery({
        channel: 'email',
        targetType: destinatario.targetType,
        targetId: destinatario.targetId,
        targetEmail: destinatario.email,
        reportId,
        zoneKey: context.zoneKey,
        eventType: context.event,
        level: context.level,
        score: context.score,
        subject: message.subject,
        body: message.body,
        status: decision,
      })
      continue
    }

    const sendResult = await provider
      .send({ to: destinatario.email, subject: message.subject, body: message.body })
      .catch((err: Error) => ({ status: 'fallido' as const, error: err.message }))

    if (sendResult.status === 'enviado') result.sent += 1
    insertDelivery({
      channel: 'email',
      targetType: destinatario.targetType,
      targetId: destinatario.targetId,
      targetEmail: destinatario.email,
      reportId,
      zoneKey: context.zoneKey,
      eventType: context.event,
      level: context.level,
      score: context.score,
      subject: message.subject,
      body: message.body,
      status: sendResult.status,
      error: sendResult.error ?? null,
    })
  }

  return result
}

/** Qué evento corresponde a un reporte recién creado, según si la zona subió de nivel. */
export function eventForNewReport(crossedUp: boolean): NotificationEvent {
  return crossedUp ? 'cambio_nivel' : 'nuevo_reporte'
}

export function contextFor(
  report: Pick<Report, 'category'>,
  risk: RiskAssessment,
  event: NotificationEvent,
): NotificationContext {
  return {
    zoneKey: risk.zoneKey,
    point: { lat: risk.lat, lng: risk.lng },
    category: report.category,
    level: risk.level,
    score: risk.score,
    event,
  }
}
