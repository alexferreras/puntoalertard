|     |
|-----|

**PUNTOALERTA RD**

Especificación Técnica y Plan de Implementación del MVP

Guía step-by-step para construir el hackathon sin decisiones implícitas

<img src="media/image1.png" title="Señales ciudadanas conectadas" style="width:5.9in;height:2.36in" alt="Constelación decorativa de puntos y estrellas que representa señales ciudadanas conectadas." />

| **Versión** | 2.0 |
|----|----|
| **Propósito** | Servir como master specification para Claude/coding agents y como Definition of Done del equipo. |

*Identidad visual: blanco + morado + dorado, con una constelación de estrellas como símbolo de señales ciudadanas conectadas. La identidad evita copiar logotipos, proporciones o símbolos de organizaciones políticas.*

# Contenido

> **01 Contrato de ejecución para Claude**
>
> **02 Scope congelado del MVP**
>
> **03 Stack y versiones**
>
> **04 Arquitectura**
>
> **05 Repositorio y convenciones**
>
> **06 Variables de entorno**
>
> **07 Modelo de datos**
>
> **08 Contratos de API**
>
> **09 Flujo de creación de reporte**
>
> **10 Integración de IA**
>
> **11 Detección de duplicados**
>
> **12 Risk Engine**
>
> **13 Integración meteorológica**
>
> **14 Mapa y geoespacial**
>
> **15 Routing y exposición**
>
> **16 Estados y dashboard**
>
> **17 Design system completo**
>
> **18 Pantallas y comportamiento**
>
> **19 Validaciones**
>
> **20 Seguridad y privacidad**
>
> **21 Observabilidad y errores**
>
> **22 Testing**
>
> **23 Datos seed y escenarios**
>
> **24 Implementación por fases**
>
> **25 CI/CD y despliegue**
>
> **26 Demo y checklist final**
>
> **27 Backlog P1/P2**
>
> **28 Definition of Done global**
>
> **29 Referencias**

# 1. Contrato de ejecución para Claude

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Regla principal</strong></p>
<p>Claude debe tratar este documento como especificación normativa. No debe cambiar stack, nombres de estados, esquema de datos, colores, rutas, contratos o pesos del Risk Engine sin registrar explícitamente la desviación y su razón.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**1.** Trabajar fase por fase en el orden definido en la sección 24.

**2.** Antes de escribir código de una fase, leer sus criterios de aceptación y tests requeridos.

**3.** Implementar primero la ruta feliz más pequeña; después estados de error y validaciones.

**4.** No avanzar si npm run typecheck, npm run lint y tests de la fase están rojos.

**5.** Cada integración externa debe estar detrás de una interfaz/adaptador y tener un MockProvider para desarrollo/demo.

**6.** No agregar dependencias sin necesidad. Si se agrega una, documentarla en README y fijar una versión compatible.

**7.** No exponer service role keys, API keys, secretos o media privada al navegador.

**8.** Cualquier dato de ciudadano se considera no verificado hasta que el sistema o un operador lo valide.

**9.** Toda lógica importante debe ser determinista y testeable sin llamar a servicios externos.

**10.** Al terminar una fase, actualizar /docs/implementation-status.md con PASS/FAIL por criterio.

## Formato de entrega de cada fase

Phase N completion report\
- Files created/changed:\
- Decisions made:\
- Commands executed:\
- Unit tests: PASS/FAIL\
- Integration tests: PASS/FAIL\
- E2E/manual checks: PASS/FAIL\
- Known limitations:\
- Ready for next phase: YES/NO

# 2. Scope congelado del MVP

## P0 — obligatorio para demo

- PWA responsive con home, reporte, mapa, detalle y dashboard.

- Reporte anónimo con 1 foto, GPS, fecha/hora y nota opcional.

- Clasificación de imagen mediante VisionProvider real + modo mock.

- Categorías: TRASH, BLOCKED_DRAIN, FLOOD_WATER, FIRE_SMOKE, BLOCKED_ROAD, OTHER.

- Detección de duplicados geoespacial/temporal simple.

- Risk Score 0-100, razones y niveles LOW/MODERATE/HIGH/CRITICAL.

- WeatherProvider real (Open-Meteo) + mock/simulación.

- Mapa con pins/clusters y filtros.

- Dashboard con cola ordenada, validación y cambio de estado.

- Comparador de 2-3 rutas usando OSRM y exposure score.

- Seed/demo reproducible y script de demo.

- Tests unitarios, integración, E2E smoke y accesibilidad básica.

## P1 — solo si P0 está verde

- Video

- **Notificaciones y suscripciones** (`05-notificaciones-y-suscripciones.md`): modelo de datos,
  `EmailProvider` con implementación mock y bandeja simulada en el dashboard, suscripción con doble
  opt-in y gestión por token, webhook institucional firmado con HMAC y seed de dos instituciones.
  El envío real de correo y el auto-registro institucional son P2.

- Ruta multi-stop de brigada optimizada

- Moderación avanzada

- Heatmap histórico

- Blur automático de rostros/placas

## Fuera del MVP

- Sanciones automáticas

- Identificación de personas/placas

- Predicción científica de inundaciones

- Integración 9-1-1/COE en producción

- Cobertura nacional

- Native iOS/Android

# 3. Stack y versiones

| **Capa** | **Decisión** |
|----|----|
| Runtime | Node.js 24.20.0 LTS. |
| Framework | Next.js 16.3.3 Active LTS, App Router, TypeScript strict. |
| UI | Tailwind CSS 4.3+; componentes propios simples. Evitar framework UI pesado. |
| Validación | Zod para DTOs, env y respuestas de proveedores. |
| DB/Auth/Storage | Supabase: PostgreSQL + PostGIS + Auth + Storage privado. |
| Mapas | MapLibre GL JS v6. |
| Geometría | @turf/\* para distancia/intersección/buffer. |
| Clima | Open-Meteo detrás de WeatherProvider. |
| Rutas | OSRM HTTP API detrás de RoutingProvider. |
| IA | OpenAI Responses API con entrada de imagen + Structured Outputs; modelo por env. Default sugerido costo/latencia: gpt-5.6-luna \[S13\]. |
| Unit/Integration | Vitest + Testing Library + MSW para mocks HTTP. |
| E2E | Playwright. |
| A11y | axe-core/playwright + auditoría manual WCAG 2.2 AA. |
| Deploy | Vercel + Supabase. |

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Versiones validadas al 27/08/2026</strong></p>
<p>Next.js 16.3.3 figura como Active LTS y Node 24.20.0 como LTS [S11]. Para dependencias menores, usar lockfile y no actualizar durante el hackathon salvo vulnerabilidad/bloqueo.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 4. Arquitectura

Browser / PWA\
\|\
\| HTTPS\
v\
Next.js 16 App Router\
\|- Server Actions / Route Handlers\
\|- Zod validation\
\|- Auth guard (admin only)\
\|- Domain services\
\|- IncidentService\
\|- VisionProvider -\> OpenAI / Mock\
\|- WeatherProvider -\> Open-Meteo / Mock\
\|- RoutingProvider -\> OSRM / Mock\
\|- RiskEngine (pure)\
\|- DuplicateDetector (pure + PostGIS query)\
\|\
v\
Supabase\
\|- PostgreSQL + PostGIS\
\|- RLS\
\|- Private Storage: report-media\
\|- Auth: admin/operator

