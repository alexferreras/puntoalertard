# Auditoría del MVP frente a los estándares

Contraste del código en `puntoalertard/` contra `01-estandares-plataforma.md` y
`02-mvp-implementacion-step-by-step.md`. Este fichero es el backlog vivo: se actualiza en cada
iteración.

Estado: `[ ]` pendiente · `[~]` en curso · `[x]` cerrado y verificado

## P0 — bloquean la Definition of Done (§28)

> **Estado al 2026-08-28: las 13 brechas P0 y las 17 P1 del MVP están cerradas.** Lo único
> pendiente es infraestructura de test/despliegue (E2E con Playwright, CI/CD) y los cuatro ítems
> P2 que el propio doc sitúa fuera del hackathon.
>
> Verificación de cierre ejecutada sobre una base recreada desde cero: los cinco flujos de la demo
> pasan, `npm run verify` (lint + tsc + 201 tests + build + comprobación de secretos en el bundle)
> queda en verde.


- [x] **Identidad**: nombre PuntoAlerta RD y logo oficial integrados (topbar, favicon, PWA).
- [x] **PWA** (§2): `manifest.webmanifest` + iconos 192/512/maskable + apple-touch-icon.
- [x] **Mapa público no debe filtrar media ni ubicación exacta** (§8, §11, §28): `GET /api/incidents`
      devolvía `photoPath` y coordenadas exactas. Ahora existe una proyección pública que elimina
      la ruta de evidencia y redondea la coordenada a ~11 m.
- [x] **Risk Engine según la fórmula versionada** (§12.1-12.4): factores `severity`, `recurrence`,
      `weather`, `history`, `context` con los escalones exactos de §12.2, `formulaVersion` en la
      respuesta y 1-3 razones ordenadas por contribución.
- [x] **Clima 1h/3h/6h + fallback honesto** (§13): faltaban 1h/3h, el cache por geocelda (10 min) y
      el "último snapshot ≤60 min con `isStale`". El fallback inventaba 6 mm; el doc exige
      `source=unavailable` con ceros y aviso en UI.
- [x] **Snapshot de riesgo inmutable** (§10, §28): persistir score + factores + clima usados para
      que el score sea reproducible y auditable.
- [x] **Máquina de estados completa** (§10, §16): faltaban `en_revision`, `asignado`, `descartado`,
      `duplicado`, el bloqueo desde estados terminales y las dos reasignaciones hacia atrás que el
      doc sí permite (`asignado → validado`, `en_proceso → asignado`). La regla anterior de "el
      estado solo avanza" era incorrecta. `en_revision` se asigna automáticamente cuando la IA
      falla o duda (confianza < 0.6), según §6 del doc 01 y §22.3.
- [x] **Detección de duplicados con score** (§11): hash sha256 de media, escalones 20/60 m y
      3/24 h, categorías compatibles, `attach` automático ≥80 y `posible_duplicado` 50-79.
- [x] **Exposure Score según §15.2**: incidentes a ≤80 m, pesos por distancia (1.0/0.7/0.4) y por
      verificación (1.0/0.8/0.6), `min(100, raw/2.5)`, y no auto-recomendar si es >40% más lenta.
- [x] **Categoría `otro`** (§2): faltaba en el enum de categorías P0.
- [x] **`lib/env.ts` con Zod** (§6): validar variables al arranque y fallar si falta un secreto del
      provider activo.
- [x] **Rol para el dashboard** (§8, §28): `PATCH /api/incidents/:id` y el dashboard exigen sesión
      de operador (401/403 sin ella).
- [x] **Tests** (§22): unit de riesgo (0/100 y bordes 25/26/50/51/75/76), máquina de estados,
      duplicados (19/20/21 m, 59/60/61 m, 2h59/3h01, 23h59/24h01), exposure (20/21/40/41/80/81 m,
      pesos de verificación, umbral 40%) y validaciones (lat/lng, nota 280/281, imagen 8MB±1).

## P1 — si P0 está verde

