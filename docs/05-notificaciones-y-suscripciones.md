# Notificaciones, suscripciones e integración institucional

Especificación de dos capacidades que los documentos anteriores solo mencionaban como "P1 —
Notificaciones", sin diseño:

- **A. Suscripciones por correo** — una persona se registra y decide de qué zonas quiere recibir
  avisos, y puede activarlos o desactivarlos cuando quiera.
- **B. Integración institucional** — un ayuntamiento, ministerio o brigada se registra (o se
  integra por API) para recibir los avisos de su jurisdicción y **cambiar el estado** de los
  incidentes.

**Ninguna de las dos es P0 del hackathon.** La sección §5 define qué parte se puede demostrar con un
mock sin montar infraestructura de correo.

---

## 1. Por qué existe esta capacidad

El valor del producto no es el mapa: es que *alguien que puede actuar* se entere a tiempo. Hoy la
plataforma calcula que un imbornal está en 84 🔴 antes de una lluvia, pero **nadie recibe ese
número**: hay que entrar a mirarlo. Las notificaciones cierran el ciclo:

```
reporte → clasificación → riesgo → AVISO A QUIEN PUEDE ACTUAR → cambio de estado → historial
```

Sin ese paso, el modo preventivo del §8 del doc de estándares es una pantalla, no una operación.

---

## 2. Parte A — Suscripciones por correo

### 2.1 Quién se suscribe

| Perfil | Qué quiere | Alcance típico |
|---|---|---|
| Vecino / junta de vecinos | Saber qué pasa en su sector y si lo atendieron | 1-3 zonas |
| Técnico de ministerio o ayuntamiento | Vigilar puntos críticos de su área | Zonas o toda la demarcación |
| Brigada de campo | Saber a dónde ir mañana | Zonas asignadas |
| Periodista / investigador | Seguir la evolución de un tema | Toda el área, por categoría |
| Voluntario | Ayudar donde haga falta | Toda el área, solo nivel alto/crítico |

### 2.2 Qué se puede configurar

Una suscripción es una combinación de filtros. Todos son opcionales salvo el correo:

| Campo | Valores | Por defecto |
|---|---|---|
| `scope` | `todas` \| `zonas` \| `radio` | `todas` |
| `zoneKeys` | Lista de zonas elegidas en el mapa | — |
| `center` + `radiusMeters` | Punto y radio (500 m - 5 km) | — |
| `categories` | Subconjunto de las 6 categorías | todas |
| `minLevel` | `bajo` \| `moderado` \| `alto` \| `critico` | `alto` |
| `events` | `nuevo_reporte`, `cambio_nivel`, `cambio_estado`, `resuelto`, `preventivo` | `cambio_nivel`, `preventivo` |
| `digest` | `inmediato` \| `diario` \| `semanal` | `diario`, salvo crítico |
| `active` | `true` \| `false` | `true` |

**`minLevel: alto` por defecto es deliberado.** Una suscripción que avisa de todo se silencia en dos
días. El valor por defecto tiene que ser útil, no exhaustivo.

**Crítico siempre es inmediato.** Un `digest: semanal` no retiene un aviso de nivel crítico: se
envía al momento y se excluye del resumen para no duplicarlo.

### 2.3 Ciclo de vida de una suscripción

```
  POST /api/subscriptions
          │
          ▼
   pendiente_verificacion ──(no confirma en 72 h)──→ descartada (borrado)
          │
          │ clic en el enlace del correo de confirmación
          ▼
        activa ⇄ pausada          (el propio suscriptor, sin perder su configuración)
          │
          │ clic en "darme de baja" / DELETE
          ▼
       eliminada (borrado físico, no borrado lógico)
```

**Doble opt-in obligatorio.** Sin confirmación no se envía ni un aviso. Evita que alguien suscriba
el correo de otra persona y es exigible bajo la Ley 172-13.

**Pausar ≠ darse de baja.** Pausar conserva la configuración (útil en temporada seca o de
vacaciones); la baja borra el registro.

**Enlace de baja en todos los correos**, en un solo clic, sin pedir contraseña ni justificación.

### 2.4 Qué disparan los avisos