- Regla de dependencias: UI → application/service → domain → adapters. Domain no importa SDKs externos.

- RiskEngine y DuplicateDetector deben poder ejecutarse con objetos simples y tests sin DB.

- Proveedores externos deben tener timeout, schema validation y fallback controlado.

- El navegador nunca llama directamente a OpenAI, Open-Meteo u OSRM si requiere secretos/políticas; hacerlo desde server routes para centralizar observabilidad y validación.

# 5. Repositorio y convenciones

puntoalerta-rd/\
app/\
(public)/page.tsx\
report/page.tsx\
report/review/page.tsx\
map/page.tsx\
incident/\[id\]/page.tsx\
route/page.tsx\
dashboard/page.tsx\
dashboard/incidents/\[id\]/page.tsx\
api/\
reports/route.ts\
incidents/route.ts\
incidents/\[id\]/route.ts\
incidents/\[id\]/status/route.ts\
weather/route.ts\
routes/compare/route.ts\
components/\
ui/\
map/\
report/\
dashboard/\
domain/\
incident.ts\
risk.ts\
validation.ts\
services/\
incident-service.ts\
risk-engine.ts\
duplicate-detector.ts\
providers/\
vision/\
weather/\
routing/\
lib/\
supabase/\
env.ts\
logger.ts\
geo.ts\
supabase/\
migrations/\
seed.sql\
tests/\
unit/\
integration/\
e2e/\
fixtures/\
docs/\
implementation-status.md\
api-contracts.md\
.env.example\
package.json\
README.md

- Archivos TypeScript: kebab-case. Componentes React exportados: PascalCase.

- Funciones/variables: camelCase. Constantes de dominio: SCREAMING_SNAKE_CASE.

- Enums persistidos se modelan como CHECK constraints o Postgres enum, y en TypeScript como Zod enums.

- No usar any. TypeScript strict=true; noUncheckedIndexedAccess=true; exactOptionalPropertyTypes=true si el ecosistema no rompe.

- Cada función de dominio compleja debe tener JSDoc corto explicando entradas/unidades, no comentarios narrativos obvios.

# 6. Variables de entorno

NEXT_PUBLIC_SUPABASE_URL=\
NEXT_PUBLIC_SUPABASE_ANON_KEY=\
SUPABASE_SERVICE_ROLE_KEY= \# server only\
OPENAI_API_KEY= \# server only\
VISION_MODEL=gpt-5.6-luna\
VISION_PROVIDER=openai \# openai \| mock\
WEATHER_PROVIDER=open_meteo \# open_meteo \| mock\
OSRM_BASE_URL=https://router.project-osrm.org\
APP_BASE_URL=http://localhost:3000\
DEMO_MODE=true\
REPORT_MAX_IMAGE_MB=8\
DUPLICATE_RADIUS_METERS=60\
DUPLICATE_WINDOW_HOURS=24\
RISK_WEATHER_HOURS=6\
EMAIL_PROVIDER=mock \# mock \| resend \| ses\
EMAIL_FROM=avisos@puntoalertard.do\
EMAIL_API_KEY= \# server only, requerido si EMAIL_PROVIDER != mock\
SUBSCRIPTION_TOKEN_SECRET= \# server only, firma de tokens de verificación y baja\
NOTIFY_MAX_PER_DAY=10\
NOTIFY_ZONE_COOLDOWN_HOURS=6

- Crear lib/env.ts con Zod; fallar al startup si falta un secreto requerido para el provider activo.

- No prefijar secretos con NEXT_PUBLIC\_.

- Commit solo .env.example, nunca .env.local.

- DEMO_MODE habilita clima simulado y seed helpers, pero nunca bypass de autenticación en producción.

# 7. Modelo de datos

## 7.1 Enums

incident_category = TRASH \| BLOCKED_DRAIN \| FLOOD_WATER \| FIRE_SMOKE \| BLOCKED_ROAD \| OTHER\
incident_status = REPORTED \| NEEDS_REVIEW \| VALIDATED \| ASSIGNED \| IN_PROGRESS \| RESOLVED \| DISMISSED \| DUPLICATE\
risk_level = LOW \| MODERATE \| HIGH \| CRITICAL\
report_source = CITIZEN \| OPERATOR \| SEED\
verification = UNVERIFIED \| AI_ASSISTED \| OPERATOR_VALIDATED

## 7.2 Tablas mínimas

| **Tabla** | **Campos obligatorios clave** | **Índices** |
|----|----|----|
| incidents | id uuid, category, status, verification, location geography(Point,4326), severity 0-100, current_risk_score, current_risk_level, created_at, updated_at, resolved_at. | GIST(location), status, category, created_at. |
| reports | id, incident_id, anonymous_session_id hash, note, source, lat/lng snapshot, captured_at, created_at. | incident_id, created_at. |
| media_assets | id, report_id, bucket/path, mime_type, bytes, width, height, sha256. | report_id, sha256. |
| ai_analyses | id, report_id, provider, model, prompt_version, category, severity, confidence, signals jsonb, raw_schema_version, created_at. | report_id. |
| weather_snapshots | id, incident_id, provider, observed_at, forecast_from/to, precip_1h, precip_3h, precip_6h, is_stale, payload_excerpt jsonb. | incident_id, observed_at. |
| risk_snapshots | id, incident_id, score, level, factors jsonb, formula_version, created_at. | incident_id, created_at. |
| incident_events | id, incident_id, actor_type, actor_id nullable, event_type, from_status, to_status, metadata jsonb, created_at. | incident_id, created_at. |
| profiles | user_id, role OPERATOR\|ADMIN, display_name. | user_id unique. |

## 7.3 Constraints obligatorios

- severity y risk_score BETWEEN 0 AND 100.

- latitude BETWEEN -90 AND 90; longitude BETWEEN -180 AND 180 antes de crear geography.

- captured_at no puede estar \> 10 minutos en el futuro; si viene de metadata del dispositivo, server controla tolerancia.

- media mime permitido P0: image/jpeg, image/png, image/webp.

- media ≤ REPORT_MAX_IMAGE_MB (8 MB default); ancho/alto entre 320 y 6000 px.

- status transition validada por dominio, no update libre.

- resolved_at requerido cuando status=RESOLVED; nulo en estados activos.

## 7.4 RLS

- anon: no SELECT directo a tablas privadas; crear reporte exclusivamente por endpoint server.

- authenticated operator: SELECT incidents/reports/analyses; UPDATE status mediante endpoint que valida rol.

- service_role: solo server.

- Storage report-media: privado; upload server-side; download con signed URL de 5 minutos solo para operador autenticado.

# 8. Contratos de API

## POST /api/reports

