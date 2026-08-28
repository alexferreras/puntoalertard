// Paso de migración explícito, equivalente a `alembic upgrade head`.
//
// Las migraciones ya son idempotentes y corren al abrir la base, pero un
// despliegue necesita dos cosas más que un `CREATE TABLE IF NOT EXISTS` no da:
//
//   1. **Un respaldo antes de tocar el esquema.** La reconstrucción de una tabla
//      por cambio de CHECK copia filas entre tablas; si eso falla a mitad, sin
//      respaldo no hay vuelta atrás. Es lo que hace que un redespliegue no pueda
//      perder datos.
//   2. **Un informe de lo aplicado**, para que el log del contenedor diga qué
//      cambió en esta versión.

import fs from 'node:fs'
import path from 'node:path'

import { DATABASE_DIR, DATABASE_PATH, appliedMigrations, db, pendingMigrations } from './db'

/** Respaldos que se conservan. Los más antiguos se borran para no llenar el volumen. */
export const BACKUPS_TO_KEEP = 10

export const BACKUPS_DIR = path.join(DATABASE_DIR, 'backups')

export interface MigrationResult {
  databasePath: string
  /** Migraciones aplicadas en esta ejecución. Vacío si no había nada pendiente. */
  applied: string[]
  /** Ruta del respaldo previo, si hizo falta. */
  backupPath: string | null
  /** Respaldos borrados por rotación. */
  prunedBackups: number
}

/**
 * SQLite en modo WAL guarda datos en tres ficheros. Copiar solo el `.db` puede
 * dejar fuera transacciones que aún viven en el `-wal`.
 */
function copyDatabaseFiles(from: string, to: string): void {
  fs.copyFileSync(from, to)
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${from}${suffix}`)) fs.copyFileSync(`${from}${suffix}`, `${to}${suffix}`)
  }
}

function pruneBackups(): number {
  if (!fs.existsSync(BACKUPS_DIR)) return 0

  const backups = fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.endsWith('.db'))
    .sort()
    .reverse()

  let removed = 0
  for (const name of backups.slice(BACKUPS_TO_KEEP)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const target = path.join(BACKUPS_DIR, `${name}${suffix}`)
      if (fs.existsSync(target)) fs.rmSync(target)
    }
    removed += 1
  }
  return removed
}

/**
 * Aplica las migraciones pendientes, respaldando antes si hay alguna. Es
 * idempotente: llamarla dos veces seguidas no hace nada la segunda vez, así que
 * puede correr en cada arranque del contenedor.
 */
export function migrate(): MigrationResult {
  const pendientes = pendingMigrations()
  let backupPath: string | null = null

  if (pendientes.length > 0 && fs.existsSync(DATABASE_PATH)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupPath = path.join(BACKUPS_DIR, `${stamp}.db`)
    copyDatabaseFiles(DATABASE_PATH, backupPath)
    console.info(`[migrate] respaldo previo en ${backupPath} (${pendientes.length} pendiente(s))`)
  }

  // Abrir la base aplica el esquema y las migraciones detectadas.
  db()

  const prunedBackups = pruneBackups()
  return {
    databasePath: DATABASE_PATH,
    applied: [...appliedMigrations()],
    backupPath,
    prunedBackups,
  }
}
