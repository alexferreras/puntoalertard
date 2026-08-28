// Límites de validación compartidos por cliente y servidor. Viven aparte para
// que el bundle del navegador no arrastre los helpers de API del servidor.

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_DESCRIPTION_CHARS = 280