multipart/form-data\
image: File (required)\
latitude: number (required)\
longitude: number (required)\
capturedAt: ISO-8601 (required)\
note: string \<= 280 (optional)\
anonymousSessionId: UUID (required)\
\
201 response\
{\
"reportId": "uuid",\
"incidentId": "uuid",\
"status": "REPORTED\|NEEDS_REVIEW",\
"analysis": {\
"category": "BLOCKED_DRAIN",\
"severity": 82,\
"confidence": 0.91\
},\
"risk": {\
"score": 74,\
"level": "HIGH",\
"reasons": \["drenaje obstruido", "lluvia prevista"\]\
},\
"duplicateOf": null\
}

## GET /api/incidents

Query: bbox=minLng,minLat,maxLng,maxLat; category?; status?; riskLevel?\
200: { items: IncidentMapItem\[\], updatedAt: string }\
\
Public IncidentMapItem MUST NOT contain media URL, anonymousSessionId, exact reporter metadata or internal notes.

## PATCH /api/incidents/:id/status

Authenticated OPERATOR/ADMIN only\
{ "toStatus": "VALIDATED\|ASSIGNED\|IN_PROGRESS\|RESOLVED\|DISMISSED", "reason": "optional \<= 280" }\
200: incident summary + new event id\
409: invalid state transition\
403: no role\
404: incident not found

## POST /api/routes/compare

{\
"origin": {"lat":18.48,"lng":-69.91},\
"destination": {"lat":18.47,"lng":-69.89}\
}\
\
200 {\
"routes": \[\
{"id":"r1","durationSeconds":720,"distanceMeters":5400,"exposureScore":68,"nearbyCriticalIncidents":2,"geometry":{...}},\
{"id":"r2","durationSeconds":960,"distanceMeters":6100,"exposureScore":18,"nearbyCriticalIncidents":0,"geometry":{...}}\
\],\
"recommendedRouteId": "r2",\
"disclaimer": "Alternativa de menor exposición..."\
}

## Endpoints de notificaciones (P1)

Contratos completos en `05-notificaciones-y-suscripciones.md` §5. Resumen:

POST /api/subscriptions -\> siempre 202, nunca revela si el correo ya existía\
GET /api/subscriptions/verify?token= -\> activa el doble opt-in\
GET \| PATCH \| DELETE /api/subscriptions/manage?token= -\> ver, pausar/reactivar, dar de baja\
POST /api/incidents/:id/atestacion?token= -\> sigue_igual \| empeoro \| ya_no_esta\
\
GET /api/institutional/incidents?since= -\> API key; solo su jurisdicción\
PATCH /api/institutional/incidents/:id -\> cambia estado; 403 fuera de jurisdicción\
POST /api/admin/institutions -\> alta; devuelve la API key una sola vez

Webhook saliente: firma HMAC-SHA256 en `X-PuntoAlerta-Signature`, `X-PuntoAlerta-Delivery` para
idempotencia, `X-PuntoAlerta-Timestamp` con ventana de 5 min, reintentos 1m/5m/30m/2h/6h.

## Errores estándar

{\
"error": {\
"code": "VALIDATION_ERROR\|UPSTREAM_TIMEOUT\|UNAUTHORIZED\|FORBIDDEN\|NOT_FOUND\|CONFLICT\|INTERNAL_ERROR",\
"message": "Mensaje seguro para usuario",\
"fieldErrors": {"latitude": \["..."\]},\
"requestId": "uuid"\
}\
}

# 9. Flujo de creación de reporte

**1.** UI solicita ubicación al tocar Reportar, no al cargar la home.

**2.** Si el usuario deniega GPS, mostrar explicación y permitir colocar pin manualmente en P1; para P0, requerir ubicación para enviar.

**3.** Capturar/seleccionar una única imagen.

**4.** Validar cliente: tipo, tamaño y preview; server repite todas las validaciones.

**5.** Generar anonymousSessionId UUID en localStorage si no existe.

**6.** Enviar multipart al server.

**7.** Server valida payload con Zod y metadata de imagen real.

**8.** Guardar report temporal y media privada.

**9.** Calcular hash SHA-256 para detectar archivo repetido exacto.

**10.** Ejecutar VisionProvider. Timeout recomendado: 12 s.

**11.** Validar Structured Output. Si error/timeout: category=OTHER, severity=50, verification=UNVERIFIED, status=NEEDS_REVIEW y continuar.

**12.** Buscar incidentes similares dentro de radio/ventana. Si hay match fuerte, adjuntar report al incidente existente; si no, crear incident.

**13.** Consultar WeatherProvider; timeout 4 s. Si falla, usar weather neutral y marcar stale.

**14.** Calcular Risk Snapshot.

**15.** Registrar IncidentEvent REPORT_CREATED o REPORT_ATTACHED.

**16.** Responder al cliente con resumen y mensaje de que la clasificación es asistida.

# 10. Integración de IA

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Principio</strong></p>
<p>La IA propone; el sistema valida. Ningún output del modelo se persiste sin pasar un JSON Schema/Zod y límites de dominio.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 10.1 Interface

export interface VisionProvider {\
analyze(input: { imageBytes: Buffer; mimeType: AllowedImageMime }): Promise\<VisionAnalysis\>;\
}\
\
type VisionAnalysis = {\
category: IncidentCategory;\
severity: number; // integer 0..100\
confidence: number; // 0..1\
signals: {\
trashLevel: 'NONE'\|'LOW'\|'MEDIUM'\|'HIGH'\|'UNKNOWN';\
waterPresent: boolean;\
smokeOrFirePresent: boolean;\
drainVisible: boolean;\
roadObstruction: 'NONE'\|'PARTIAL'\|'FULL'\|'UNKNOWN';\
};\
summary: string; // \<= 160 chars, no identity claims\
};

## 10.2 Prompt invariants

- Clasificar únicamente evidencia visible; no inferir identidad, intención, culpabilidad, raza, edad exacta ni placa.

- Si la evidencia es ambigua, bajar confidence y usar OTHER cuando corresponda.

- Severity representa impacto visual aproximado, no riesgo médico ni legal.

- No describir rostros ni transcribir placas.

- Structured Outputs con JSON Schema estricto; no JSON libre.

- Guardar prompt_version="vision-v1" y model para reproducibilidad.

## 10.3 Tests IA

- Schema válido para cada categoría fixture.

- severity=-1/101 del mock debe ser rechazado.

- categoría desconocida debe fallar schema y entrar NEEDS_REVIEW.

- timeout produce fallback sin perder reporte.

- imagen sin incidente produce OTHER con confianza baja en fixture controlado.

- prompt no solicita identificación de personas/placas.

# 11. Detección de duplicados

El MVP no necesita clustering complejo. Usa dos señales: duplicado exacto de media y proximidad espacio/tiempo + categoría compatible.

