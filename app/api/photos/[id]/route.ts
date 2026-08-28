// GET /api/photos/:id — entrega la evidencia sin exponer el sistema de ficheros (RNF-07)

import { apiError, handler } from '@/lib/api'
import { getReport } from '@/lib/db'
import { readPhoto } from '@/lib/storage'

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params
  const report = getReport(id)
  if (!report?.photoPath) return apiError('NOT_FOUND', 'El reporte no tiene evidencia asociada.')

  const photo = await readPhoto(report.photoPath)
  if (!photo) return apiError('NOT_FOUND', 'La evidencia no está disponible.')

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      'content-type': photo.mimeType,
      'cache-control': 'private, max-age=3600',
    },
  })
})
