// Almacenamiento de evidencia. Las fotos NO van a `public/`: se guardan fuera
// del árbol servido y se entregan por `/api/photos/:id`, para poder añadir
// controles de acceso o desenfoque más adelante (RNF-07).

import fs from 'node:fs/promises'
import path from 'node:path'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType] ?? 'bin'
}

/** Guarda la evidencia y devuelve la ruta relativa que se persiste en el reporte. */
export async function savePhoto(reportId: string, mimeType: string, bytes: Buffer): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const filename = `${reportId}.${extensionFor(mimeType)}`
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes)
  return `uploads/${filename}`
}

export interface StoredPhoto {
  bytes: Buffer
  mimeType: string
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export async function readPhoto(photoPath: string): Promise<StoredPhoto | null> {
  // Solo se acepta el formato que produce `savePhoto`: evita path traversal.
  const match = /^uploads\/([A-Za-z0-9-]+)\.(jpg|png|webp)$/.exec(photoPath)
  if (!match) return null
  const [, id, ext] = match
  try {
    const bytes = await fs.readFile(path.join(UPLOAD_DIR, `${id}.${ext}`))
    return { bytes, mimeType: MIME_BY_EXT[ext] }
  } catch {
    return null
  }
}