1\) Exact media duplicate:\
if media.sha256 already exists within 24h -\> strong duplicate candidate\
\
2) Spatial duplicate candidate:\
ST_DWithin(existing.location, new.location, radius=60m)\
AND existing.created_at \>= now - 24h\
AND existing.status NOT IN (RESOLVED, DISMISSED)\
AND category compatible\
\
3) Candidate score:\
distance \<= 20m: +50\
distance \<= 60m: +30\
same category: +30\
compatible category (TRASH\<-\>BLOCKED_DRAIN, FLOOD_WATER\<-\>BLOCKED_DRAIN): +15\
created \<= 3h: +20\
created \<= 24h: +10\
exact hash: +100\
\
\>=80 =\> attach automatically\
50..79 =\> create new incident but mark POSSIBLE_DUPLICATE metadata\
\<50 =\> new incident

- Nunca fusionar automáticamente FIRE_SMOKE con otro incidente por categoría compatible; requiere misma categoría o hash.

- Al adjuntar como duplicado, conservar el Report individual y aumentar recurrencia/evidencia del Incident.

- Testear límites exactos 20m, 60m, 3h y 24h.

# 12. Risk Engine

## 12.1 Fórmula versionada

risk = round(\
severityFactor \* 0.30 +\
recurrenceFactor \* 0.25 +\
weatherFactor \* 0.20 +\
historyFactor \* 0.15 +\
contextFactor \* 0.10\
)\
\
clamp risk to 0..100\
formulaVersion = "risk-v1"

## 12.2 Normalización

| **Factor** | **Regla P0** |
|----|----|
| severityFactor | Incident severity 0-100. |
| recurrenceFactor | 0 reports=0; 1=20; 2=40; 3=60; 4=80; \>=5=100 dentro de 14 días/100m. |
| weatherFactor | Max de precipitación próxima normalizada: \<1mm=0; 1-4.9=25; 5-14.9=50; 15-29.9=75; \>=30mm/6h=100. Parámetros de demo, no umbral científico. |
| historyFactor | 0 histórico=0; 1-2=30; 3-5=60; \>=6=100 en 180 días/100m. |
| contextFactor | Blocked drain +20; flood water +30; blocked road +20; vía principal seed +20; alert flag manual +30; clamp 100. |

## 12.3 Nivel

0..25 LOW\
26..50 MODERATE\
51..75 HIGH\
76..100 CRITICAL

## 12.4 Reasons

- Generar 1-3 razones ordenadas por contribución absoluta.

- Ejemplos: “5 reportes similares recientes”, “lluvia significativa prevista en 6 h”, “drenaje obstruido con severidad alta”.

- Nunca mostrar “se inundará” ni probabilidad no validada.

## 12.5 Unit tests obligatorios

- Todos los factores 0 =\> score 0 LOW.

- Todos 100 =\> score 100 CRITICAL.

- Boundary 25/26, 50/51, 75/76.

- Clamp de contextFactor y score.

- Determinismo: misma entrada produce mismo score/reasons.

- Falta clima =\> weatherFactor=0 y reason no menciona clima.

# 13. Integración meteorológica

## 13.1 Provider

interface WeatherProvider {\
getForecast(input:{lat:number; lng:number; now:Date}): Promise\<{\
precipitation1hMm:number;\
precipitation3hMm:number;\
precipitation6hMm:number;\
fetchedAt:string;\
source:string;\
}\>;\
}

## 13.2 Open-Meteo

- Enviar latitude/longitude y pedir hourly precipitation.

- Timezone: America/Santo_Domingo para interpretación de horas del producto; internamente persistir UTC.

- Calcular sums 1h/3h/6h a partir del primer forecast \>= now.

- Timeout 4 s; máximo 1 retry con jitter pequeño si el tiempo de hackathon lo permite.

- Cache por geocelda aproximada (~1 km) durante 10 min para evitar llamadas repetidas.

## 13.3 Fallback

- Si API falla: recuperar último snapshot \<= 60 min y set is_stale=true.

- Si no existe snapshot: valores 0 y source=unavailable; UI muestra “clima no disponible” y no inventa un estado.

- DEMO_MODE puede inyectar fixture de 30mm/6h con banner “SIMULACIÓN”.

# 14. Mapa y geoespacial

- Centro demo inicial: Gran Santo Domingo; no fijar dirección exacta del usuario como default persistido.

- MapLibre v6; cargar incidentes por bbox visible, no todo el dataset.

- Zoom bajo: clusters con conteo. Zoom alto: pins individuales.

- Pin incluye forma + icono + etiqueta de riesgo, no solo color.

- Popup público: categoría, nivel, “actualizado hace X”, estado, número de reportes agrupados. Sin foto original.

- Filtro: categoría, riesgo, estado activo. Botón “Mi ubicación” requiere acción del usuario.

- Hotspot P1: no implementar hasta P0 verde.

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Privacidad geográfica</strong></p>
<p>Para mapa público, redondear/perturbar coordenada de categorías sensibles si se incorporan en el futuro. En P0 las categorías son infraestructura/ambiente y no se publica identidad del reportante.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 15. Routing y Exposure Score

## 15.1 Candidate routes

- Solicitar OSRM route con alternatives=2 o el máximo disponible; geometries=geojson; overview=full.

- Si OSRM devuelve una sola ruta, mostrar una ruta y explicar que no se encontró alternativa.

- Validar que origin/destination estén dentro del área demo configurable; máximo 50 km entre puntos en P0.

## 15.2 Exposure calculation

For each active incident within 80m of route geometry:\
incidentContribution = riskScore \* distanceWeight \* verificationWeight\
\
Distance weight:\
0..20m = 1.0\
21..40m = 0.7\
41..80m = 0.4\
\
Verification weight:\
OPERATOR_VALIDATED = 1.0\
AI_ASSISTED = 0.8\
UNVERIFIED = 0.6\
\
routeExposureRaw = sum(contributions)\
exposureScore = min(100, round(routeExposureRaw / 2.5)) \# calibrated for demo\
\
Recommended route = lowest exposureScore, unless it is \>40% slower than fastest;\
if \>40% slower, label both and do not auto-recommend.

- Guardar parámetros en routing-v1 para reproducibilidad.

- Mostrar duración/distancia junto al exposure; no ocultar el trade-off.

- No usar “safe route”. Copy estándar: “Menor exposición a incidentes reportados”.

- Tests: incidente a 10m pesa más que a 70m; VALIDATED pesa más que UNVERIFIED; no incidentes =\> score 0; route \>40% slower no auto-recommend.

# 16. Estados y dashboard

Allowed transitions:\
REPORTED -\> NEEDS_REVIEW \| VALIDATED \| DISMISSED \| DUPLICATE\
NEEDS_REVIEW -\> VALIDATED \| DISMISSED \| DUPLICATE\
VALIDATED -\> ASSIGNED \| DISMISSED\
ASSIGNED -\> IN_PROGRESS \| VALIDATED\
IN_PROGRESS -\> RESOLVED \| ASSIGNED\
RESOLVED -\> (terminal in MVP)\
DISMISSED -\> (terminal)\
DUPLICATE -\> (terminal report/incident alias)

- Dashboard default sort: CRITICAL/HIGH first, risk_score desc, created_at asc dentro del mismo score.

