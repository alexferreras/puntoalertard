// Arranque del servidor. `register()` corre una sola vez y **debe completarse
// antes de que Next acepte peticiones**, así que es el sitio correcto para lo
// que tiene que fallar temprano:
//
//   1. Validar la configuración. Sin esto, un despliegue con el código de
//      operador por defecto arrancaría "bien" y el fallo aparecería como un 500
//      en la primera petición — o peor, no aparecería y el dashboard quedaría
//      abierto.
//   2. Abrir la base y aplicar migraciones, equivalente a `alembic upgrade head`
//      antes de levantar el servidor.
//
// Solo corre en el runtime de Node: el edge runtime no tiene acceso al disco.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { env } = await import('./lib/env')
  const { migrate } = await import('./lib/migrate')

  console.info(
    `[arranque] PuntoAlerta RD · entorno ${process.env.NODE_ENV ?? 'desconocido'} · demo ${
      env.DEMO_MODE ? 'sí' : 'no'
    }`,
  )

  const result = migrate()
  console.info(
    `[arranque] base lista en ${result.databasePath}` +
      (result.applied.length > 0
        ? ` · migraciones aplicadas: ${result.applied.join(', ')}`
        : ' · sin migraciones pendientes') +
      (result.backupPath ? ` · respaldo previo en ${result.backupPath}` : ''),
  )
}