- [x] Estados UI `offline` y `upstream stale` explícitos (§18).
- [x] Alternativa textual del mapa: lista de incidentes navegable por teclado (§22.5).
- [x] Etiqueta literal "Nivel de riesgo/prioridad según señales disponibles" (§7 doc 01).
- [x] `RESOLVED` exige nota de resolución de 10-280 caracteres (§16).
- [x] Operador puede corregir categoría y severidad antes de validar (§16).
- [x] Validación de `capturedAt`: no más de 10 min en el futuro ni 24 h en el pasado (§19).
- [x] Clusters en el mapa (§18).
- [x] `anonymousSessionId` hasheado antes de persistir (§8, §19).
- [ ] Integration tests con MSW y E2E Playwright de los 4 flujos P0 (§22.3, §22.4).
- [ ] CI/CD y despliegue (§25).

## P1 — Notificaciones y suscripciones

Capacidad especificada en `05-notificaciones-y-suscripciones.md`. **Los 11 ítems del bloque están
cerrados** (2026-08-28); lo que queda es P2: envío real de correo, auto-registro institucional,
colaboradores verificados y cifrado en reposo.

- [x] Modelo de datos: `subscribers`, `subscriptions`, `institutions`, `institution_members`,
      `notification_deliveries`, y `actor_type`/`actor_id` en `report_events`.
- [x] `EmailProvider` con implementación `mock` que escribe en `notification_deliveries`.
- [x] Bandeja simulada en `/dashboard/notificaciones` para demostrar el ciclo sin SMTP.
- [x] `POST /api/subscriptions` con doble opt-in y respuesta ciega (`202` siempre).
- [x] Gestión por token: ver, pausar/reactivar y darse de baja en un clic.
- [x] **Interfaz de suscripción** (`/suscripciones`): alta con elección de zonas en el mapa o radio,
      confirmación del doble opt-in y gestión con el token del correo. Faltaba: el motor y la API
      estaban completos, pero **nadie podía suscribirse desde la aplicación**.
- [x] Motor de eventos: `cambio_nivel` solo hacia arriba, `preventivo` con lluvia prevista,
      antirruido por zona (6 h) y tope diario (10).
- [x] Webhook institucional firmado con HMAC + idempotencia por `delivery_id` + reintentos.
- [x] `PATCH /api/institutional/incidents/:id` con validación de jurisdicción (403 fuera).
- [x] Seed de dos instituciones (Ayuntamiento del DN y Ministerio de Medio Ambiente).
- [x] Estado `derivado` y enrutamiento institucional automático (RF-20).
- [x] Atestaciones (`sigue_igual`, `empeoro`, `ya_no_esta`) visibles en el historial.

## P2 — Notificaciones (fuera del hackathon)

- [ ] Envío real de correo (Resend o SES), dominio verificado y entregabilidad.
- [ ] Auto-registro institucional con verificación de identidad.
- [ ] Colaboradores verificados elevados por una institución.
- [ ] Cifrado en reposo del correo y borrado automático a los 24 meses.

## Definition of Done global (§28) — verificada el 2026-08-28

| Criterio | Estado |
|---|---|
| Reporte P0 desde móvil sin cuenta | ✅ |
| El reporte no se pierde si falla IA o clima; fallback visible | ✅ degradación a `mock-v1-fallback` y `source=unavailable` |
| IA con schema validado; no identifica personas ni placas | ✅ zod + invariantes del prompt |
| Duplicados demo se agrupan como fue definido | ✅ score con escalones del §11 |
| Risk Score reproducible, versionado y con razones | ✅ `risk-v1` + snapshots inmutables |
| El clima modifica el riesgo y la simulación está marcada | ✅ 64 → 84 con banner de SIMULACIÓN |
| El mapa público no filtra media ni identificadores | ✅ `lib/public.ts`, comprobado campo por campo |
| El dashboard exige rol y aplica la máquina de estados | ✅ sesión firmada + grafo del §16 |
| Routing compara exposición sin afirmar seguridad | ✅ §15.2 + terminología obligatoria |
| Gates de test verdes | ⚠️ 201 unit verdes; integración y E2E pendientes |
| Sin secretos en repo, bundle del navegador ni logs | ✅ `npm run check:secrets`, guard permanente |
| Paleta y tokens propios, sin identidad política | ✅ §17 + logo propio |
| README permite levantar, sembrar y testear | ✅ |
| La demo corre sin intervención manual | ✅ ejecutada desde base recreada |