- Cards muestran categoría, score, razones, recurrencia, edad del reporte y verificación.

- Operador puede corregir category/severity antes de VALIDATED; esa acción genera evento y recalcula risk.

- RESOLVED requiere resolución breve (10-280 chars) para demo/auditoría.

- No borrar incidentes desde UI del MVP.

Quién puede cambiar el estado (detalle en `05-notificaciones-y-suscripciones.md` §3.3):

| Actor | Autenticación | Transiciones |
|----|----|----|
| Operador | Sesión con rol | Todas las permitidas por la máquina de estados |
| Institución | API key o sesión institucional | VALIDATED, ASSIGNED, IN_PROGRESS, RESOLVED, DISMISSED, solo en su jurisdicción |
| Colaborador verificado | Token de correo, elevado por una institución | IN_PROGRESS, RESOLVED |
| Suscriptor | Token de un solo uso | Ninguna: solo atestigua (sigue_igual, empeoro, ya_no_esta) |

- `report_events` gana `actor_type` y `actor_id`: el historial dice quién hizo cada cambio, no solo qué cambió.

- Un suscriptor cualquiera no cierra incidentes porque el correo se reenvía; cerrar el ciclo exige institución o colaborador elevado.

# 17. Design system completo

## 17.1 Dirección visual

Estética pública, moderna y limpia: superficies blancas, morado profundo para estructura/acción, dorado para puntos de atención y estrellas. Las estrellas representan señales ciudadanas conectadas. No copiar el logotipo, estrella única, tonos exactos ni composición de un partido político.

| **Token CSS**   | **Valor** | **Uso permitido**                           |
|-----------------|-----------|---------------------------------------------|
| --pa-purple-900 | \#3B1558  | Top bar, hero, headings oscuros.            |
| --pa-purple-700 | \#532275  | Botón primario, focus, links.               |
| --pa-purple-500 | \#7542A6  | Hover, gráficos secundarios.                |
| --pa-gold-500   | \#F4C542  | Estrellas, highlights, chips con texto Ink. |
| --pa-gold-700   | \#8C5A00  | Texto dorado accesible sobre blanco.        |
| --pa-white      | \#FFFFFF  | Cards y surfaces.                           |
| --pa-canvas     | \#FAF8FC  | Background.                                 |
| --pa-ink        | \#24172D  | Texto principal.                            |
| --pa-muted      | \#625A68  | Texto secundario.                           |
| --pa-border     | \#E4DCEA  | Bordes.                                     |

## 17.2 Contraste validado

| **Combinación**     | **Ratio** | **Resultado**     |
|---------------------|-----------|-------------------|
| Blanco / Purple 900 | 14.64:1   | AAA texto normal. |
| Blanco / Purple 700 | 11.33:1   | AAA texto normal. |
| Blanco / Purple 500 | 6.80:1    | AA texto normal.  |
| Ink / Gold 500      | 10.45:1   | AAA.              |
| Gold 700 / Blanco   | 5.87:1    | AA.               |
| Muted / Blanco      | 6.60:1    | AA.               |

## 17.3 Riesgo

| **Nivel** | **Color** | **Representación adicional** |
|-----------|-----------|------------------------------|
| LOW       | \#2E7D32  | ✓ + “Bajo” + score.          |
| MODERATE  | \#8C6A00  | ● + “Moderado” + score.      |
| HIGH      | \#B45309  | ▲ + “Alto” + score.          |
| CRITICAL  | \#B42318  | ! + “Crítico” + score.       |

## 17.4 Tipografía y layout

- Font: Inter; fallback ui-sans-serif/system-ui.

- Base móvil: 16px; small 14px; h3 20px; h2 28px; h1 36-44px responsive.

- Max content width: 1200px; report form max 640px.

- Spacing: 4, 8, 12, 16, 24, 32, 48, 64.

- Cards radius 16px; inputs 12px; buttons 12px; shadows muy suaves.

- Touch targets mínimo 44x44px.

- Focus visible 3px Purple 500 + 2px offset.

## 17.5 Estrellas

- Usar 3-5 estrellas/sparks pequeñas conectadas por líneas finas como patrón de “señales”.

- Gold sobre morado o Purple sobre canvas.

- Decorativas: aria-hidden=true.

- No sustituir íconos funcionales por estrellas.

- No usar una gran estrella amarilla única en el centro del logo.

## 17.6 Componentes base

- Button: primary, secondary, ghost, danger.

- Input, Textarea, Select, FileDrop, LocationPermissionCard.

- RiskBadge, StatusBadge, CategoryIcon, ConfidenceBadge.

- IncidentCard, RiskReasons, WeatherBanner, MapLegend.

- Toast + inline error; Modal solo para confirmaciones destructivas/no reversibles.

- Skeleton para mapa/cards; EmptyState con próxima acción clara.

# 18. Pantallas y comportamiento

| **Pantalla** | **Especificación** |
|----|----|
| Home / | Hero “Reporta un punto. Anticipa el riesgo.” CTA Reportar + CTA Ver mapa. 3 pasos: Reporta → Analizamos → Priorizamos. Banner de seguridad: información complementaria, no alerta oficial. |
| Report /report | Paso 1 foto; paso 2 ubicación; paso 3 nota opcional. Progreso 1/3, 2/3, 3/3. Botón Enviar deshabilitado hasta requisitos. |
| Review /report/review | Preview local, coordenada aproximada/map mini, consentimiento de envío. Después de respuesta: categoría sugerida, riesgo y enlace al incidente. |
| Map /map | Mapa full-height, filtros bottom sheet móvil / sidebar desktop. Leyenda visible. Clusters. Botón ubicación. |
| Incident /incident/:id | Categoría, score/razones, estado, número de reportes, actualización; sin media pública. |
| Route /route | Origin/destination, mapa, alternativas cards; duración, distancia, exposure y disclaimer. |
| Dashboard /dashboard | Auth. KPI cards simples, cola de incidentes, filtro, sort fijo, mini mapa. |
| Admin Incident | Media privada con signed URL, IA vs operador, historial, acciones de estado, recalcular risk. |

## Estados UI obligatorios

- Loading

- Empty

- Error recoverable

- Offline/connection lost

- Permission denied

- Upstream stale

- Simulation mode

- Success

# 19. Validaciones

| **Campo/acción** | **Cliente** | **Servidor** |
|----|----|----|
| Imagen | Extensión/mime, \<=8MB, preview. | Revalidar mime real, bytes, dimensiones; reject executable/polyglot sospechoso. |
| Lat/Lng | Números y rangos. | Rangos + finite; crear geography server-side. |
| capturedAt | ISO válido. | No \>10 min futuro; no \>24h pasado para P0 citizen report. |
| Nota | Trim; \<=280. | Trim; \<=280; escapar salida, no HTML. |
| anonymousSessionId | UUID. | UUID v4/compatible; hash antes de persistir. |
| Status | UI solo opciones válidas. | Máquina de estados autoritativa. |
| Route points | Lat/lng. | Distancia máxima 50 km; ambos en región demo. |
| AI output | n/a | Zod enum/ranges/string lengths. |
| Weather | n/a | finite \>=0; timestamp coherente. |