| Evento | Cuándo se dispara | Ejemplo de asunto |
|---|---|---|
| `nuevo_reporte` | Se crea un reporte en el alcance | `Nuevo reporte de drenaje obstruido en San Miguel` |
| `cambio_nivel` | La zona cruza un umbral hacia arriba | `San Miguel pasó a riesgo CRÍTICO (84/100)` |
| `preventivo` | Lluvia prevista + zona en alto o crítico | `Lluvia intensa prevista: 2 puntos críticos en tu zona` |
| `cambio_estado` | El incidente avanza de estado | `El reporte de la Av. México está en proceso` |
| `resuelto` | El incidente se marca resuelto | `Resuelto: imbornal de la Av. México` |

**Solo se avisa de cruces hacia arriba.** Que una zona baje de crítico a alto es una buena noticia,
no una urgencia: va en el resumen.

**Antirruido:** máximo 1 correo inmediato por zona cada 6 h (los cambios se agrupan), máximo 10
correos al día por suscriptor, y nunca dos avisos por el mismo cruce de umbral.

### 2.5 Qué contiene el correo

Incluye: categoría, nivel y score con sus razones, **zona aproximada** (~11 m, la misma proyección
pública del mapa), fecha, estado actual y enlace a la ficha pública.

**No incluye, nunca:** la foto adjunta, la ruta de la evidencia, la coordenada exacta, ni nada del
reportante. Si el destinatario tiene permiso para ver la evidencia, el correo lleva un enlace con
token de corta duración, no la imagen.

### 2.6 Privacidad y datos personales

El correo electrónico es un dato personal y hasta ahora la plataforma no guardaba **ninguno**. Esta
capacidad introduce el primer dato personal del sistema, así que:

- **Solo el correo.** Nada de nombre, teléfono, cédula ni institución obligatoria.
- **Consentimiento explícito** en el formulario, con enlace a la finalidad del tratamiento.
- **Doble opt-in** como prueba del consentimiento, con fecha e IP de confirmación.
- **Cifrado en reposo** y **hash del correo en los logs** — el correo en claro nunca aparece en un
  log ni en un mensaje de error.
- **Retención:** 24 meses sin actividad → aviso y borrado automático.
- **Respuestas ciegas:** `POST /api/subscriptions` devuelve siempre `202`, exista o no el correo.
  Confirmar si una dirección está registrada convierte el endpoint en un oráculo de correos.
- **Derecho de acceso y borrado** desde el enlace del propio correo, sin cuenta ni contraseña.

---

## 3. Parte B — Integración institucional

### 3.1 Registro

**No hay auto-registro.** Una institución no puede darse de alta sola y empezar a cambiar estados:
la da de alta un administrador de la plataforma tras verificar quién es. Es la diferencia entre una
señal ciudadana y un acto administrativo.

Al registrarla se define:

| Campo | Qué es |
|---|---|
| `name`, `type` | `ayuntamiento` \| `ministerio` \| `brigada` \| `ong` \| `otro` |
| `jurisdiction` | Zonas, polígono o radio donde puede actuar |
| `categories` | Categorías de las que se hace cargo |
| `channels` | `webhook`, `email`, `polling` (combinables) |
| `apiKeyHash` | Credencial de servidor a servidor; se muestra una sola vez |
| `webhookSecret` | Secreto para firmar los envíos (HMAC-SHA256) |
| `active` | Se puede desactivar sin borrar el historial |

### 3.2 Cómo recibe los avisos

**Webhook (recomendado).** `POST` al endpoint de la institución con el incidente en el cuerpo:

- Cabeceras `X-PuntoAlerta-Signature` (HMAC-SHA256 del cuerpo), `X-PuntoAlerta-Delivery` (UUID
  único) y `X-PuntoAlerta-Timestamp`.
- La institución debe verificar la firma y rechazar timestamps de más de 5 minutos (anti-replay).
- **Reintentos** con retroceso exponencial: 1 min, 5 min, 30 min, 2 h, 6 h. Tras 5 fallos se marca
  el canal como degradado y se avisa por correo.
- **Idempotencia:** el mismo `delivery_id` puede llegar dos veces; la institución debe tolerarlo.

**Polling.** `GET /api/institutional/incidents?since=<ISO>` con la API key, para quien no puede
exponer un endpoint público.

**Correo institucional.** Mismo contenido que el de suscriptores, más el enlace de acción.

### 3.3 Quién puede cambiar el estado — matriz de permisos

Esta es la decisión de diseño más delicada de esta especificación.