## Corrección del modelo de riesgo (cerrada)

**Validación matemática de la especificación.** El ejemplo del §19 de la spec de producto pedía que
una zona pasara de **46 moderado a 84 crítico** al cambiar el pronóstico: 38 puntos aportados por la
lluvia. Con los pesos normalizados del §12.1, el factor meteorológico aporta **20 puntos como
máximo** (23 contando la bandera de alerta manual, que pesa 0.10 × 30). Cruzar de ≤50 a ≥76 exige
26. No existe combinación de datos que produzca ese ejemplo.

**Resolución.** Se implementó la fórmula del §12.2 sin modificarla y se corrigió el ejemplo, no la
fórmula. La zona de la Av. México da **64 alto en seco → 84 crítico con 38 mm/6 h**, y el guion de
demo se reescribió en consecuencia (§26 del doc de implementación).

**Por qué esta es la lectura correcta del dominio, y no una concesión a la demo:**

- El modelo dice algo defendible: la lluvia no crea el riesgo, **activa o intensifica una
  vulnerabilidad que ya existe**. Un punto sin severidad, recurrencia ni historial no se vuelve
  crítico porque cambie el pronóstico. Hay un test que lo fija.
- Acoplar factores entre sí (por ejemplo multiplicar drenaje obstruido por lluvia) solo para llegar
  a 46 → 84 sería una fórmula calibrada para la demo. Se descartó por eso, no por dificultad: se
  reconsideraría únicamente con una razón de dominio documentada para ese acoplamiento.
- Se conservan intactas las tres propiedades que hacen útil el score: fórmula documentada y
  versionada, explicabilidad factor por factor, y consistencia entre implementación y pruebas.
- La narrativa correcta es "ya requiere atención → el clima lo convierte en crítico", no "no
  importaba → llovió → emergencia". 64 es Alto: presentarlo como una zona tranquila sería
  incorrecto.

**Nota:** la spec de producto original (`RadarRD — Plataforma Inteligente de Riesgo Urbano`, fuera
del repositorio) sigue conteniendo el ejemplo 46 → 84 en su §19. Los documentos del repositorio son
los vigentes.

## Desviaciones conscientes del stack (§3) — decisión del usuario

El MVP funciona y está verificado; cambiar cualquiera de estos puntos es una reescritura, no un
arreglo. Se documentan para que la decisión sea explícita:

| Doc | Implementación | Motivo |
|---|---|---|
| Supabase (PostgreSQL + PostGIS + Auth + Storage) | SQLite (`better-sqlite3`) + ficheros locales | Cero infraestructura para el hackathon. La geometría se resuelve con haversine + bounding box. Migrar es reemplazar `lib/db.ts`. |
| MapLibre GL JS v6 | Leaflet 1.9 + react-leaflet 5 | Ya integrado y verificado en navegador. |
| OpenAI Responses API (`gpt-5.6-luna`) | Claude (`claude-opus-5`) con Structured Outputs | El entorno tiene credenciales de Anthropic; el contrato `VisionProvider` es el mismo. |
| Vitest + Playwright + axe | **Vitest** (unit, 60 casos) | Vitest instalado desde el registry público: la desviación quedó cerrada. Playwright (E2E) y axe (a11y) siguen pendientes como P1. |
| Enums en inglés (`TRASH`, `BLOCKED_DRAIN`, `REPORTED`…) | Enums en español (`basura`, `drenaje_obstruido`, `reportado`…) | El producto y la UI son en español; el mapeo es 1:1. |