## Mensajes de validación

- Específicos y accionables: “La imagen supera 8 MB” en lugar de “Error 400”.

- No borrar lo que el usuario escribió si una validación falla.

- Errores de ubicación incluyen botón “Intentar nuevamente”.

- Errores upstream no culpan al usuario; conservar el reporte si ya fue guardado.

# 20. Seguridad y privacidad

- WCAG 2.2 AA \[S4\], OWASP ASVS 5.0 \[S5\] y minimización alineada con Ley 172-13 \[S6\].

- CSP compatible con MapLibre; evitar unsafe-inline si es posible.

- CSRF: usar patrones de Next/SameSite y no crear endpoints mutables GET.

- Autorización server-side por role; ocultar botón no sustituye autorización.

- RLS habilitado antes de conceder acceso Data API.

- Signed URLs de media ≤5 min; jamás poner service role en browser.

- No loggear image bytes, API keys, session ids sin hash ni signed URLs.

- Headers: HSTS en prod, X-Content-Type-Options, Referrer-Policy, frame-ancestors en CSP.

- Rate limit P0 por anonymousSessionId hash: 5 reports/hora; admin 60 mutations/min. Si no se implementa infraestructura distribuida, documentar limitación.

- No ejecutar reconocimiento facial/OCR de placas; no enviar instrucciones de identificación al modelo.

- Retención propuesta P0 demo: limpiar media seed al finalizar; producto real requiere política formal y base jurídica.

# 21. Observabilidad y manejo de errores

- Cada request server genera requestId UUID y lo devuelve en errores.

- Logger JSON: timestamp, level, requestId, route, durationMs, provider, result; sin PII/media.

- Métricas mínimas en console/analytics: reports_created, ai_success/failure, weather_success/failure, route_success/failure, avg_processing_ms.

- Provider timeout se mapea a UPSTREAM_TIMEOUT y fallback cuando aplique.

- UI reporta “Clasificación pendiente de revisión” si IA falla, no “Reporte fallido” si el reporte ya quedó guardado.

- Health endpoint P1; para hackathon basta smoke check de DB y providers desde dashboard dev oculto.

# 22. Testing

## 22.1 Pirámide mínima

| **Tipo** | **Qué cubre** | **Gate** |
|----|----|----|
| Unit | RiskEngine, duplicate score, validation, state machine, exposure. | 100% de reglas críticas. |
| Integration | Route handlers + Supabase test schema/mocks + providers MSW. | Happy + failures principales. |
| Component | Forms, badges, filters, loading/error. | Comportamiento visible. |
| E2E | Citizen report, map, admin resolve, route compare. | 4 flows P0. |
| A11y | axe + keyboard + contrast manual. | 0 critical/serious en pantallas P0. |
| Performance | Lighthouse/manual y API timing demo. | Sin bloqueo obvio; budgets abajo. |

## 22.2 Unit tests exactos

- Risk: 0/100 y boundaries 25/26/50/51/75/76.

- Risk: weather unavailable no cambia score por datos inventados.

- State machine: cada transición permitida + todas las transiciones prohibidas desde terminales.

- Duplicate: 19m/20m/21m/59m/60m/61m; 2h59/3h01; 23h59/24h01; exact hash.

- Exposure: dist weights 20/21/40/41/80/81m; verification weights; 40% slower threshold.

- Validation: lat -90/90 accepted, -90.1/90.1 reject; lng boundaries; note 280/281; image 8MB/8MB+1.

## 22.2b Unit tests de notificaciones (P1)

- Filtro de alcance: zona dentro/fuera del radio, categoría incluida/excluida, `minLevel` límite exacto.

- Cruce de umbral: solo dispara hacia arriba; 75→76 dispara, 76→75 no.

- Antirruido: segundo evento de la misma zona dentro del `cooldown` se marca `descartado_antirruido`.

- Crítico ignora el `digest` y se envía inmediato.

- Doble opt-in: sin verificar no se envía nada; token expirado no activa.

- Permisos: suscriptor no puede cambiar estado (403); institución fuera de jurisdicción (403).

- Webhook: firma inválida se rechaza; timestamp de más de 5 min se rechaza; el mismo `delivery_id` no duplica efectos.

## 22.3 Integration tests

- POST report success with MockVision + MockWeather creates report, incident, risk snapshot and event.

- AI timeout still returns 201 with NEEDS_REVIEW.

- Weather timeout still returns 201 and marks weather unavailable/stale.

- Duplicate attaches second report to existing incident.

- Unauthorized status update 401/403; invalid transition 409.

- Public incidents API does not expose media path/session/internal metadata.

- Routing upstream NoRoute maps to safe 422/503 response and UI handles it.

## 22.4 E2E scenarios

**1.** Citizen: open report → upload fixture blocked-drain.jpg → allow/mock location → submit → sees category/risk → incident appears on map.

**2.** Duplicate: submit second nearby fixture → incident report count increases instead of duplicate pin.

**3.** Operator: sign in → open high-risk incident → validate → assign → in progress → resolve; audit timeline visible.

**4.** Route: choose fixture origin/destination → see 2 alternatives → lower exposure route labeled appropriately with disclaimer.

## 22.5 Accessibility checks

- Tab through every interactive element.

- Visible focus never clipped.

- Map has textual alternative/list of incidents.

- Risk is icon + text + number, not color only.

- Form labels programmatically associated.

- Errors announced with aria-live where appropriate.

- Zoom browser 200% no loss of function.

- Touch targets \>=44px.

## 22.6 Performance budgets de hackathon

- Home/report JS should remain lean; lazy-load map library on map screens.

- P95 server response excluding AI \<800ms for internal CRUD.

- AI/report total target \<15s; show progress after 1s.

- Map first meaningful render target \<3s on normal broadband demo.

- Image client compression P1; P0 enforce \<=8MB.

# 23. Datos seed y escenarios de demo

| **Fixture** | **Escenario** |
|----|----|
| INC-001 | BLOCKED_DRAIN, Av. México (vía principal). 6 reportes en 180 días, 3 en los últimos 14, severidad máxima abierta 9, contexto 70. **64 HIGH en seco → 84 CRITICAL con 38 mm/6h.** Ver la nota sobre el techo del factor meteorológico más abajo. |
| INC-002 | TRASH, severity 60, 2 reports, forecast 3mm/6h → MODERATE/HIGH según formula. |
| INC-003 | FLOOD_WATER, severity 90, operator validated → CRITICAL. |
| INC-004 | BLOCKED_ROAD, severity 70, unverified → HIGH. |
| INC-005 | Resolved recurring blocked drain, histórico para factor. |
| ROUTE-A | Fast route passes within 20m of INC-001 and INC-003. |
| ROUTE-B | +15-25% duration, avoids critical incidents. |

- Seed usa coordenadas de demo no vinculadas a personas específicas.

- Agregar 10-20 incidentes totales para clusters y filtros.

- MockVision debe reconocer fixtures por filename/hash para resultados deterministas.

