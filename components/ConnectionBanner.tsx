'use client'

import { useEffect, useState } from 'react'

/**
 * §18 — estado "offline/connection lost" obligatorio. Se anuncia con `role="status"`
 * y `aria-live` porque perder la conexión no es visible para quien usa lector de
 * pantalla, y el formulario de reporte depende de la red para enviarse.
 */
export function ConnectionBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-gold-500 px-4 py-2 text-center text-sm font-semibold text-ink"
    >
      Sin conexión. Puedes seguir viendo lo que ya está cargado; enviar un reporte requiere red.
    </div>
  )
}
