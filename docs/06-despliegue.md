# Despliegue

PuntoAlerta RD se despliega con el mismo patrón que el resto de los servicios del
VPS: **EasyPanel → From Compose**, variables en la UI del panel, la aplicación
expuesta solo en la red interna de Docker y Traefik terminando TLS delante.

---

## 1. Lo que hay que saber antes

| Dato | Valor |
|---|---|
| Puerto interno | **8090** |
| Compose de producción | `docker-compose.prod.yml` |
| Volumen de datos | `puntoalerta_data` → `/app/data` |
| Sonda de salud | `GET /api/health` |
| Usuario del contenedor | `node` (uid 1000), sin root |

**Sobre el puerto 8090:** en este VPS ya están ocupados el 3000 (EasyPanel), 8088
(finance-bot), y además 22, 1337, 5001, 5433, 5678, 8000, 9000 y 18080. El 8090
queda libre y mantiene la convención de estar cerca del de finance-bot.

**No hay servicio de base de datos.** La base es un fichero SQLite dentro del
volumen, junto con la evidencia fotográfica y los respaldos. Eso simplifica el
despliegue —un solo contenedor— y concentra todo el riesgo en un punto: **el
volumen es el dato entero del sistema**.

---

## 2. Pasos en EasyPanel

1. **New Project → From Compose**, apuntando a este repositorio.
2. Selecciona `docker-compose.prod.yml` como compose file.
3. **Environment**: configura las variables de la tabla siguiente.
4. **Domains**: apunta el dominio al servicio `app`, puerto **8090**.
5. Copia el dominio asignado y ponlo como `PUNTOALERTA_BASE_URL`.
6. **Deploy.**

### Variables

| Variable | ¿Requerida? | Para qué |
|---|---|---|
| `PUNTOALERTA_OPERATOR_CODE` | **Sí** | Código de acceso del dashboard. El arranque falla si se queda el valor por defecto. |
| `PUNTOALERTA_SESSION_SECRET` | **Sí** | Firma de sesiones y de los tokens de suscripción. Mínimo 16 caracteres. |
| `PUNTOALERTA_BASE_URL` | **Sí** | Dominio público https. Se usa para los enlaces de confirmación y baja de los avisos. |
| `DEMO_MODE` | No (`false`) | `true` habilita escenarios meteorológicos simulados, el seed de demostración y el endpoint de recarga. |
| `PUNTOALERTA_VISION_ENGINE` | No (`auto`) | `auto` usa Claude si hay API key y el motor mock si no. |
| `ANTHROPIC_API_KEY` | No | Clasificador de visión real. Sin ella, el motor mock (determinista, offline). |
| `PUNTOALERTA_WEATHER_PROVIDER` | No (`open_meteo`) | `mock` evita salidas a la red. |
| `PUNTOALERTA_OSRM_URL` | No (OSRM público) | Servidor de rutas alternativo. |
| `PUNTOALERTA_DB_FILE` | No (`puntoalertard.db`) | Nombre del fichero dentro del volumen. |

**El arranque falla a propósito** si falta el código de operador o el secreto de
sesión. Es preferible un despliegue que no levanta a uno que levanta con el
dashboard abierto o con sesiones que se invalidan en cada reinicio.

Las variables opcionales pueden quedar vacías: la cadena vacía se trata como
ausencia de valor, porque es lo que pasan Compose y los paneles.

---

## 3. Qué pasa al arrancar el contenedor

```
node server.js
  └─ instrumentation.ts · register()      ← antes de aceptar peticiones
       ├─ valida la configuración          → si falla, el contenedor no levanta
       ├─ ¿migraciones pendientes?
       │    ├─ sí → respaldo en data/backups/<fecha>.db
       │    └─ aplica y registra qué cambió
       └─ log: "[arranque] base lista en …"
```

Es el equivalente a `alembic upgrade head && uvicorn …` de finance-bot, con una
diferencia: aquí va **dentro** del arranque del servidor, así que no hay ventana
en la que el proceso acepte peticiones con el esquema a medias.

Ejemplo de log tras una migración real:

```
[migrate] respaldo previo en /app/data/backups/2026-08-28T18-33-41-812Z.db (1 pendiente(s))
[db] añadiendo columna session_hash a reports
[arranque] base lista en /app/data/puntoalertard.db · migraciones aplicadas: columna reports.session_hash
```

---

## 4. Redespliegue

Un redespliegue es: construir la imagen nueva, parar el contenedor viejo,
levantar el nuevo **contra el mismo volumen**. EasyPanel lo hace así por defecto.