- MockWeather tiene NORMAL y HEAVY_RAIN. El banner debe decir SIMULACIÓN cuando se usa HEAVY_RAIN manual.

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>El techo del factor meteorológico (corrección del modelo)</strong></p>
<p>Con los pesos del §12.1, el factor de lluvia aporta como máximo 20 puntos al score (23 contando la bandera de alerta manual). Cruzar de MODERATE (≤50) a CRITICAL (≥76) exige 26. Por construcción, <strong>la lluvia no puede llevar una zona de moderado a crítico</strong>: solo puede detonar una vulnerabilidad que ya está acumulada en severidad, recurrencia, historial y contexto.</p>
<p>Los fixtures y el guion de demo se calibran sobre esa restricción, no contra ella. Un ejemplo que mostrara 46 → 84 exigiría acoplar factores entre sí sin una razón de dominio, y eso sería una fórmula calibrada para la demo.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 24. Implementación por fases — step by step

## Fase 0 — Freeze + bootstrap

*Objetivo: repo reproducible y decisiones cerradas.*

### Pasos

**1.** Crear repo y README con scope P0/P1/P2.

**2.** Instalar Node 24 LTS y pnpm/npm; fijar packageManager y lockfile.

**3.** Crear Next.js 16.3.3 TypeScript App Router.

**4.** Configurar ESLint, Prettier, tsconfig strict, scripts typecheck/lint/test.

**5.** Crear .env.example + lib/env.ts.

**6.** Crear docs/implementation-status.md.

### Definition of Done

- npm run build PASS

- npm run typecheck PASS

- npm run lint PASS

- Home placeholder visible.

## Fase 1 — Design system + shell

*Objetivo: UI base consistente antes de features.*

### Pasos

**1.** Crear CSS tokens exactos de sección 17.

**2.** Configurar Inter/system font.

**3.** Crear Button/Input/Textarea/Badge/Card/Skeleton/Toast.

**4.** Crear AppHeader con constelación decorativa y footer/disclaimer.

**5.** Crear páginas vacías/rutas P0.

**6.** Agregar axe smoke para home/report.

### Definition of Done

- Contrastes coinciden con tabla

- Keyboard focus visible

- Mobile 375px y desktop 1440px sin overflow.

## Fase 2 — Supabase + schema

*Objetivo: persistencia, auth admin y storage privado.*

### Pasos

**1.** Crear Supabase project/dev.

**2.** Enable PostGIS en schema recomendado.

**3.** Escribir migration de tablas/enums/constraints/indexes.

**4.** Crear RLS policies y bucket report-media privado.

**5.** Implementar clients server/browser separados.

**6.** Crear admin demo user y profile OPERATOR.

**7.** Ejecutar seed mínimo.

### Definition of Done

- Migration limpia desde cero

- RLS tests básicos

- Anon no puede leer media/table privadas directamente.

## Fase 3 — Citizen report intake

*Objetivo: reporte guardado aun sin IA.*

### Pasos

**1.** Construir /report 3 pasos.

**2.** Implementar permission flow GPS.

**3.** Preview de foto + validations cliente.

**4.** POST /api/reports server validation.

**5.** Guardar media, report, incident provisional.

**6.** Success confirmation.

### Definition of Done

- Validación 8MB/mime/rangos

- 201 crea entidades

- Error mantiene input cuando sea posible.

## Fase 4 — Vision AI

*Objetivo: clasificación real desacoplada.*

### Pasos

**1.** Crear VisionProvider interface + MockVisionProvider.

**2.** Crear OpenAI provider con Responses API + Structured Output.

**3.** Definir schema vision-v1.

**4.** Integrar timeout/fallback NEEDS_REVIEW.

**5.** Persistir ai_analyses.

**6.** Permitir operator correction posteriormente.

### Definition of Done

- Provider contract tests

- Invalid JSON rejected

- Timeout no pierde report.

## Fase 5 — Duplicate + Risk

*Objetivo: convertir reportes en incidentes inteligentes.*

### Pasos

**1.** Implementar PostGIS candidate query.

**2.** Implementar pure duplicate scoring.

**3.** Attach report o create incident según thresholds.

**4.** Implementar RiskEngine risk-v1.

**5.** Persistir snapshot/factors/reasons.

**6.** Crear unit tests de boundaries.

### Definition of Done

- Todos los boundary tests PASS

- Segundo reporte demo agrupa correctamente

- Score explicable visible.

## Fase 6 — Weather

*Objetivo: risk dinámico por clima.*

### Pasos

**1.** Crear WeatherProvider + mock.

**2.** Open-Meteo adapter.

**3.** Calcular 1h/3h/6h sums.

**4.** Cache 10 min por celda.

**5.** Fallback stale/unavailable.

**6.** Botón DEMO heavy rain solo si DEMO_MODE.

**7.** Recalcular risk al cambiar snapshot.

### Definition of Done

- API failure no rompe report

- SIMULACIÓN claramente marcada

- Risk cambia de forma determinista.

## Fase 7 — Public map

*Objetivo: visualizar incidentes y riesgo.*

### Pasos

**1.** Instalar/configurar MapLibre.

**2.** GET incidents por bbox.

**3.** GeoJSON source + clusters + pins.

**4.** Filtros category/risk.

**5.** Popup sin media/PII.

**6.** Incident detail.

**7.** Textual incident list para accesibilidad.

### Definition of Done

- No data leak

- Map responsive

- Filter tests

- Keyboard access a lista equivalente.

## Fase 8 — Dashboard operator

*Objetivo: workflow operacional.*

### Pasos

**1.** Auth guard dashboard.

**2.** Priority queue sort.

**3.** Incident detail con signed media.

**4.** Correct category/severity.

**5.** State transition endpoint.

**6.** Audit timeline.

**7.** Resolve reason.

### Definition of Done

- Unauthorized blocked

- Invalid transition 409

- Resolve creates event/resolved_at.

## Fase 9 — Routing

*Objetivo: demostrar reutilización de reportes para movilidad.*

### Pasos

**1.** RoutingProvider OSRM + mock.

**2.** Route compare endpoint.

**3.** Turf buffer/distance to route.

**4.** Exposure routing-v1.

**5.** Route page cards/map.

**6.** Disclaimer obligatorio.

### Definition of Done

- Exposure boundary tests

- NoRoute handled

- Nunca usa copy “ruta segura”.

## Fase 10 — Hardening + test pass

*Objetivo: cero sorpresas en demo.*

### Pasos

**1.** Integration suite completa.

**2.** 4 E2E flows.

**3.** axe scan.

**4.** Manual 375/768/1440.

**5.** Failure drills: AI down, weather down, OSRM no route.

**6.** Security review env/RLS/logs.

**7.** Build production.

### Definition of Done

- All gates green

- No critical/serious a11y

- No secrets in bundle/log.

## Fase 11 — Demo + deploy

*Objetivo: demo reproducible en un click.*

### Pasos

**1.** Deploy Vercel.

**2.** Run migrations/seed prod demo.

**3.** Set env secrets.

