# PuntoAlerta RD

Plataforma de reporte ciudadano e inteligencia de riesgo urbano para el Gran Santo Domingo.
Un ciudadano fotografía un problema en la vía pública, la IA lo clasifica, y la plataforma
convierte esos reportes en **zonas de riesgo con un score explicable** que se recalcula con el
pronóstico de lluvia y sirve para priorizar brigadas y elegir rutas de menor exposición.

> Información complementaria para la gestión municipal. No sustituye alertas oficiales del COE
> ni del 9-1-1. Los pesos del modelo de riesgo son configurables y no constituyen una predicción
> científica validada.

## Cómo correrlo

```bash
npm install
npm run dev      # http://localhost:3000
```

La base SQLite se crea sola en `data/puntoalertard.db` y se siembra con 16 reportes de demostración la
primera vez que se consulta la API. Para recargarla en cualquier momento:

```bash
curl -X POST http://localhost:3000/api/seed
```

### Variables de entorno

Todas tienen valor por defecto y se validan con Zod en `lib/env.ts` al arrancar: una
configuración inválida falla de inmediato con un mensaje concreto en vez de degradar en silencio.

| Variable | Por defecto | Efecto |
|---|---|---|
| `PUNTOALERTA_VISION_ENGINE` | `auto` | `auto` usa Claude si hay API key y mock si no. `mock` fuerza el motor offline; `claude` exige la API key. |
| `ANTHROPIC_API_KEY` | — | Activa el clasificador de visión real. |
| `PUNTOALERTA_WEATHER_PROVIDER` | `open_meteo` | `mock` evita salir a la red. |
| `PUNTOALERTA_OSRM_URL` | OSRM público | Servidor de rutas alternativo. |
| `PUNTOALERTA_DB_FILE` | `puntoalertard.db` | Nombre del fichero SQLite dentro de `data/`. |
| `PUNTOALERTA_OPERATOR_CODE` | `operador-demo` | Código de acceso del dashboard de operador. |
| `PUNTOALERTA_SESSION_SECRET` | efímero | Secreto de firma de sesiones. Sin él, las sesiones mueren al reiniciar. |
| `DEMO_MODE` | `true` | Habilita escenarios simulados y el endpoint de seed. |

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/` | Mapa público: reportes, zonas de riesgo, clima, filtros y desglose del score. |
| `/reportar` | Formulario ciudadano en 3 pasos: evidencia → ubicación → nota. Devuelve la clasificación de la IA, permite corregirla y muestra el riesgo de la zona. |
| `/dashboard` | Cola de intervención priorizada por riesgo, avance de estados y ruta de brigada. |
| `/rutas` | Comparador: ruta más rápida vs. menor exposición a incidentes reportados. |
| `/suscripciones` | Alta de avisos por correo: elegir zonas en el mapa, nivel mínimo y frecuencia. También confirma y gestiona con el token del correo. |
| `/dashboard/notificaciones` | Bandeja de avisos: qué se envió, a quién y por qué se descartó. |

## API

| Endpoint | Uso |
|---|---|
| `POST /api/reports` | Crear reporte (multipart: `photo`, `lat`, `lng`, `description`, `category`). |
| `GET /api/reports` | Listado con filtros `bbox`, `category`, `status`, `sinceHours`. |
| `GET /api/incidents` | Reportes + zonas con Risk Score + clima, en una llamada. |
| `GET /api/incidents/:id` | Detalle, historial de estados y riesgo de la zona. |
| `PATCH /api/incidents/:id` | Avanzar estado o corregir categoría/severidad. Estado y severidad exigen sesión de operador. |
| `POST /api/auth/operador` | Inicia sesión de operador con el código de acceso. |
| `GET /api/risk?lat=&lng=` | Risk Score de una zona con sus cinco factores explicados. |
| `GET /api/weather` | Pronóstico vigente (Open-Meteo) o escenario simulado. |
| `POST /api/routes/compare` | Comparación de rutas con Exposure Score. |
| `GET /api/photos/:id` | Evidencia de un reporte (no vive en `public/`). |
| `POST /api/subscriptions` | Suscribirse a avisos por correo (doble opt-in). Siempre `202`. |
| `GET /api/subscriptions/verify` | Confirma la suscripción con el token del correo. |
| `GET \| PATCH \| DELETE /api/subscriptions/manage` | Ver, pausar/reactivar o darse de baja con token. |
| `GET /api/notifications` | Bandeja de envíos (operador). Con proveedor `mock` es donde se ve el ciclo. |
| `POST /api/incidents/:id/atestacion` | Quien recibió el aviso responde: sigue igual, empeoró o ya no está. |
| `GET /api/institutional/incidents` | Incidentes de la jurisdicción de la institución (clave API). |
| `PATCH /api/institutional/incidents/:id` | La institución cambia el estado; `403` fuera de su jurisdicción. |
| `POST /api/seed` | Recargar los datos de demostración. |

Todos los endpoints aceptan `scenario=real|seco|lluvia` para forzar el contexto meteorológico y
poder demostrar el recálculo de riesgo en vivo.

Errores con formato estable: `{ error: { code, message, fieldErrors, requestId } }`.

## Documentación

| Documento | Para qué |
|---|---|
| `docs/04-guia-operaciones.md` | Guía explicativa de cada operación tal como está implementada: recorrido por el código, umbrales, cómo se toman las decisiones (§7b), qué pasa si falla y cómo probarla. |
| `docs/05-notificaciones-y-suscripciones.md` | Suscripciones por correo e integración institucional: diseño, permisos para cambiar estado y mock demostrable. Especificado, no implementado. |
| `docs/03-auditoria-brechas.md` | Backlog vivo de brechas frente a los estándares. |
| `docs/01-estandares-plataforma.md` | Visión, usuarios, gobernanza e identidad. |
| `docs/02-mvp-implementacion-step-by-step.md` | Estándares de implementación y fases. |

## Arquitectura

```
app/api/*      Route handlers: validación (zod) + orquestación, sin lógica de negocio.
lib/types.ts   Dominio: categorías, estados, niveles de riesgo, Report, RiskAssessment.
lib/geo.ts     Haversine, celdas/radio de zona, bounding boxes, área de demo.
lib/db.ts      SQLite (better-sqlite3): esquema, constraints e historial de estados.
lib/vision.ts  Clasificación de evidencia: claude-vision con degradación a mock-v1.
lib/weather.ts Proveedor meteorológico aislado, con fallback y escenarios de demo.
lib/risk.ts    Risk Engine v1: 5 factores ponderados + clustering de zonas.
lib/routes.ts  OSRM + Exposure Score + generación de desvíos.
components/*   UI (Leaflet, badges, banners). El mapa carga solo en cliente.
```

Cada capa externa (visión, clima, routing) degrada sin romper la demo: si falla la red, el
clasificador usa el motor mock, el clima usa un valor de respaldo marcado como tal y las rutas se
estiman geométricamente.

### Risk Engine

| Factor | Peso | De dónde sale |
|---|---|---|
| Incidentes recientes | 30% | Reportes abiertos de las últimas 72 h, ponderados por severidad y antigüedad. |
| Historial de la zona | 25% | Total acumulado, incluidos los resueltos que reaparecen. |
| Lluvia prevista | 20% | mm en 6 h y probabilidad (Open-Meteo). |
| Drenaje y basura | 15% | Obstrucción observada por la IA, amplificada por la lluvia prevista. |
| Contexto de alerta | 10% | Nivel de aviso derivado del pronóstico. |

Umbrales: 0-25 bajo · 26-50 moderado · 51-75 alto · 76-100 crítico. Cada factor viaja con la
frase que lo explica: la API nunca devuelve un número sin justificación.

## Demo en 3 minutos

1. **`/`** con *Sin lluvia*: la zona de la Av. México (San Miguel) marca **64/100 — Alto**. El
   desglose muestra por qué: severidad 9/10, 3 reportes en 14 días, 6 en 180, contexto con drenaje
   obstruido, agua acumulada y vía principal. *Ya requiere atención antes de que llueva.*
2. Cambiar a **Lluvia intensa**: la misma zona pasa a **84/100 — Crítico**. Ningún dato cambió; el
   único factor que se movió es el meteorológico y aporta exactamente 20 puntos.

   > No apareció un problema nuevo. Cambió el contexto. PuntoAlerta RD identifica cuándo una
   > vulnerabilidad existente necesita convertirse en prioridad inmediata.

3. **`/reportar`**: enviar una foto de un imbornal tapado; la IA propone *drenaje obstruido*, se
   puede corregir, y el riesgo de la zona se recalcula dejando un snapshot inmutable.
4. **`/dashboard`**: la zona crítica encabeza la cola de intervención.
5. **`/rutas`** → *Escenario de la demo*: la ruta directa cruza la zona crítica a 4 m del trazado;
   la alternativa llega **+2 min** con exposición 0.

El clima aporta 20 puntos como máximo, por diseño: **la lluvia no crea el riesgo, activa una
vulnerabilidad que ya existe**. Un punto sin historial no llega a crítico porque cambie el
pronóstico, y hay un test que lo fija.

## Verificación

```bash
npm run verify   # lint + tsc + tests + build + comprobación de secretos en el bundle
npm test         # solo los 201 tests unitarios
```

`npm run check:zone-selection` comprueba en un navegador real (vía CDP) que al pulsar una zona en el
panel el mapa se acerque y la resalte; hace falta `npm run dev` y Chrome con
`--remote-debugging-port=9222`.

`npm run check:secrets` revisa que ningún valor por defecto de configuración sensible acabe en
`.next/static`. Existe porque pasó: un componente de cliente importaba un valor de un módulo que
importa `lib/env.ts`, y el código de operador terminó en el bundle del navegador.

60 casos unitarios (Vitest) sobre módulos puros: fórmula de riesgo con sus límites exactos, máquina
de estados, detección de similares, exposure score y validaciones. Incluyen los números de la demo
(64 en seco, 84 con lluvia), así que un cambio de pesos o de seed rompe el test antes que la demo.

## Límites conocidos

- SQLite y ficheros locales: el MVP no está pensado para despliegue serverless tal cual.
- La sesión de operador es un rol compartido con código de acceso, no un proveedor de identidad:
  no hay usuarios ni auditoría por persona.
- No hay desenfoque automático de rostros ni placas en la evidencia.
- Las rutas no consideran tránsito en tiempo real, solo incidentes reportados.