**Verificado** con este procedimiento exacto: 19 reportes y un dato de prueba
antes; cambio de código; `docker compose up -d --build`; 19 reportes y el dato
intactos, sirviendo el código nuevo.

Por qué es seguro:

| Riesgo | Mitigación |
|---|---|
| Perder la base al reconstruir | La base vive en el volumen, no en la imagen. `.dockerignore` excluye `data/` del contexto de build. |
| Migración a medias | Respaldo automático del `.db` (con `-wal` y `-shm`) antes de aplicar cualquier cambio de esquema. Se conservan los 10 últimos. |
| Migración repetida | Son idempotentes: `CREATE TABLE IF NOT EXISTS`, columnas solo si faltan, `CHECK` solo si está desactualizado. Arrancar dos veces no hace nada la segunda. |
| Sembrar datos falsos sobre datos reales | `ensureSeeded` solo siembra si `DEMO_MODE=true` **y** la base está vacía. |
| Marcar como sano un contenedor roto | El healthcheck lee la base, no solo comprueba que el proceso viva. Si falla, el orquestador no promueve el contenedor. |
| Sesiones invalidadas en cada despliegue | `PUNTOALERTA_SESSION_SECRET` es obligatorio: con un secreto efímero, cada reinicio expulsaría a los operadores. |

### Lo que un redespliegue **no** conserva

- **El caché meteorológico**, que vive en memoria. Se rellena en la primera
  consulta; entre tanto, la primera petición sale a Open-Meteo.
- **El limitador de peticiones**, también en memoria. Tras un despliegue, los
  contadores de abuso empiezan de cero.

Ninguno de los dos es un dato del sistema, pero conviene saberlo.

---

## 5. Respaldos

Los respaldos automáticos previos a migración viven **dentro del volumen**
(`data/backups/`), lo que los protege de un fallo de migración pero **no** de la
pérdida del volumen. Para sacar una copia fuera:

```bash
# Copia puntual del volumen completo a un tar local
docker run --rm -v puntoalerta_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/puntoalerta-$(date +%F).tar.gz -C /data .

# Restaurar sobre un volumen vacío
docker run --rm -v puntoalerta_data:/data -v "$PWD":/backup alpine \
  sh -c "cd /data && tar xzf /backup/puntoalerta-2026-08-28.tar.gz"
```

Conviene programarlo en el VPS. Un `.db` de esta escala pesa pocos MB.

---

## 6. Prueba local antes de desplegar

```bash
docker compose up -d --build      # http://localhost:8090
curl -s localhost:8090/api/health | jq
docker compose logs -f app
docker compose down               # el volumen sobrevive
docker compose down -v            # borra también el volumen
```

El compose de desarrollo usa valores por defecto y `DEMO_MODE=true`, así que la
primera visita siembra los 18 reportes de la demostración.

---

## 7. Comprobaciones antes de dar un despliegue por bueno

- [ ] `npm run verify` en verde (lint, tipos, 203 tests, build, secretos del bundle).
- [ ] `docker compose up --build` local levanta y `/api/health` devuelve `ok`.
- [ ] `PUNTOALERTA_OPERATOR_CODE` **no** es `operador-demo`.
- [ ] `PUNTOALERTA_SESSION_SECRET` configurado y con al menos 16 caracteres.
- [ ] `PUNTOALERTA_BASE_URL` es el dominio real con https.
- [ ] `DEMO_MODE=false` si el despliegue va a recibir reportes reales.
- [ ] El volumen `puntoalerta_data` existe y está montado en `/app/data`.
- [ ] El dominio apunta al puerto **8090** del servicio `app`.
- [ ] Tras el despliegue: `docker compose logs` muestra la línea `[arranque]`.
- [ ] Iniciar sesión de operador y comprobar que la bandeja de avisos responde.

---

## 8. Diferencias con el despliegue de finance-bot

| | finance-bot | PuntoAlerta RD |
|---|---|---|
| Base de datos | Postgres en servicio aparte, volumen `postgres_data` | SQLite en fichero, volumen `puntoalerta_data` |
| Migraciones | `alembic upgrade head` antes de arrancar el servidor | `instrumentation.ts` dentro del arranque, con respaldo previo |
| Puerto interno | 8088 | 8090 |
| Runtime | Python 3.12 + uvicorn | Node 24 + servidor standalone de Next |
| Usuario | root | `node` (uid 1000) |
| Healthcheck | `pg_isready` en la base | `GET /api/health` en la aplicación |

La ausencia de un servicio de base de datos hace el volumen **más** crítico, no
menos: sin él se pierden los reportes y la evidencia. De ahí el respaldo previo a
cada migración y la recomendación de sacar copias fuera del VPS.