**4.** Smoke test deployed URL.

**5.** Rehearse 3-minute demo.

**6.** Create fallback screenshots/video only if allowed by hackathon.

**7.** Freeze code 1-2h before judging except critical fixes.

### Definition of Done

- Demo flow repeated 3x

- Mock mode available

- README contains recovery steps.

# 25. CI/CD y despliegue

Required scripts:\
npm run dev\
npm run lint\
npm run typecheck\
npm run test\
npm run test:integration\
npm run test:e2e\
npm run build\
\
CI on pull request:\
install --frozen-lockfile\
lint\
typecheck\
unit tests\
build\
\
Pre-demo/full:\
integration\
e2e\
accessibility smoke

- Vercel preview por PR si el tiempo lo permite.

- Production deployment solo desde main/tag demo-ready.

- Supabase migrations versionadas; no cambios manuales no reproducibles salvo creación inicial del proyecto/secretos.

- README debe incluir “from zero to running” en \<=15 min para un desarrollador con credenciales.

# 26. Demo y checklist final

## Demo principal — 3 minutos

**1. El punto ya está en riesgo alto (40 s).** Abrir `/` con el escenario *Sin lluvia*. La zona de la
Av. México marca **64/100 — Alto**. Mostrar el desglose de los cinco factores: severidad observada
9/10, tres reportes en los últimos 14 días, seis en 180 días, contexto con drenaje obstruido, agua
acumulada y vía principal. *La zona ya requiere atención antes de que llueva.*

**2. Cambia el contexto, no los datos (40 s).** Cambiar a *Lluvia intensa*. La misma zona pasa a
**84/100 — Crítico**. Señalar que ningún reporte cambió: el único factor que se movió es el
meteorológico, y aporta exactamente 20 puntos.

> "No apareció un problema nuevo. Cambió el contexto. PuntoAlerta RD identifica cuándo una
> vulnerabilidad existente necesita convertirse en prioridad inmediata."

**3. Reportar (40 s).** En `/reportar`, enviar una foto de un imbornal tapado. La IA propone
*drenaje obstruido* con su confianza; se puede corregir con un toque; el riesgo de la zona se
recalcula al instante y queda un snapshot inmutable.

**4. Priorizar (30 s).** En `/dashboard`, la zona crítica encabeza la cola. Avanzar un estado y
mostrar el historial de auditoría.

**5. Rutas (30 s).** En `/rutas`, escenario de la demo: la ruta directa cruza la zona crítica a 4 m
del trazado; la alternativa llega con **+2 min y exposición 0**.

- Si alguien pregunta "¿por qué pasó de 64 a 84?", el desglose de factores responde con el número
  exacto que aportó cada uno. Ese desglose es parte de la demo, no un detalle técnico.

- No decir "estaba tranquilo y se volvió crítico". La narrativa correcta es "ya requería atención y
  el clima lo convirtió en prioridad inmediata".

## Checklist 30 min antes

- Vercel URL abre en incógnito.

- Admin demo login funciona.

- Supabase activo.

- OpenAI quota/API key funciona; MockVision listo.

- Open-Meteo funciona; MockWeather listo.

- OSRM funciona; fixture routes/mock listo.

- Seed reset ejecutado.

- No banners de error dev.

- Browser zoom 100%; pantalla demo cargada.

- No mostrar secretos/console.

# 27. Backlog P1/P2

| **Prioridad** | **Feature** | **Condición para iniciar** |
|----|----|----|
| P1 | Video 10-15s | P0 estable; validar tamaño/privacidad/costo. |
| P1 | Notificaciones de cambio de riesgo | Modelo de consentimiento definido. |
| P1 | Ruta multi-stop de brigada | Dashboard y routing P0 estables. |
| P1 | Blur de rostros/placas | Proveedor/algoritmo validado; conservar original privado. |
| P2 | Integración con organismos | Acuerdos/API oficiales. |
| P2 | Modelos predictivos | Dataset histórico y ground truth suficiente. |
| P2 | Cobertura nacional | Gobernanza, escalabilidad y multi-jurisdicción. |

# 28. Definition of Done global

- Un usuario puede crear un reporte P0 desde móvil sin cuenta.

- El reporte nunca se pierde porque falle IA o clima; entra fallback visible.

- IA devuelve schema validado y no intenta identificar personas/placas.

- Duplicados demo se agrupan como fue definido.

- Risk Score es reproducible, versionado y muestra razones.

- El clima puede modificar risk y el modo simulación está claramente marcado.

- Mapa público no filtra media ni identificadores del reportante.

- Dashboard exige rol y aplica state machine.

- Routing compara exposición sin afirmar seguridad.

- Unit + integration + E2E + accessibility gates definidos están verdes.

- No existen secretos en repositorio, browser bundle o logs.

- UI cumple la paleta/tokens y no replica una identidad política.

- README permite levantar el proyecto y ejecutar seed/tests.

- Demo desplegado se ejecuta tres veces seguidas sin intervención manual fuera del guion.

# Referencias validadas

**\[S1\] Ministerio de Medio Ambiente y Recursos Naturales —** Línea Verde RD: aplicación para denuncias ambientales; admite fotos y videos y permite seguimiento. Publicado 27 abril 2024.

**\[S2\] Presidencia de la República Dominicana —** Saneamiento de cañadas e inversión en drenaje pluvial; 50 de 75 puntos críticos reforzados; piloto de semáforos pluviales e integración con videovigilancia 9-1-1. Publicado 27 octubre 2025.

**\[S3\] Portal de Datos Abiertos / INDOMET —** Acumulados de precipitación 2018-2025; última actualización reportada 19 enero 2026.

**\[S4\] W3C —** WCAG 2.2 y criterio 1.4.3: contraste mínimo 4.5:1 para texto normal y 3:1 para texto grande.

**\[S5\] OWASP —** Application Security Verification Standard (ASVS) 5.0.0 como base de verificación de seguridad de aplicaciones.

**\[S6\] INDOTEL —** Ley 172-13 sobre protección integral de datos personales en República Dominicana.

**\[S7\] Ministerio de Medio Ambiente —** Ley 64-00 y marco legal ambiental; Ley 225-20 y su reglamento sobre gestión de residuos sólidos.

**\[S8\] Open-Meteo —** API de pronóstico con coordenadas y variables horarias, incluida precipitación.

**\[S9\] Project OSRM —** Servicios Route, Table, Nearest y Trip para rutas y matrices de tiempo/distancia sobre OpenStreetMap.

**\[S10\] Supabase —** PostGIS disponible para consultas geoespaciales e indexación; RLS recomendado para acceso a datos.

**\[S11\] Next.js / Node.js —** Al 27 agosto 2026: Next.js 16.3.3 Active LTS y Node.js 24.20.0 LTS.

**\[S12\] MapLibre —** MapLibre GL JS v6 como librería TypeScript/ESM para mapas interactivos.

**\[S13\] OpenAI Platform —** GPT-5.6 Luna disponible en la API de OpenAI; admite imagen como entrada y Structured Outputs en Responses API.