| Actor | Cómo se autentica | Transiciones permitidas |
|---|---|---|
| **Operador** (dashboard) | Sesión con rol | Todas, dentro de la máquina de estados |
| **Institución** | API key o sesión institucional | `validado`, `asignado`, `en_proceso`, `resuelto`, `descartado` — **solo en su jurisdicción** |
| **Colaborador verificado** | Token del correo, elevado por una institución | `en_proceso`, `resuelto` |
| **Suscriptor** (cualquiera que recibió el aviso) | Token de un solo uso del correo | **Ninguna.** Solo puede *atestiguar* |
| **Anónimo** | — | Ninguna |

**Qué es "atestiguar":** un suscriptor que recibe el aviso puede responder con un clic —
*"sigue igual"*, *"empeoró"*, *"ya no está"* — y eso crea un evento `atestacion` visible en el
historial y en el dashboard. Cuenta como señal, no como decisión.

**Por qué un suscriptor cualquiera no cambia el estado directamente:** el correo se reenvía. Si un
token de "marcar resuelto" viaja en un correo reenviable, cualquiera puede sacar de la cola un
drenaje crítico la noche antes de una lluvia, y el sistema perdería exactamente el caso que
justifica su existencia. La figura de **colaborador verificado** cubre la intención — una persona de
confianza que sí puede cerrar el ciclo — pero exige que **una institución la eleve** primero.

> **Decisión abierta para el equipo:** si se prefiere que cualquier suscriptor con token pueda
> cambiar el estado, se puede hacer, pero entonces son obligatorias tres mitigaciones: token de un
> solo uso ligado al incidente y al correo, ventana de reversión de 24 h para el operador, y
> notificación a la institución de cada cambio hecho por un no-operador.

**Todo cambio queda atribuido.** `report_events` gana `actor_type`
(`operador` \| `institucion` \| `colaborador` \| `suscriptor` \| `sistema`) y `actor_id`. El
historial deja de decir solo *qué* pasó: dice *quién* lo hizo.

### 3.4 Enrutamiento institucional (RF-20)

Con jurisdicciones registradas, un reporte nuevo puede derivarse automáticamente: se busca la
institución cuya jurisdicción contiene el punto y cuyas categorías incluyen la del reporte. Si hay
más de una candidata, gana la de jurisdicción más pequeña (la más específica). Si no hay ninguna, el
reporte queda en la cola general y el dashboard lo marca como *sin institución asignada*.

Esto añade un estado al ciclo de vida: **`derivado`** — enrutado y notificado, pendiente de que la
institución lo acepte (`validado`) o lo rechace (`descartado` con motivo).

---

## 4. Modelo de datos

Tablas nuevas. Ninguna toca las existentes salvo `report_events`, que gana dos columnas.

```sql
subscribers (
  id, email_encrypted, email_hash UNIQUE, created_at,
  verified_at, verification_token_hash, verification_expires_at,
  last_notified_at, unsubscribe_token_hash
)

subscriptions (
  id, subscriber_id → subscribers,
  scope,                          -- todas | zonas | radio
  zone_keys, center_lat, center_lng, radius_meters,
  categories, min_level, events, digest,
  active, created_at, updated_at
)

institutions (
  id, name, type, jurisdiction, categories, channels,
  api_key_hash, webhook_url, webhook_secret, active, created_at
)

institution_members (                -- colaboradores elevados por una institución
  id, institution_id → institutions, subscriber_id → subscribers,
  role,                              -- colaborador | admin
  granted_by, granted_at, revoked_at
)

notification_deliveries (            -- una fila por intento: auditoría y antirruido
  id, channel,                       -- email | webhook
  target_type, target_id,            -- subscriber | institution
  report_id, zone_key, event_type,
  status,                            -- pendiente | enviado | fallido | descartado_antirruido
  attempts, last_error, created_at, delivered_at
)

report_events + actor_type, actor_id
```

**Por qué `notification_deliveries` no es opcional:** sin registro de envíos no se puede aplicar el
antirruido, no se puede reintentar un webhook, y no hay forma de responder "¿avisaron o no?" — que
es la primera pregunta que hará cualquier institución.

---

## 5. API

### Suscripciones (públicas, sin cuenta)

