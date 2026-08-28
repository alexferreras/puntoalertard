// Persistencia. El MVP usa SQLite en fichero: cero infraestructura para el
// hackathon. La geometría se resuelve con bounding box + haversine (lib/geo.ts)
// porque no hay PostGIS; migrar a Postgres+PostGIS es cambiar esta capa.

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import { env } from './env'
import { boundsAround, haversineMeters, zoneKeyFor, type Bounds, type LatLng } from './geo'
import {
  CATEGORIES,
  STATUSES,
  type Category,
  type ClassificationSignals,
  type Report,
  type ReportStatus,
  type RiskAssessment,
} from './types'

// La ruta se mantiene acotada a `data/` (solo el nombre del fichero es
// configurable) para que el tracing del build no arrastre todo el proyecto.
const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, env.PUNTOALERTA_DB_FILE)

const CATEGORY_LIST = CATEGORIES.map((c) => `'${c}'`).join(', ')
const STATUS_LIST = STATUSES.map((s) => `'${s}'`).join(', ')

/** Definición de `reports`, aislada porque la migración de constraints la reutiliza. */
function reportsTable(name = 'reports'): string {
  return `
CREATE TABLE IF NOT EXISTS ${name} (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  lat               REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng               REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  category          TEXT NOT NULL CHECK (category IN (${CATEGORY_LIST})),
  severity          INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
  status            TEXT NOT NULL CHECK (status IN (${STATUS_LIST})),
  description       TEXT,
  photo_path        TEXT,
  zone_key          TEXT NOT NULL,
  main_road         INTEGER NOT NULL DEFAULT 0,
  photo_sha256      TEXT,
  duplicate_of      TEXT,
  duplicate_score   INTEGER,
  assigned_institution_id TEXT,
  session_hash      TEXT,
  ai_category       TEXT,
  ai_confidence     REAL,
  ai_signals        TEXT,
  ai_rationale      TEXT,
  ai_engine         TEXT,
  confirmed_by_user INTEGER NOT NULL DEFAULT 0,
  resolved_at       TEXT,
  CHECK (status <> 'resuelto' OR resolved_at IS NOT NULL)
)`
}

/**
 * Todos los índices juntos y **siempre después** de `migrateColumns`: un índice
 * sobre una columna añadida más tarde falla en una base ya creada, y ese fallo
 * rompe la primera petición en lugar de la migración.
 */
