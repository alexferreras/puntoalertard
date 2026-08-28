// Formateo para la UI. Todo en español dominicano, sin depender de librerías.

export function relativeTime(iso: string, now = Date.now()): string {
  const diffMinutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (diffMinutes < 1) return 'ahora mismo'
  if (diffMinutes < 60) return `hace ${diffMinutes} min`
  const hours = Math.round(diffMinutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`
  const months = Math.round(days / 30)
  return `hace ${months} mes${months === 1 ? '' : 'es'}`
}

export function minutesOf(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

export function kilometersOf(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export function coordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