| Endpoint | Qué hace |
|---|---|
| `POST /api/subscriptions` | Crea o actualiza una suscripción y manda el correo de verificación. Siempre `202`. |
| `GET /api/subscriptions/verify?token=` | Confirma el doble opt-in y activa la suscripción. |
| `GET /api/subscriptions/manage?token=` | Devuelve la configuración vigente del suscriptor. |
| `PATCH /api/subscriptions/manage?token=` | Cambia filtros, pausa o reactiva (`active`). |
| `DELETE /api/subscriptions/manage?token=` | Baja definitiva; borra el registro. |
| `POST /api/incidents/:id/atestacion?token=` | `sigue_igual` \| `empeoro` \| `ya_no_esta`. |

### Institucional (API key)

| Endpoint | Qué hace |
|---|---|
| `GET /api/institutional/incidents?since=` | Incidentes de su jurisdicción desde una fecha. |
| `PATCH /api/institutional/incidents/:id` | Cambia el estado; `403` fuera de su jurisdicción. |
| `POST /api/institutional/webhook/test` | Envía un evento de prueba firmado. |

### Administración (rol admin)

| Endpoint | Qué hace |
|---|---|
| `POST /api/admin/institutions` | Alta de institución; devuelve la API key una sola vez. |
| `PATCH /api/admin/institutions/:id` | Jurisdicción, canales, activar/desactivar. |
| `POST /api/admin/institutions/:id/members` | Eleva un suscriptor a colaborador verificado. |

Errores con el mismo envoltorio del resto de la API: `{ error: { code, message, fieldErrors,
requestId } }`.

---

## 6. Qué se puede demostrar en el MVP (mock)

Montar SMTP, verificación de dominio y entregabilidad no cabe en un hackathon, pero **el ciclo
completo sí se puede demostrar** sin enviar un solo correo real:

| Pieza | Mock propuesto |
|---|---|
| Envío de correo | `EmailProvider` con implementación `mock` que escribe en `notification_deliveries` y renderiza la bandeja en `/dashboard/notificaciones`. La misma interfaz acepta Resend o SES después. |
| Verificación | El enlace se muestra en la bandeja simulada; un clic activa la suscripción. |
| Webhook | Endpoint local `POST /api/dev/webhook-sink` que registra lo recibido, con firma HMAC real para poder mostrar cómo se verifica. |
| Institución | Dos instituciones sembradas: *Ayuntamiento del Distrito Nacional* (jurisdicción: zonas del DN) y *Ministerio de Medio Ambiente* (todas, solo quema y basura). |
| Cambio de estado por token | Enlace de la bandeja simulada que abre la ficha con el token aplicado. |

**Lo que esto añade a la demo, en 30 segundos:** al cambiar el escenario a *Lluvia intensa*, la zona
pasa a 84 🔴 y aparecen dos avisos en la bandeja — uno al ayuntamiento con jurisdicción sobre la
Av. México y otro al vecino suscrito a esa zona. El aviso del ayuntamiento trae el enlace que cambia
el estado a *en proceso*, y el historial registra que lo cambió la institución, no un operador.

Eso convierte la demo de "mira este mapa" en "mira cómo el sistema hace que alguien actúe".

---

## 7. Prioridad y riesgos

| Bloque | Prioridad |
|---|---|
| Modelo de datos + `EmailProvider` mock + bandeja simulada | **P1** — cabe en el hackathon si P0 está verde |
| Suscripción con doble opt-in y gestión por token | **P1** |
| Webhook firmado + seed de instituciones | **P1** |
| Envío real de correo (Resend/SES), dominio y entregabilidad | **P2** — piloto |
| Auto-registro institucional y verificación de identidad | **P2** — requiere proceso legal, no técnico |
| Atestaciones y colaboradores verificados | **P2** |

| Riesgo | Mitigación |
|---|---|
| Fatiga de notificaciones | `minLevel: alto` por defecto, resúmenes, antirruido por zona y tope diario |
| Correo como vector de suplantación | Doble opt-in, respuestas ciegas, tokens de un solo uso |
| Cierre indebido de incidentes | Matriz de permisos, ventana de reversión, atribución en el historial |
| Primer dato personal del sistema | Cifrado en reposo, hash en logs, retención de 24 meses, borrado en un clic |
| Expectativa de alerta oficial | Cada correo repite que es información complementaria, no una alerta del COE ni del 9-1-1 |