const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_reports_zone ON reports (zone_key);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_bbox ON reports (lat, lng);
CREATE INDEX IF NOT EXISTS idx_reports_hash ON reports (photo_sha256);
CREATE INDEX IF NOT EXISTS idx_institutions_key ON institutions (api_key_hash);
CREATE INDEX IF NOT EXISTS idx_deliveries_target ON notification_deliveries (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_zone ON notification_deliveries (target_id, zone_key, created_at DESC);
`

/** Solo los de `reports`: la reconstrucción por CHECK los borra con la tabla. */
const REPORT_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_reports_zone ON reports (zone_key);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_bbox ON reports (lat, lng);
CREATE INDEX IF NOT EXISTS idx_reports_hash ON reports (photo_sha256);
`

/**
 * §10 — Risk Snapshot: score, factores y clima usados, inmutable. Sin esto un
 * score del pasado no se puede reproducir ni auditar: los reportes cambian de
 * estado y el pronóstico caduca.
 */
const SNAPSHOTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS risk_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_key        TEXT NOT NULL,
  /** Reporte cuya creación o cambio de estado disparó el cálculo. */
  trigger_report_id TEXT,
  computed_at     TEXT NOT NULL,
  score           INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  level           TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  factors         TEXT NOT NULL,
  reasons         TEXT NOT NULL,
  weather         TEXT NOT NULL,
  report_ids      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_zone ON risk_snapshots (zone_key, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_trigger ON risk_snapshots (trigger_report_id);
`

/** docs/05 §4 — suscripciones, instituciones y registro de envíos. */
const NOTIFICATIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS subscribers (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  created_at             TEXT NOT NULL,
  verified_at            TEXT,
  verification_token     TEXT,
  verification_expires_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  scope         TEXT NOT NULL,
  zone_keys     TEXT NOT NULL DEFAULT '[]',
  center_lat    REAL,
  center_lng    REAL,
  radius_meters INTEGER,
  categories    TEXT NOT NULL DEFAULT '[]',
  min_level     TEXT NOT NULL DEFAULT 'alto',
  events        TEXT NOT NULL,
  digest        TEXT NOT NULL DEFAULT 'diario',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS institutions (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  email        TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'todas',
  zone_keys    TEXT NOT NULL DEFAULT '[]',
  categories   TEXT NOT NULL DEFAULT '[]',
  webhook_url  TEXT,
  webhook_secret TEXT,
  api_key_hash TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);



CREATE TABLE IF NOT EXISTS notification_deliveries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  channel      TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  target_email TEXT NOT NULL,
  report_id    TEXT,
  zone_key     TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  level        TEXT NOT NULL,
  score        INTEGER NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL,
  error        TEXT,
  created_at   TEXT NOT NULL
);

`

const EVENTS_SCHEMA = `
-- RF-18: historial de cambios de estado, auditable.
CREATE TABLE IF NOT EXISTS report_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  from_status TEXT,
  to_status  TEXT NOT NULL,
  note       TEXT,
  actor_type TEXT NOT NULL DEFAULT 'sistema',
  actor_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_report ON report_events (report_id, at);
`

type DatabaseHandle = ReturnType<typeof Database>

// El dev server de Next recarga los módulos en cada cambio; sin este cache se
// abriría una conexión nueva (y se re-ejecutaría el schema) en cada HMR.
const globalForDb = globalThis as unknown as { puntoAlertaDb?: DatabaseHandle }

export function db(): DatabaseHandle {
  if (globalForDb.puntoAlertaDb) return globalForDb.puntoAlertaDb
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const handle = new Database(DB_PATH)
  handle.pragma('journal_mode = WAL')
  handle.pragma('foreign_keys = ON')
  // El orden importa: los índices se crean al final porque pueden referirse a
  // columnas que solo existen después de migrar una base ya creada.
  handle.exec(`${reportsTable()};${EVENTS_SCHEMA}${SNAPSHOTS_SCHEMA}${NOTIFICATIONS_SCHEMA}`)
  migrateColumns(handle)
  migrateEnumConstraints(handle)
  handle.exec(INDEXES)
  globalForDb.puntoAlertaDb = handle
  return handle
}

/** Columnas añadidas después del primer despliegue de la demo. */
const ADDED_COLUMNS: { table: string; name: string; ddl: string }[] = [
  { table: 'reports', name: 'main_road', ddl: 'ALTER TABLE reports ADD COLUMN main_road INTEGER NOT NULL DEFAULT 0' },
  { table: 'reports', name: 'photo_sha256', ddl: 'ALTER TABLE reports ADD COLUMN photo_sha256 TEXT' },
  { table: 'reports', name: 'duplicate_of', ddl: 'ALTER TABLE reports ADD COLUMN duplicate_of TEXT' },
  { table: 'reports', name: 'duplicate_score', ddl: 'ALTER TABLE reports ADD COLUMN duplicate_score INTEGER' },
  // docs/05 §3.3 — el historial deja de decir solo qué pasó: dice quién lo hizo.
  {
    table: 'report_events',
    name: 'actor_type',
    ddl: "ALTER TABLE report_events ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'sistema'",
  },
  { table: 'report_events', name: 'actor_id', ddl: 'ALTER TABLE report_events ADD COLUMN actor_id TEXT' },
  { table: 'reports', name: 'session_hash', ddl: 'ALTER TABLE reports ADD COLUMN session_hash TEXT' },
  {
    table: 'reports',
    name: 'assigned_institution_id',
    ddl: 'ALTER TABLE reports ADD COLUMN assigned_institution_id TEXT',
  },
  { table: 'institutions', name: 'api_key_hash', ddl: 'ALTER TABLE institutions ADD COLUMN api_key_hash TEXT' },
  { table: 'institutions', name: 'webhook_secret', ddl: 'ALTER TABLE institutions ADD COLUMN webhook_secret TEXT' },
]

function migrateColumns(handle: DatabaseHandle): void {
  for (const column of ADDED_COLUMNS) {
    const existing = new Set(
      (handle.prepare(`PRAGMA table_info(${column.table})`).all() as { name: string }[]).map(
        (c) => c.name,
      ),
    )
    if (existing.has(column.name)) continue
    console.info(`[db] añadiendo columna ${column.name} a ${column.table}`)
    handle.exec(column.ddl)
  }
}

/**
 * SQLite no permite alterar un CHECK: cuando el dominio gana una categoría o un
 * estado, la tabla existente sigue rechazando el valor nuevo. Se reconstruye
 * siguiendo el procedimiento recomendado por SQLite (tabla nueva, copiar,
 * borrar, renombrar) para no perder los datos de la demo.
 */
function migrateEnumConstraints(handle: DatabaseHandle): void {
  const row = handle
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reports'")
    .get() as { sql: string } | undefined
  if (!row) return

  const missing = [...CATEGORIES, ...STATUSES].filter((value) => !row.sql.includes(`'${value}'`))
  if (missing.length === 0) return

  console.info(`[db] migrando constraints de reports; valores nuevos: ${missing.join(', ')}`)
  handle.pragma('foreign_keys = OFF')
  handle.transaction(() => {
    handle.exec(reportsTable('reports_new').replace('IF NOT EXISTS ', ''))
    const columns = (handle.prepare('PRAGMA table_info(reports)').all() as { name: string }[])
      .map((c) => c.name)
      .join(', ')
    handle.exec(`INSERT INTO reports_new (${columns}) SELECT ${columns} FROM reports`)
    handle.exec('DROP TABLE reports')
    handle.exec('ALTER TABLE reports_new RENAME TO reports')
    handle.exec(REPORT_INDEXES)
  })()
  handle.pragma('foreign_keys = ON')
}

// ---------------------------------------------------------------------------
// Mapeo fila <-> dominio
// ---------------------------------------------------------------------------

interface ReportRow {
  id: string
  created_at: string
  lat: number
  lng: number
  category: string
  severity: number
  status: string
  description: string | null
  photo_path: string | null
  zone_key: string
  main_road: number
  photo_sha256: string | null
  duplicate_of: string | null
  duplicate_score: number | null
  assigned_institution_id: string | null
  session_hash: string | null
  ai_category: string | null
  ai_confidence: number | null
  ai_signals: string | null
  ai_rationale: string | null
  ai_engine: string | null
  confirmed_by_user: number
  resolved_at: string | null
}

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    createdAt: row.created_at,
    lat: row.lat,
    lng: row.lng,
    category: row.category as Category,
    severity: row.severity,
    status: row.status as ReportStatus,
    description: row.description,
    photoPath: row.photo_path,
    zoneKey: row.zone_key,
    mainRoad: row.main_road === 1,
    photoSha256: row.photo_sha256,
    duplicateOf: row.duplicate_of,
    duplicateScore: row.duplicate_score,
    assignedInstitutionId: row.assigned_institution_id,
    sessionHash: row.session_hash,
    aiCategory: (row.ai_category as Category | null) ?? null,
    aiConfidence: row.ai_confidence,
    aiSignals: row.ai_signals ? (JSON.parse(row.ai_signals) as ClassificationSignals) : null,
    aiRationale: row.ai_rationale,
    aiEngine: row.ai_engine,
    confirmedByUser: row.confirmed_by_user === 1,
    resolvedAt: row.resolved_at,
  }
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type NewReport = Omit<
  Report,
  | 'id'
  | 'createdAt'
  | 'zoneKey'
  | 'status'
  | 'resolvedAt'
  | 'photoSha256'
  | 'duplicateOf'
  | 'duplicateScore'
  | 'assignedInstitutionId'
  | 'sessionHash'
> & {
  id?: string
  createdAt?: string
  status?: ReportStatus
  photoSha256?: string | null
  duplicateOf?: string | null
  duplicateScore?: number | null
  assignedInstitutionId?: string | null
  sessionHash?: string | null
  /** Solo para datos históricos (seed); un reporte nuevo nunca nace resuelto. */
  resolvedAt?: string | null
}

export function insertReport(input: NewReport): Report {
  const id = input.id ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? new Date().toISOString()
  const status = input.status ?? 'reportado'
  const resolvedAt = status === 'resuelto' ? (input.resolvedAt ?? createdAt) : null
  const zoneKey = zoneKeyFor({ lat: input.lat, lng: input.lng })

  const insert = db().prepare(`
    INSERT INTO reports (
      id, created_at, lat, lng, category, severity, status, description, photo_path,
      zone_key, main_road, photo_sha256, duplicate_of, duplicate_score, assigned_institution_id,
      session_hash, ai_category, ai_confidence, ai_signals, ai_rationale, ai_engine,
      confirmed_by_user, resolved_at
    ) VALUES (
      @id, @createdAt, @lat, @lng, @category, @severity, @status, @description, @photoPath,
      @zoneKey, @mainRoad, @photoSha256, @duplicateOf, @duplicateScore, @assignedInstitutionId,
      @sessionHash, @aiCategory, @aiConfidence, @aiSignals, @aiRationale, @aiEngine,
      @confirmedByUser, @resolvedAt
    )
  `)
  const logEvent = db().prepare(`
    INSERT INTO report_events (report_id, at, from_status, to_status, note)
    VALUES (?, ?, NULL, ?, 'Reporte creado por ciudadano')
  `)

  db().transaction(() => {
    insert.run({
      id,
      createdAt,
      lat: input.lat,
      lng: input.lng,
      category: input.category,
      severity: input.severity,
      status,
      description: input.description,
      photoPath: input.photoPath,
      zoneKey,
      mainRoad: input.mainRoad ? 1 : 0,
      photoSha256: input.photoSha256 ?? null,
      duplicateOf: input.duplicateOf ?? null,
      duplicateScore: input.duplicateScore ?? null,
      assignedInstitutionId: input.assignedInstitutionId ?? null,
      sessionHash: input.sessionHash ?? null,
      aiCategory: input.aiCategory,
      aiConfidence: input.aiConfidence,
      aiSignals: input.aiSignals ? JSON.stringify(input.aiSignals) : null,
      aiRationale: input.aiRationale,
      aiEngine: input.aiEngine,
      confirmedByUser: input.confirmedByUser ? 1 : 0,
      resolvedAt,
    })
    logEvent.run(id, createdAt, status)
  })()

  const created = getReport(id)
  if (!created) throw new Error(`No se pudo leer el reporte recién creado (${id})`)
  return created
}

export type ActorType = 'operador' | 'institucion' | 'colaborador' | 'suscriptor' | 'sistema'

export interface Actor {
  type: ActorType
  id?: string | null
}

export function updateStatus(
  id: string,
  status: ReportStatus,
  note?: string,
  actor: Actor = { type: 'operador' },
): Report | null {
  const current = getReport(id)
  if (!current) return null
  const at = new Date().toISOString()
  const resolvedAt = status === 'resuelto' ? (current.resolvedAt ?? at) : null

  db().transaction(() => {
    db()
      .prepare('UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?')
      .run(status, resolvedAt, id)
    db()
      .prepare(
        `INSERT INTO report_events (report_id, at, from_status, to_status, note, actor_type, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, at, current.status, status, note ?? null, actor.type, actor.id ?? null)
  })()

  return getReport(id)
}

/**
 * §16 — el operador corrige la severidad estimada antes de validar. Genera
 * evento para que el cambio quede auditado igual que un cambio de estado.
 */
export function updateSeverity(id: string, severity: number, note?: string): Report | null {
  const current = getReport(id)
  if (!current) return null
  const at = new Date().toISOString()

  db().transaction(() => {
    db().prepare('UPDATE reports SET severity = ? WHERE id = ?').run(severity, id)
    db()
      .prepare(
        'INSERT INTO report_events (report_id, at, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        id,
        at,
        current.status,
        current.status,
        note ?? `Severidad corregida de ${current.severity} a ${severity}`,
      )
  })()

  return getReport(id)
}

export const ATTESTATION_KINDS = ['sigue_igual', 'empeoro', 'ya_no_esta'] as const
export type AttestationKind = (typeof ATTESTATION_KINDS)[number]

const ATTESTATION_LABELS: Record<AttestationKind, string> = {
  sigue_igual: 'Atestación: el problema sigue igual',
  empeoro: 'Atestación: el problema empeoró',
  ya_no_esta: 'Atestación: el problema ya no está',
}

/**
 * docs/05 §3.3 — una atestación es una señal, no una decisión: no cambia el
 * estado, pero queda en el historial atribuida a quien la envió.
 */
export function addAttestation(
  id: string,
  kind: AttestationKind,
  actor: Actor = { type: 'suscriptor' },
): Report | null {
  const current = getReport(id)
  if (!current) return null

  db()
    .prepare(
      `INSERT INTO report_events (report_id, at, from_status, to_status, note, actor_type, actor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      new Date().toISOString(),
      current.status,
      current.status,
      ATTESTATION_LABELS[kind],
      actor.type,
      actor.id ?? null,
    )
  return getReport(id)
}

/** RF-07: el ciudadano corrige la categoría propuesta por la IA. */
export function confirmCategory(id: string, category: Category): Report | null {
  const changed = db()
    .prepare('UPDATE reports SET category = ?, confirmed_by_user = 1 WHERE id = ?')
    .run(category, id)
  return changed.changes > 0 ? getReport(id) : null
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export function getReport(id: string): Report | null {
  const row = db().prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined
  return row ? toReport(row) : null
}

export interface ListFilters {
  bounds?: Bounds | null
  category?: Category | null
  status?: ReportStatus | null
  /** Solo reportes creados en las últimas N horas. */
  sinceHours?: number | null
  limit?: number
}

export function listReports(filters: ListFilters = {}): Report[] {
  const where: string[] = []
  const params: Record<string, unknown> = {}

  if (filters.bounds) {
    where.push('lat BETWEEN @minLat AND @maxLat AND lng BETWEEN @minLng AND @maxLng')
    Object.assign(params, filters.bounds)
  }
  if (filters.category) {
    where.push('category = @category')
    params.category = filters.category
  }
  if (filters.status) {
    where.push('status = @status')
    params.status = filters.status
  }
  if (filters.sinceHours) {
    where.push('created_at >= @since')
    params.since = new Date(Date.now() - filters.sinceHours * 3_600_000).toISOString()
  }

  const sql = `
    SELECT * FROM reports
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT @limit
  `
  params.limit = filters.limit ?? 500
  return (db().prepare(sql).all(params) as ReportRow[]).map(toReport)
}

export function reportsInZone(zoneKey: string): Report[] {
  const rows = db()
    .prepare('SELECT * FROM reports WHERE zone_key = ? ORDER BY created_at DESC')
    .all(zoneKey) as ReportRow[]
  return rows.map(toReport)
}

/** Prefiltro por bounding box; el filtro exacto por radio lo hace quien llama con haversine. */
export function reportsNear(point: LatLng, radiusMeters: number): Report[] {
  return listReports({ bounds: boundsAround(point, radiusMeters), limit: 500 })
}

/** §11 — duplicado exacto de evidencia: la misma foto enviada otra vez. */
export function reportsWithPhotoHash(sha256: string, withinHours = 24): Report[] {
  const since = new Date(Date.now() - withinHours * 3_600_000).toISOString()
  const rows = db()
    .prepare('SELECT * FROM reports WHERE photo_sha256 = ? AND created_at >= ? ORDER BY created_at DESC')
    .all(sha256, since) as ReportRow[]
  return rows.map(toReport)
}

/** Reportes realmente dentro del radio (bbox como prefiltro + haversine exacto). */
export function reportsWithinRadius(point: LatLng, radiusMeters: number): Report[] {
  return reportsNear(point, radiusMeters).filter(
    (r) => haversineMeters(point, { lat: r.lat, lng: r.lng }) <= radiusMeters,
  )
}

export interface ReportEvent {
  at: string
  fromStatus: ReportStatus | null
  toStatus: ReportStatus
  note: string | null
  actorType: ActorType
  actorId: string | null
}

export function reportHistory(id: string): ReportEvent[] {
  const rows = db()
    .prepare(
      `SELECT at, from_status, to_status, note, actor_type, actor_id
       FROM report_events WHERE report_id = ? ORDER BY at`,
    )
    .all(id) as {
    at: string
    from_status: string | null
    to_status: string
    note: string | null
    actor_type: string
    actor_id: string | null
  }[]
  return rows.map((r) => ({
    at: r.at,
    fromStatus: (r.from_status as ReportStatus | null) ?? null,
    toStatus: r.to_status as ReportStatus,
    note: r.note,
    actorType: r.actor_type as ActorType,
    actorId: r.actor_id,
  }))
}

// ---------------------------------------------------------------------------
// Snapshots de riesgo (§10) — solo se insertan y se leen; nunca se actualizan.
// ---------------------------------------------------------------------------

export function insertRiskSnapshot(
  assessment: RiskAssessment,
  weather: unknown,
  triggerReportId: string | null = null,
): void {
  db()
    .prepare(
      `INSERT INTO risk_snapshots (
         zone_key, trigger_report_id, computed_at, score, level, formula_version,
         factors, reasons, weather, report_ids
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      assessment.zoneKey,
      triggerReportId,
      assessment.computedAt,
      assessment.score,
      assessment.level,
      assessment.formulaVersion,
      JSON.stringify(assessment.factors),
      JSON.stringify(assessment.reasons),
      JSON.stringify(weather),
      JSON.stringify(assessment.reportIds),
    )
}

export interface RiskSnapshotRecord {
  computedAt: string
  score: number
  level: string
  formulaVersion: string
  reasons: string[]
  triggerReportId: string | null
}

/** Evolución del riesgo de una zona, del más reciente al más antiguo. */
export function riskHistory(zoneKey: string, limit = 10): RiskSnapshotRecord[] {
  const rows = db()
    .prepare(
      `SELECT computed_at, score, level, formula_version, reasons, trigger_report_id
       FROM risk_snapshots WHERE zone_key = ? ORDER BY computed_at DESC, id DESC LIMIT ?`,
    )
    .all(zoneKey, limit) as {
    computed_at: string
    score: number
    level: string
    formula_version: string
    reasons: string
    trigger_report_id: string | null
  }[]
  return rows.map((row) => ({
    computedAt: row.computed_at,
    score: row.score,
    level: row.level,
    formulaVersion: row.formula_version,
    reasons: JSON.parse(row.reasons) as string[],
    triggerReportId: row.trigger_report_id,
  }))
}

// ---------------------------------------------------------------------------
// Suscripciones e instituciones (docs/05)
// ---------------------------------------------------------------------------

export interface SubscriberRecord {
  id: string
  email: string
  verifiedAt: string | null
}

export function upsertSubscriber(email: string, verificationToken: string, ttlHours = 72): SubscriberRecord {
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + ttlHours * 3_600_000).toISOString()
  const existing = db().prepare('SELECT id, email, verified_at FROM subscribers WHERE email = ?').get(email) as
    | { id: string; email: string; verified_at: string | null }
    | undefined

  if (existing) {
    // Reenviar verificación no debe borrar una suscripción ya confirmada.
    if (!existing.verified_at) {
      db()
        .prepare('UPDATE subscribers SET verification_token = ?, verification_expires_at = ? WHERE id = ?')
        .run(verificationToken, expires, existing.id)
    }
    return { id: existing.id, email: existing.email, verifiedAt: existing.verified_at }
  }

  const id = crypto.randomUUID()
  db()
    .prepare(
      `INSERT INTO subscribers (id, email, created_at, verification_token, verification_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, email, now, verificationToken, expires)
  return { id, email, verifiedAt: null }
}

export function verifySubscriber(token: string): SubscriberRecord | null {
  const row = db()
    .prepare(
      `SELECT id, email, verified_at, verification_expires_at FROM subscribers
       WHERE verification_token = ?`,
    )
    .get(token) as
    | { id: string; email: string; verified_at: string | null; verification_expires_at: string | null }
    | undefined
  if (!row) return null
  if (row.verification_expires_at && new Date(row.verification_expires_at).getTime() < Date.now()) {
    return null
  }

  const now = new Date().toISOString()
  db()
    .prepare('UPDATE subscribers SET verified_at = COALESCE(verified_at, ?), verification_token = NULL WHERE id = ?')
    .run(now, row.id)
  return { id: row.id, email: row.email, verifiedAt: row.verified_at ?? now }
}

export interface SubscriptionRow {
  id: string
  subscriberId: string
  email: string
  scope: string
  zoneKeys: string[]
  centerLat: number | null
  centerLng: number | null
  radiusMeters: number | null
  categories: string[]
  minLevel: string
  events: string[]
  digest: string
  active: boolean
}

export function insertSubscription(
  subscriberId: string,
  input: {
    scope: string
    zoneKeys?: string[]
    centerLat?: number | null
    centerLng?: number | null
    radiusMeters?: number | null
    categories?: string[]
    minLevel: string
    events: string[]
    digest: string
  },
): string {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db()
    .prepare(
      `INSERT INTO subscriptions (
         id, subscriber_id, scope, zone_keys, center_lat, center_lng, radius_meters,
         categories, min_level, events, digest, active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      subscriberId,
      input.scope,
      JSON.stringify(input.zoneKeys ?? []),
      input.centerLat ?? null,
      input.centerLng ?? null,
      input.radiusMeters ?? null,
      JSON.stringify(input.categories ?? []),
      input.minLevel,
      JSON.stringify(input.events),
      input.digest,
      now,
      now,
    )
  return id
}

/** Solo suscripciones activas de correos verificados: sin doble opt-in no se envía nada. */
export function listVerifiedSubscriptions(): SubscriptionRow[] {
  const rows = db()
    .prepare(
      `SELECT s.*, b.email FROM subscriptions s
       JOIN subscribers b ON b.id = s.subscriber_id
       WHERE s.active = 1 AND b.verified_at IS NOT NULL`,
    )
    .all() as Record<string, unknown>[]

  return rows.map((row) => ({
    id: row.id as string,
    subscriberId: row.subscriber_id as string,
    email: row.email as string,
    scope: row.scope as string,
    zoneKeys: JSON.parse(row.zone_keys as string) as string[],
    centerLat: (row.center_lat as number | null) ?? null,
    centerLng: (row.center_lng as number | null) ?? null,
    radiusMeters: (row.radius_meters as number | null) ?? null,
    categories: JSON.parse(row.categories as string) as string[],
    minLevel: row.min_level as string,
    events: JSON.parse(row.events as string) as string[],
    digest: row.digest as string,
    active: row.active === 1,
  }))
}

export function setSubscriptionActive(subscriberId: string, active: boolean): number {
  const result = db()
    .prepare('UPDATE subscriptions SET active = ?, updated_at = ? WHERE subscriber_id = ?')
    .run(active ? 1 : 0, new Date().toISOString(), subscriberId)
  return result.changes
}

export function deleteSubscriber(subscriberId: string): void {
  db().transaction(() => {
    db().prepare('DELETE FROM subscriptions WHERE subscriber_id = ?').run(subscriberId)
    db().prepare('DELETE FROM subscribers WHERE id = ?').run(subscriberId)
  })()
}

export interface InstitutionRow {
  id: string
  name: string
  type: string
  email: string
  jurisdiction: string
  zoneKeys: string[]
  categories: string[]
  webhookUrl: string | null
  webhookSecret: string | null
}

export function insertInstitution(
  input: Omit<InstitutionRow, 'id'> & { id?: string; apiKeyHash?: string | null },
): string {
  const id = input.id ?? crypto.randomUUID()
  db()
    .prepare(
      `INSERT OR REPLACE INTO institutions
       (id, name, type, email, jurisdiction, zone_keys, categories, webhook_url, webhook_secret,
        api_key_hash, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      id,
      input.name,
      input.type,
      input.email,
      input.jurisdiction,
      JSON.stringify(input.zoneKeys),
      JSON.stringify(input.categories),
      input.webhookUrl,
      input.webhookSecret ?? null,
      input.apiKeyHash ?? null,
      new Date().toISOString(),
    )
  return id
}

function toInstitution(row: Record<string, unknown>): InstitutionRow {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    email: row.email as string,
    jurisdiction: row.jurisdiction as string,
    zoneKeys: JSON.parse(row.zone_keys as string) as string[],
    categories: JSON.parse(row.categories as string) as string[],
    webhookUrl: (row.webhook_url as string | null) ?? null,
    webhookSecret: (row.webhook_secret as string | null) ?? null,
  }
}

export function listInstitutions(): InstitutionRow[] {
  const rows = db().prepare('SELECT * FROM institutions WHERE active = 1').all() as Record<string, unknown>[]
  return rows.map(toInstitution)
}

/** Autenticación de servidor a servidor: se busca por hash, nunca por la clave. */
export function findInstitutionByKeyHash(hash: string): InstitutionRow | null {
  const row = db()
    .prepare('SELECT * FROM institutions WHERE api_key_hash = ? AND active = 1')
    .get(hash) as Record<string, unknown> | undefined
  return row ? toInstitution(row) : null
}

// ---------------------------------------------------------------------------
// Registro de envíos — auditoría del "¿avisaron o no?" y base del antirruido
// ---------------------------------------------------------------------------

export interface DeliveryInput {
  channel: 'email' | 'webhook'
  targetType: 'suscriptor' | 'institucion'
  targetId: string
  targetEmail: string
  reportId: string | null
  zoneKey: string
  eventType: string
  level: string
  score: number
  subject: string
  body: string
  status: string
  error?: string | null
}

export function insertDelivery(input: DeliveryInput): void {
  db()
    .prepare(
      `INSERT INTO notification_deliveries (
         channel, target_type, target_id, target_email, report_id, zone_key,
         event_type, level, score, subject, body, status, error, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.channel,
      input.targetType,
      input.targetId,
      input.targetEmail,
      input.reportId,
      input.zoneKey,
      input.eventType,
      input.level,
      input.score,
      input.subject,
      input.body,
      input.status,
      input.error ?? null,
      new Date().toISOString(),
    )
}

/**
 * Estado necesario para aplicar el antirruido de un destinatario.
 *
 * Se filtra por canal a propósito: el antirruido del §2.4 es sobre fatiga de
 * **correo**. Contar los webhooks hacía que el envío al sistema de la institución
 * silenciara su propio correo, algo que se detectó ejecutando la demo completa.
 */
export function throttleStateFor(targetId: string, zoneKey: string, channel = 'email') {
  const zone = db()
    .prepare(
      `SELECT created_at FROM notification_deliveries
       WHERE target_id = ? AND zone_key = ? AND channel = ? AND status = 'enviado'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(targetId, zoneKey, channel) as { created_at: string } | undefined

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const count = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM notification_deliveries
       WHERE target_id = ? AND channel = ? AND status = 'enviado' AND created_at >= ?`,
    )
    .get(targetId, channel, since) as { n: number }

  return { lastZoneDeliveryAt: zone?.created_at ?? null, deliveriesLastDay: count.n }
}

export interface DeliveryRecord extends Omit<DeliveryInput, 'error'> {
  id: number
  createdAt: string
  error: string | null
}

export function listDeliveries(limit = 50): DeliveryRecord[] {
  const rows = db()
    .prepare('SELECT * FROM notification_deliveries ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[]

  return rows.map((row) => ({
    id: row.id as number,
    channel: row.channel as 'email' | 'webhook',
    targetType: row.target_type as 'suscriptor' | 'institucion',
    targetId: row.target_id as string,
    targetEmail: row.target_email as string,
    reportId: (row.report_id as string | null) ?? null,
    zoneKey: row.zone_key as string,
    eventType: row.event_type as string,
    level: row.level as string,
    score: row.score as number,
    subject: row.subject as string,
    body: row.body as string,
    status: row.status as string,
    error: (row.error as string | null) ?? null,
    createdAt: row.created_at as string,
  }))
}

/** Nivel del último snapshot de la zona: base para detectar cruces de nivel. */
export function previousZoneLevel(zoneKey: string): string | null {
  const row = db()
    .prepare('SELECT level FROM risk_snapshots WHERE zone_key = ? ORDER BY computed_at DESC, id DESC LIMIT 1')
    .get(zoneKey) as { level: string } | undefined
  return row?.level ?? null
}

export function countReports(): number {
  const row = db().prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number }
  return row.n
}

/**
 * Solo para recargar la demo. Los snapshots son inmutables en operación, pero un
 * reset de datos de prueba sin limpiarlos dejaría un historial que no corresponde
 * a ningún reporte existente.
 */
export function deleteAllReports(): void {
  db().transaction(() => {
    db().prepare('DELETE FROM report_events').run()
    db().prepare('DELETE FROM risk_snapshots').run()
    db().prepare('DELETE FROM notification_deliveries').run()
    db().prepare('DELETE FROM reports').run()
  })()
}
