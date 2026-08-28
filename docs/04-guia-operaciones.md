# Guía de operaciones — cómo funciona PuntoAlerta RD hoy

Documentación *as-built*: describe lo que el código hace ahora mismo, no lo que debería hacer.
Para lo que falta, ver `03-auditoria-brechas.md`. Para las notificaciones y la integración
institucional —especificadas pero aún sin implementar— ver `05-notificaciones-y-suscripciones.md` y
la §14b de esta guía.

Cada operación se explica igual: **quién la dispara → recorrido por el código → reglas y umbrales
→ qué pasa si falla → cómo probarla**.

---

## 0. Mapa mental del sistema

```
Navegador                     Servidor (Next.js route handlers)         Fuera
─────────                     ─────────────────────────────────         ─────
app/page.tsx        ──┐
app/reportar/…       ─┼─ lib/client.ts ─→ app/api/**/route.ts ─┬─ lib/vision.ts  ─→ API de Claude
app/dashboard/…      ─┤   (fetch tipado)   (valida con zod)     ├─ lib/weather.ts ─→ Open-Meteo
app/rutas/…         ──┘                                        ├─ lib/routes.ts  ─→ OSRM
                                                               ├─ lib/risk.ts    (puro, sin red)
                                                               ├─ lib/duplicates.ts
                                                               ├─ lib/db.ts      ─→ data/*.db
                                                               └─ lib/storage.ts ─→ data/uploads/
```

Reglas que se cumplen en todo el código:

1. **Los route handlers no tienen lógica de negocio.** Validan, orquestan y serializan.
2. **`lib/risk.ts` es una función pura.** Mismos reportes + mismo clima = mismo score. No toca red
   ni base de datos, por eso es lo único trivialmente testeable.
3. **Toda fuente externa degrada.** Visión, clima y rutas devuelven un resultado marcado como
   respaldo en vez de lanzar. La demo no se cae porque falle el wifi.
4. **Ningún número de riesgo viaja sin su explicación** (RNF-10).
5. **`lib/db.ts` y `lib/storage.ts` usan `node:fs`**: no pueden importarse desde componentes de
   cliente. Los tipos compartidos viven en `lib/types.ts` y los límites en `lib/limits.ts`.

> **Atajo:** si solo quieres entender *por qué el sistema decide lo que decide* —qué categoría, qué
> severidad, qué nivel de riesgo, qué se atiende primero, qué ruta se recomienda— ve directo a la
> §7b, que reúne todas las decisiones y su precedencia.

### Vocabulario

| Término | Qué es en el código |
|---|---|
| **Reporte** | Fila en la tabla `reports`. Lo que envía una persona. |
| **Zona** | Grupo de reportes a ≤150 m entre sí. No existe como tabla: se calcula al vuelo. |
| **`zoneKey`** | Etiqueta `150:<idxLat>:<idxLng>` derivada del centro de la zona. Solo identifica, no decide pertenencia. |
| **Risk Score** | 0-100 de una zona, con 5 factores explicados. Se recalcula en cada consulta. |
| **Escenario** | `real` \| `seco` \| `lluvia`. Fuerza el contexto meteorológico sin tocar los datos. |
| **Exposición** | 0-100 de una *ruta*: cuánto riesgo conocido atraviesa. |

---

## 1. Arranque: de dónde salen los datos

**Quién la dispara:** cualquier `GET` de lectura (`/api/incidents`, `/api/reports`, `/api/risk`).

**Recorrido:**

1. El handler llama `ensureSeeded()` (`lib/seed.ts`).
2. `ensureSeeded` consulta `countReports()`; si la base está vacía, inserta los 16 reportes de
   `SEED_SPECS`.
3. La conexión se abre en `db()` (`lib/db.ts`), que crea `data/` si no existe, activa
   `journal_mode = WAL` y `foreign_keys = ON`, y ejecuta el `CREATE TABLE IF NOT EXISTS`.
4. `migrateEnumConstraints()` compara los `CHECK` guardados en `sqlite_master` con el dominio
   actual. SQLite no permite alterar un `CHECK`, así que si el dominio ganó una categoría o un
   estado, reconstruye la tabla (crear nueva, copiar, borrar, renombrar) sin perder datos.
5. La conexión se guarda en `globalThis` para que el hot-reload de Next no abra una conexión nueva
   en cada cambio de fichero.

**Reglas:**

- Los 16 reportes se siembran con antigüedades *relativas* (`hoursAgo`), no con fechas fijas: el
  factor de recencia sigue funcionando aunque la demo sea otro día.
- Las coordenadas del seed están ajustadas a la red vial real con el servicio `nearest` de OSRM.
  Un incidente de calle que cae a 100 m de la vía más cercana rompe el cálculo de rutas.
- Cuatro de los 16 están en la misma zona (Av. México, San Miguel) y están calibrados para que la
  demo dé 48 🟡 en seco y 84 🔴 con lluvia.

**Probarla:**

```bash
curl -X POST http://localhost:3000/api/seed          # recarga y devuelve {"inserted":16}
```

---

## 2. Crear un reporte — `POST /api/reports`

La operación más larga del sistema: toca visión, almacenamiento, base de datos, clima y riesgo.

**Quién la dispara:** el botón *Enviar reporte* de `/reportar`, vía `createReport()` en
`lib/client.ts`, con `FormData` (`photo`, `lat`, `lng`, `description`, `category`, `scenario`).

**Recorrido, en orden real de ejecución** (`app/api/reports/route.ts`):

| # | Paso | Detalle |
|---|---|---|
| 1 | Anti-abuso | `isRateLimited(clientKey(req))`. Máx. **8 reportes por IP cada 10 min**, en memoria. Si se pasa: `429 RATE_LIMITED`. |
| 2 | Leer el formulario | `req.formData()`. Si no es multipart: `400`. |
| 3 | Validar campos | `formField()` normaliza `null`/`""` a `undefined` *antes* de zod. Sin esto, `z.coerce.number()` convertiría un `lat` ausente en `0` y el reporte acabaría en el golfo de Guinea. |
| 3b | Validar `capturedAt` | Opcional. Si viene, debe estar entre las últimas **24 h** y los próximos **10 min** (§19), y pasa a ser la fecha del reporte: la línea de tiempo refleja cuándo se vio el problema (RF-04). Una foto de la semana pasada no describe la situación de ahora. |
| 3c | Hashear la sesión | `anonymousSessionId` (UUID del navegador) se guarda como HMAC con el secreto del servidor. Ni un volcado de la base permite correlacionar reportes con un dispositivo sin conocer el secreto, y nunca sale en la proyección pública. |
| 4 | Validar área | `isInDemoArea()`: lat 17.9-19.2, lng -70.6/-69.3. Fuera de ahí, `400` con mensaje concreto. |
| 5 | Validar la foto | Solo si viene. MIME en `image/jpeg\|png\|webp`, tamaño ≤8 MB. La foto es **opcional**: sin ella el reporte sigue siendo válido y la IA clasifica solo con el texto. |
| 6 | Clasificar | `classify()` (§3 de esta guía). Nunca lanza. |
| 7 | Guardar evidencia | `savePhoto()` escribe `data/uploads/<uuid>.<ext>` y devuelve la ruta relativa `uploads/<uuid>.png`. **Fuera de `public/`**: la evidencia solo se sirve por `/api/photos/:id`. |
| 8 | Insertar | `insertReport()` en una transacción: fila en `reports` + evento inicial en `report_events`. La categoría vigente es la corrección de la persona si la envió, si no la de la IA. |
| 9 | Recalcular riesgo | `reportsWithinRadius(punto, 150 m)` → `computeRisk()`. El reporte recién creado ya está dentro. |
| 10 | Buscar similares | `findSimilar()` (§4). |
| 11 | Responder `201` | `{ report, classification, risk, weather, similar }`. |

**Qué pasa si falla algo:** el orden importa. La clasificación va **antes** de insertar, pero
`classify()` no puede fallar (degrada a mock), así que un fallo de IA nunca impide guardar el
reporte. El clima va **después** de insertar: si Open-Meteo se cae, el reporte ya está a salvo y
solo el score sale con datos de respaldo.

**Probarla:**

```bash
curl -X POST http://localhost:3000/api/reports \
  -F "photo=@imbornal.png;type=image/png" \
  -F "lat=18.47870" -F "lng=-69.88990" \
  -F "description=Imbornal tapado con basura frente al colegio" \
  -F "scenario=lluvia"
```

---

## 3. Clasificar la evidencia — `lib/vision.ts`

**Quién la dispara:** solo el paso 6 de crear un reporte.

**Qué motor se usa** (`visionEngineName()`):

| Condición | Motor | `engine` en la respuesta |
|---|---|---|
| `PUNTOALERTA_VISION_ENGINE=mock` | Mock | `mock-v1` |
| Sin `ANTHROPIC_API_KEY` | Mock | `mock-v1` |
| Con API key | Claude | `claude-vision` |
| Con API key pero la llamada falla | Mock | `mock-v1-fallback` |

**Motor Claude:** `messages.parse()` con `zodOutputFormat`, modelo `claude-opus-5`,
`effort: 'low'`, `max_tokens: 4096`. El esquema obliga a devolver `category` (enum),
`severity` 1-10 entero, `confidence` 0-1, tres señales 0-1 (`garbage`, `water`, `road_blockage`) y
un `rationale` de máx. 240 caracteres. El prompt del sistema prohíbe describir personas, rostros o
placas y exige bajar la confianza si la foto es ambigua.

**Motor mock** (determinista, sin red — es el que hace reproducible la demo):

1. Concatena nombre de archivo + descripción.
2. Busca palabras clave por categoría (incluye vocabulario dominicano: *zafacón*, *imbornal*,
   *tragante*, *candela*).
3. **Desempate por peligrosidad**, no alfabético: `inundacion > drenaje_obstruido > quema >
   via_bloqueada > basura`. Por eso "imbornal tapado con basura" clasifica como *drenaje
   obstruido* y no como *residuos*: un imbornal tapado es, ante todo, un problema de drenaje.
4. Sin coincidencias, devuelve **`otro`** con confianza 0.45-0.65 y lo dice en el `rationale`.
   Antes adivinaba una categoría concreta por hash, lo que era peor: una etiqueta con apariencia de
   certeza sobre una evidencia que el motor no entendió.
5. Severidad = base por categoría ± jitter derivado del hash. El mismo input siempre da el mismo
   resultado.

**Probarla:** el `engine` de la respuesta dice qué motor corrió.

---

## 4. Detectar duplicados — `lib/duplicates.ts`

**Quién la dispara:** el paso 6 de crear un reporte, **antes** de insertar: la decisión determina el
estado inicial.

**Dos señales, como pide el §11:** hash sha256 de la evidencia (la misma foto enviada otra vez) y
proximidad espacio-temporal con categoría compatible.

**Candidato:** un reporte existente **activo** (no cerrado), de las últimas **24 h**, a **≤60 m** y
de categoría igual o compatible. Un hash idéntico es candidato aunque esté fuera del radio: es
literalmente la misma foto.

**Score** — escalones excluyentes dentro de cada dimensión, sumados entre dimensiones:

| Señal | Puntos |
|---|---|
| Hash idéntico | +100 |
| A ≤20 m | +50 |
| A ≤60 m (y >20 m) | +30 |
| Misma categoría | +30 |
| Categoría compatible | +15 |
| Reportado hace ≤3 h | +20 |
| Reportado en la ventana de 24 h (y >3 h) | +10 |

**Categorías compatibles:** basura ↔ drenaje obstruido, e inundación ↔ drenaje obstruido. Una
acumulación de basura y un imbornal tapado suelen ser el mismo problema visto de dos maneras.

**Decisión:**

| Score | Decisión | Qué pasa con el reporte |
|---|---|---|
| ≥80 | `adjuntar` | Entra con estado `duplicado` y `duplicateOf` al canónico. **No se descarta:** sigue contando para recurrencia e historial. |
| 50-79 | `posible_duplicado` | Entra normal, con `duplicateOf` anotado para que el operador decida. |
| <50 | `nuevo` | Incidente independiente. |

**La quema nunca se fusiona por categoría compatible** (§11): confundir un incendio con otro
incidente es un error de otra magnitud. Exige misma categoría o hash idéntico.

**Por qué adjuntar no es descartar.** Un duplicado adjuntado conserva su fila: no suma a severidad
ni a contexto (no está activo), pero **sí cuenta en recurrencia e historial**. Es exactamente lo que
pide el doc: "conservar el Report individual y aumentar recurrencia/evidencia del Incident". Un
segundo reporte del mismo punto es información, no ruido.

**Lo que ve el ciudadano:** si se adjuntó, *"Tu evidencia se sumó al caso existente. No se pierde:
cuenta como confirmación de que el problema sigue ahí."* Si es posible duplicado, *"Lo dejamos
anotado para que el operador decida"*. Nunca se le impide reportar.

**Probarla:**

```bash
# la misma foto dos veces en el mismo punto: hash + cercanía = 200 -> adjuntar
curl -X POST localhost:3000/api/reports -F "photo=@foto.png;type=image/png" \
  -F "lat=18.53" -F "lng=-69.95" -F "description=Basura en la esquina"
```

---

## 5. Guardar y servir la evidencia — `lib/storage.ts` + `GET /api/photos/:id`

**Al guardar:** `savePhoto(reportId, mime, bytes)` crea `data/uploads/` si falta y escribe
`<uuid>.<jpg|png|webp>`. En la base solo queda la cadena `uploads/<uuid>.<ext>`.

**Al leer:** `readPhoto(path)` valida la ruta contra
`/^uploads\/([A-Za-z0-9-]+)\.(jpg|png|webp)$/` **antes** de tocar el disco. Cualquier cosa que no
encaje exactamente con lo que produce `savePhoto` devuelve `null`. Eso es lo que bloquea el path
traversal: no hay sanitización de rutas, hay una lista blanca de formato.

**Por qué no está en `public/`:** el §11 exige media privada. Al pasar por un route handler se
puede añadir después autenticación, URL firmada o desenfoque sin mover ficheros.

**Probarla:**

```bash
curl -o foto.png http://localhost:3000/api/photos/<id-del-reporte>   # 200 image/png
curl -i "http://localhost:3000/api/photos/..%2F..%2Fpackage.json"    # 404, no filtra nada
```

---

## 6. Calcular el Risk Score — `lib/risk.ts`

El corazón del producto. Función pura: `computeRisk({ zoneKey, reports, weather, now, center, alertFlag })`.
Implementa la **fórmula versionada del §12** del doc de estándares; `formulaVersion: "risk-v1"` viaja
en cada respuesta para que un score guardado siga siendo interpretable si la fórmula cambia.

**Fórmula:** `score = clamp(round(Σ factor × peso), 0, 100)`

| Factor | Peso | Normalización exacta (§12.2) |
|---|---|---|
| `severidad_observada` | 30% | Severidad máxima de los reportes **abiertos** × 10. Sin reportes abiertos, 0. |
| `recurrencia_reciente` | 25% | Reportes en **14 días** y **100 m**: 0→0, 1→20, 2→40, 3→60, 4→80, ≥5→100. |
| `lluvia_prevista` | 20% | mm en 6 h: <1→0, 1-4.9→25, 5-14.9→50, 15-29.9→75, ≥30→100. |
| `historial_punto` | 15% | Reportes en **180 días** y **100 m**: 0→0, 1-2→30, 3-5→60, ≥6→100. |
| `contexto` | 10% | Acumulable con tope 100: drenaje obstruido +20, agua acumulada +30, vía afectada +20, vía principal +20, alerta manual +30. |

**Son escalones, no curvas.** Un salto de 2 a 3 reportes recientes mueve la recurrencia 20 puntos de
golpe. Es intencional: un umbral es explicable ante un operador ("pasaste de 2 a 3 reportes"), una
curva continua no.

**Si no hay clima** (`source: 'unavailable'`), el factor vale 0 y su explicación lo dice. No se
inventa un pronóstico ni se redistribuye el peso a los otros factores: el score baja, y eso es
correcto, porque hay menos información.

**Niveles** (`riskLevelFor`): 0-25 bajo · 26-50 moderado · 51-75 alto · 76-100 crítico.

**El perímetro viaja con la evaluación.** `RiskAssessment` incluye `radiusMeters` (150 m, el radio
con el que se agruparon los reportes) y `neighbourhoodMeters` (100 m, el radio con el que se contaron
recurrencia e historial). Decir "6 reportes" sin decir "en cuántos metros" no explica nada, así que
el resumen lo dice siempre:

> Riesgo 84/100 (crítico) por 6 reporte(s) agrupados en un radio de 150 m. Factor dominante:
> severidad observada 9/10.

Y las explicaciones de los factores que cuentan reportes nombran su propio radio: *"3 reporte(s) en
los últimos 14 días a menos de 100 m"*, *"6 reporte(s) en 180 días a menos de 100 m"*. La UI nunca
supone el perímetro: lo lee de la evaluación.

**Razones** (§12.4): 1 a 3 frases, solo de factores con score > 0, ordenadas por contribución
absoluta (`score × peso`). El `summary` usa la primera. Los cinco `factors` completos viajan
igualmente para el desglose de la UI.

**Ejemplo real — la zona de la demo (6 reportes, Av. México):**

| Factor | Seco | Aporte | Lluvia (38 mm) | Aporte |
|---|---|---|---|---|
| Severidad observada (9/10) | 90 | 27.0 | 90 | 27.0 |
| Recurrencia reciente (3 en 14 d) | 60 | 15.0 | 60 | 15.0 |
| Lluvia prevista | 0 | 0.0 | 100 | 20.0 |
| Historial del punto (6 en 180 d) | 100 | 15.0 | 100 | 15.0 |
| Contexto (drenaje + agua + vía principal) | 70 | 7.0 | 70 | 7.0 |
| **Total** | | **64 🟠 alto** | | **84 🔴 crítico** |

Los datos son idénticos en ambas columnas. Lo único que cambió es el pronóstico.

> **Lo que esta fórmula puede y no puede hacer.** El clima pesa 20 puntos como máximo (23 con la
> bandera de alerta manual). Por diseño, **la lluvia no puede llevar una zona de moderado a
> crítico**: el salto máximo que puede producir es de 23 puntos, y de ≤50 a ≥76 hacen falta 26. Un
> punto solo llega a crítico si ya acumulaba severidad, recurrencia e historial. Eso es coherente
> con la tesis del producto —el riesgo lo construye el historial, la lluvia lo detona— pero
> contradice el ejemplo 46 🟡 → 84 🔴 del §19 de la especificación de producto. Ver
> `03-auditoria-brechas.md`.

**Snapshot inmutable** (§10): al crear un reporte y en cada cambio de estado se escribe una fila en
`risk_snapshots` con score, nivel, factores, razones, clima usado, versión de la fórmula y qué
reporte lo disparó. Sin eso un score del pasado no es reproducible: los estados cambian y el
pronóstico caduca. `GET /api/incidents/:id` devuelve los últimos 10 en `riskHistory`.

**Probarla:**

```bash
curl "http://localhost:3000/api/risk?lat=18.47872&lng=-69.88984&scenario=seco"
curl "http://localhost:3000/api/risk?lat=18.47872&lng=-69.88984&scenario=lluvia"
curl "http://localhost:3000/api/incidents/<id>"   # incluye riskHistory
```

---

## 7. Agrupar reportes en zonas — clustering

**Quién la dispara:** `computeZoneRisks()`, usado por el mapa y el dashboard.

**Cómo funciona:** `clusterReports()` hace clustering codicioso por radio:

1. Ordena los reportes por severidad y luego por fecha (el más grave y reciente primero).
2. Toma el primero como semilla y absorbe todos los pendientes a **≤150 m**.
3. Repite hasta que no quedan reportes sueltos.
4. El centro de la zona es el promedio de coordenadas; su `zoneKey` sale de ese centro.
5. Las zonas se devuelven ordenadas por score descendente, así que `zones[0]` es siempre la peor.

**Por qué por radio y no por celda de grilla:** la primera versión agrupaba por celdas de 150 m y
un borde de celda partía en dos los cuatro reportes de la misma esquina — la zona de la demo salía
con 3 reportes en vez de 4 y el score bajaba. Agrupar por distancia elimina el artefacto.

**Consecuencia a tener en cuenta:** una zona depende de qué reportes existan, así que al filtrar
por categoría en el mapa las zonas se calculan igual sobre **todos** los reportes del área. Filtrar
la vista no debe falsear el riesgo.

---

## 7b. Cómo se toman las decisiones

Todo lo que el sistema "decide" está en esta sección. No hay modelo entrenado ni caja negra: cada
decisión es una regla legible, y cuando dos fuentes se contradicen hay una precedencia explícita.

### La regla de precedencia

Cuando dos fuentes dicen cosas distintas sobre el mismo reporte, gana la de más arriba:

| Prioridad | Fuente | Por qué manda |
|---|---|---|
| 1 | **El operador municipal** | Es quien va al sitio y responde por la intervención. |
| 2 | **La persona que reportó** | Estaba ahí. Ve lo que la foto no capta. |
| 3 | **La IA de visión** | Es una propuesta, nunca la última palabra. |
| 4 | **El valor por defecto** | Solo cuando no hay ninguna señal. |

La IA nunca sobrescribe una corrección humana: su propuesta queda guardada aparte, en las columnas
`ai_*`, para poder medir después qué tan bien clasifica.

---

### Decisión 1 — ¿De qué categoría es esto?

**Quién decide:** `classify()` propone; la persona confirma o corrige; el operador puede corregir
después.

**Cómo:**

1. La IA (Claude o mock) devuelve una categoría de las seis del dominio.
2. Si la persona envió `category` en el formulario, **esa** queda como categoría vigente y se marca
   `confirmed_by_user = 1`.
3. Si no, queda la de la IA, sin marcar como confirmada.
4. En `/reportar`, tras enviar, la persona ve la propuesta y puede cambiarla con un toque.

**El desempate del motor mock, cuando el texto activa varias categorías:**

```
inundacion  >  drenaje_obstruido  >  quema  >  via_bloqueada  >  basura  >  otro
```

Está ordenado por peligrosidad, no alfabéticamente. Por eso "imbornal tapado con basura" sale como
*drenaje obstruido* y no como *residuos*: si el sistema se equivoca, es mejor que se equivoque
señalando el problema más grave, porque el coste de subestimar un drenaje tapado antes de una lluvia
es mucho mayor que el de mandar una brigada a recoger basura.

**Cuando no entiende nada:** devuelve `otro` con confianza 0.45-0.65 y lo dice en el `rationale`.
Antes adivinaba por hash una categoría concreta; eso producía una etiqueta con apariencia de
certeza sobre una evidencia que el motor no había entendido, que es peor que admitir la duda.

---

### Decisión 2 — ¿Qué severidad tiene? (1-10)

**Quién decide:** solo la IA, hoy.

**Cómo:** el motor Claude la devuelve en el esquema (1 = molestia menor, 10 = peligro inmediato para
la vida o el tránsito). El motor mock parte de una base por categoría (inundación 8, quema 8,
drenaje 7, vía 7, basura 5, otro 4) y le aplica un desplazamiento derivado del hash del texto, para
que la misma evidencia dé siempre el mismo número.

**Limitación conocida:** el operador todavía no puede ajustar la severidad. Está pendiente en el
backlog (§16 del doc de estándares lo pide antes de validar).

---

### Decisión 3 — ¿Cuánta confianza tiene esa clasificación?

**Cómo:** la IA devuelve `confidence` 0-1. El mock usa 0.78-0.92 cuando hubo coincidencia de
palabras clave y 0.45-0.65 cuando no.

**Qué se hace con ella:** por debajo de **0.6** la insignia cambia a "Confianza baja" en ámbar, para
empujar a la persona a corregir. **La confianza no altera el Risk Score.** Es deliberado: mezclarla
haría el score menos explicable y dejaría que un fallo de la IA baje la prioridad de un problema
real.

---

### Decisión 4 — ¿Qué reportes son "la misma zona"?

**Quién decide:** `clusterReports()`.

**Cómo:** clustering codicioso por radio. Se ordenan los reportes por severidad y luego por fecha;
el primero es la semilla y absorbe todos los que estén a **≤150 m**; se repite con los que quedan.

**Por qué la semilla es el más grave y reciente:** define el centro de la zona, así que la zona
queda anclada al problema que importa, no a un reporte viejo y menor que quedara primero por azar.

**Por qué radio y no cuadrícula:** la primera versión usaba celdas de 150 m y un borde de celda
partía en dos los cuatro reportes de una misma esquina. La zona salía con 3 reportes en vez de 4 y
el riesgo bajaba. Un límite administrativo invisible no puede cambiar el diagnóstico.

---

### Decisión 5 — ¿Qué nivel de riesgo tiene la zona?

**Quién decide:** `computeRisk()` — función pura, sin red ni base de datos.

**Cómo:** los cinco factores del §6, cada uno 0-100, ponderados 30/25/20/15/10 según la fórmula
versionada `risk-v1`. El score total cae en una banda:

| Score | Nivel | Cómo se muestra |
|---|---|---|
| 0-25 | Bajo | ✓ + "Bajo" + número |
| 26-50 | Moderado | ● + "Moderado" + número |
| 51-75 | Alto | ▲ + "Alto" + número |
| 76-100 | Crítico | ! + "Crítico" + número |

**Tres reglas que gobiernan esta decisión:**

1. **Nunca solo color.** Símbolo + palabra + número, siempre (WCAG 2.2 y §17.3).
2. **Nunca sin explicación.** Cada factor viaja con su frase; el `summary` nombra el factor
   dominante, calculado como el mayor `score × peso`.
3. **Nunca como probabilidad.** La UI dice "nivel de riesgo/prioridad según señales disponibles".
   El sistema no afirma que se va a inundar.

**El techo de la lluvia:** el factor meteorológico aporta 20 puntos como máximo. La zona de la demo
pasa de 64 🟠 a 84 🔴 solo porque **ya** acumulaba severidad 9, tres reportes en 14 días, seis en 180
y contexto agravante. Un punto sin historial no se vuelve crítico porque llueva, y eso es la tesis
del producto: la lluvia no crea el riesgo, lo detona.

---

### Decisión 6 — ¿Qué se atiende primero?

**Quién decide:** `priorityQueue()` en el dashboard.

**Cómo:**

1. Se descartan los resueltos.
2. Cada reporte hereda el score de su zona.
3. Orden: **score descendente**; a igual score, **el más antiguo primero**.

**Por qué el más antiguo primero:** con la misma urgencia técnica, lleva más tiempo sin respuesta.
Si no, un punto puede quedar eternamente detrás de reportes nuevos igual de graves.

**Lo que la cola no hace:** no reordena por cercanía a la brigada ni por coste. Esa es una decisión
operativa que el MVP deja a la persona, y para eso está la comparación de rutas.

---

### Decisión 7 — ¿Esto ya está reportado?

**Quién decide:** `scoreCandidate()` + `decide()` (ver §4 de esta guía).

**Cómo:** un score de 0 a 200 sumando hash idéntico, cercanía, coincidencia de categoría y
antigüedad. ≥80 adjunta, 50-79 marca posible duplicado, <50 es incidente nuevo.

**Adjuntar no es descartar.** Un duplicado conserva su fila y sigue contando para recurrencia e
historial; solo deja de contar como incidente activo. Un segundo reporte del mismo punto **es
información válida**: confirma que el problema sigue ahí y que más de una persona lo ve.

**Y nunca bloquea al ciudadano.** Ni siquiera cuando el score es 200: el reporte entra, y lo que
cambia es cómo se contabiliza.

---

### Decisión 8 — ¿Qué ruta se recomienda?

**Quién decide:** `compareRoutes()`.

**Cómo:**

1. Se puntúa la exposición de cada candidata: incidentes activos a ≤80 m del trazado, cada uno
   ponderado por distancia (1.0/0.7/0.4) y por nivel de verificación (1.0 operador / 0.8 IA / 0.6
   sin verificar).
2. `fastest` = menor duración. `leastExposed` = menor exposición; a igual exposición, la más rápida.
3. **Si la menos expuesta tarda más del 40% extra, no se recomienda ninguna:** se muestran las dos
   con su trade-off y `recommendedRouteId` queda en `null`.

**Por qué ese freno:** una ruta con exposición 0 que duplique el tiempo no es una recomendación
sensata para una ambulancia o una brigada. El sistema expone el trade-off y deja la decisión en
quien conoce el contexto.

**Terminología obligatoria:** "menor exposición a incidentes reportados". Nunca "ruta segura" ni
"ruta de evacuación": el sistema no sabe si una calle es segura, solo qué incidentes le fueron
reportados.

---

### Decisión 9 — ¿De dónde salen los datos externos?

| Decisión | Regla |
|---|---|
| Motor de visión | `auto` → Claude si hay API key, mock si no. `mock` y `claude` fuerzan uno; `claude` sin key falla al arrancar. |
| Si Claude falla | Degrada al mock y lo marca como `mock-v1-fallback`. El reporte nunca se pierde por un fallo de IA. |
| Clima | Escenario `seco`/`lluvia` → snapshot simulado, marcado como SIMULACIÓN en la UI. `real` → Open-Meteo. |
| Si Open-Meteo falla | Valor de respaldo, marcado para que la UI avise de que no es en vivo. |
| Rutas | OSRM público; si no responde, rutas sintéticas marcadas como estimadas. |

**El principio:** una fuente externa caída degrada la calidad del dato, nunca la disponibilidad del
sistema — y **siempre se dice** que el dato es de respaldo. Un dato de respaldo sin etiqueta es
peor que no tener dato.

---

### Decisión 10 — ¿Qué puede pasar después con un reporte?

**Quién decide:** `canTransition()` sobre el grafo explícito del §16 (ver §10 de esta guía).

**Cómo:** ocho estados y un grafo que permite dos reasignaciones hacia atrás. Cerrar un incidente
(`resuelto`, `descartado`, `duplicado`) exige nota de 10-280 caracteres. Los estados terminales no
admiten cambios y no cuentan como incidente activo en ningún cálculo. Cada cambio escribe un evento
con estado anterior, nuevo, nota y fecha: **el historial es la fuente de verdad, no el estado
actual**.

**Por qué el rechazo enumera las opciones válidas:** un `409` que solo dice "no permitido" obliga a
leer el código. El mensaje incluye a qué estados sí se puede pasar desde el actual.

---

### Lo que el sistema decide NO decidir

Estas ausencias son decisiones de diseño, no funcionalidad pendiente:

- **No declara ninguna calle segura.** Solo dice qué incidentes conoce.
- **No emite alertas oficiales.** El aviso del encabezado no es decorativo: la autoridad es el COE
  y el 9-1-1.
- **No identifica infractores ni propone sanciones.** El prompt de visión prohíbe describir
  personas, rostros y placas.
- **No fusiona reportes automáticamente.** Ver decisión 7.
- **No convierte el score en probabilidad de inundación.** Es prioridad operativa.
- **No decide sola qué se arregla.** Ordena una cola; la intervención la decide una persona.

---

## 8. Consultar el clima — `lib/weather.ts`

**Quién la dispara:** todo lo que calcula riesgo, más `GET /api/weather`.

**Interfaz (§13.1):** devuelve acumulados a **1, 3 y 6 horas**, probabilidad máxima, nivel de aviso,
fuente y `isStale`.

**Orden de preferencia:**

| # | Fuente | Cuándo |
|---|---|---|
| 1 | Escenario simulado (`demo`) | `scenario=seco` o `scenario=lluvia`. La UI muestra SIMULACIÓN. |
| 2 | Caché (`cache`) | Hay un snapshot de la misma geocelda de menos de 10 min. |
| 3 | Open-Meteo (`open-meteo`) | Llamada real, timeout 4 s. |
| 4 | Caché rancia (`cache` + `isStale`) | El proveedor falló y hay snapshot de menos de 60 min. |
| 5 | No disponible (`unavailable`) | Nada de lo anterior: **ceros reales**. |

**La caché es por geocelda de ~1.1 km** (`lat.toFixed(2):lng.toFixed(2)`), según §13.2: dos puntos
del mismo barrio comparten pronóstico, así que no tiene sentido pedirlo dos veces.

**El caso 5 es el importante.** Antes el respaldo asumía 6 mm inventados; ahora devuelve ceros con
`source: 'unavailable'`, el Risk Engine deja el factor meteorológico en 0 y la UI dice "clima no
disponible". Un número inventado contamina el score y nadie puede auditar de dónde salió.

**Acumulados:** se suman desde la primera hora `>= ahora`, no desde el inicio del día. Umbrales de
aviso: `≥4 mm` aviso · `≥15 mm` alerta · `≥40 mm` emergencia.

**Probarla:**

```bash
curl "http://localhost:3000/api/weather"                    # real; la 2ª llamada dirá source=cache
curl "http://localhost:3000/api/weather?scenario=lluvia"    # escenario forzado
```

---

## 9. Cargar el mapa y el dashboard — `GET /api/incidents`

Una sola llamada alimenta las tres pantallas de consulta.

**Quién la dispara:** `fetchIncidents()` en `lib/client.ts`, desde `/`, `/dashboard` y `/rutas`.

**Recorrido:**

1. `ensureSeeded()`.
2. Valida `category`, `status`, `scenario`; parsea `bbox` (`minLat,minLng,maxLat,maxLng`).
3. Pide el clima **una vez** para el centro del área: el MVP cubre el Gran Santo Domingo, donde el
   pronóstico horario es prácticamente el mismo en todo el polígono.
4. `listReports({ bounds, category, status })` para los pines.
5. `computeZoneRisks(listReports({ bounds }), weather)` para las zonas — sin el filtro de categoría,
   por lo dicho en §7.
6. `recurrent` = zonas con **≥2 reportes** (RF-13).
7. Devuelve `{ reports, zones, recurrent, weather, updatedAt }`.

**Cómo lo usa la UI:**

- `/` pinta pines (color = nivel de su zona, ícono = categoría) y círculos de 150 m por zona.
  Guarda los scores anteriores en un `useRef` para poder anunciar "cambió de 48 a 84" cuando
  cambias de escenario.
- `/dashboard` construye la cola con `priorityQueue()`: descarta resueltos, cuelga cada reporte de
  su zona, ordena por score descendente y, a igual score, por antigüedad ascendente.
- El estado `loading` se **deriva** de comparar la clave de la consulta vigente con la de la
  respuesta recibida, en vez de escribirse dentro del efecto. Así no hay renders en cascada.

**Proyección pública** (`lib/public.ts`): `toPublicIncidents()` es el único sitio que decide qué
sale al exterior. Elimina `photoPath` (lo sustituye por `hasEvidence: boolean`), `aiSignals` y
`aiRationale`, y redondea la coordenada a 4 decimales (~11 m): suficiente para ubicar la esquina,
no para señalar una casa. El riesgo se sigue calculando server-side sobre los reportes completos,
así que la proyección no degrada el score.

---

## 10. Cambiar de estado, categoría o severidad — `PATCH /api/incidents/:id`

**Quién la dispara:** los botones de estado del dashboard y los botones de categoría de `/reportar`
tras enviar.

**El grafo de estados (§16)** — no es lineal, y eso es intencional:

```
reportado ──┬─→ en_revision ──┬─→ validado ──┬─→ asignado ⇄ en_proceso ──→ resuelto ▪
            │                 │              │                    
            ├─→ validado       ├─→ descartado ▪                   
            ├─→ descartado ▪   └─→ duplicado ▪                    
            └─→ duplicado ▪                                        

▪ = terminal          ⇄ = se puede reasignar hacia atrás
```

**Las dos flechas hacia atrás importan:** `asignado → validado` (se devuelve a la cola) y
`en_proceso → asignado` (cambia la brigada). La primera versión de este código tenía la regla "el
estado solo avanza" y bloqueaba ambas, lo que hacía imposible reasignar un incidente. El grafo
explícito lo arregló.

**Cerrar exige justificar.** Pasar a `resuelto`, `descartado` o `duplicado` requiere una nota de
**10 a 280 caracteres**. Sin nota, `409 CONFLICT`. El motivo queda en el historial de auditoría: un
incidente que desaparece de la cola sin explicación es exactamente lo que no debe poder pasar.

**`en_revision` no lo pone una persona.** Se asigna automáticamente al crear el reporte cuando la IA
falló (motor `-fallback`) o cuando su confianza es menor que 0.6. El ciudadano no se bloquea nunca
por un fallo de la IA: el reporte entra igual, marcado para revisión humana (§6 del doc 01, §22.3).

**La severidad solo se corrige antes de validar** (§16): en `reportado` o `en_revision`. Después,
`409`. Cada corrección escribe un evento con la severidad anterior y la nueva.

**Estados terminales:** `resuelto`, `descartado` y `duplicado` no admiten más cambios, y ninguno
cuenta como incidente activo. Esto afecta a tres sitios: el Risk Engine (no suman a severidad ni
contexto), la cola del dashboard (no aparecen) y la detección de similares (no son candidatos).

**Recorrido:**

1. `getReport(id)`; si no existe, `404`.
2. Valida cuerpo: `status`, `category`, `severity` (1-10), `note` (≤280) y `scenario`.
3. `canTransition(actual, nuevo, nota)` decide, y su mensaje de rechazo **dice qué transiciones sí
   se pueden hacer** desde el estado actual.
4. Si viene `severity`: se comprueba `allowsCorrection(actual)` antes de tocar nada.
5. Se aplican los cambios, cada uno con su evento en `report_events`.
6. Se recalcula el riesgo de la zona y se persiste un snapshot inmutable.
7. Devuelve reporte, historial de eventos, riesgo y `riskHistory`.

**Probarla:**

```bash
# rechazada: el grafo no permite saltar de reportado a resuelto
curl -X PATCH localhost:3000/api/incidents/<id> -H 'content-type: application/json' \
  -d '{"status":"resuelto","note":"nota suficientemente larga"}'

# aceptada, con nota de cierre
curl -X PATCH localhost:3000/api/incidents/<id> -H 'content-type: application/json' \
  -d '{"status":"validado"}'
```

---

## 11. Comparar rutas — `POST /api/routes/compare`

**Quién la dispara:** `/rutas` (botón *Comparar rutas*) y el enlace *Ruta de brigada con el top 3*
del dashboard, que pasa los puntos en `?puntos=lat,lng;lat,lng`.

**Recorrido** (`lib/routes.ts`):

1. Valida que origen, destino y hasta 5 puntos intermedios estén dentro del área de demo, y que
   origen y destino no estén a más de **50 km**.
2. Calcula el clima del punto medio y las zonas de riesgo de **todos** los reportes.
3. Pide a OSRM la ruta con `alternatives=3`, `overview=full`, `geometries=geojson`, timeout 6 s.
   Con puntos intermedios OSRM no calcula alternativas, así que se pide `alternatives=false`.
4. Puntúa la exposición de cada candidata (§12).
5. **Si alguna candidata pasa cerca de riesgo, genera desvíos:** toma el incidente de mayor aporte y
   construye dos waypoints perpendiculares al eje origen→destino, a **900 m** a cada lado. Vuelve a
   pedir a OSRM `origen → waypoint → destino`. Los desvíos siguen siendo calles reales: solo se le
   sugiere al motor por dónde salir.
6. Deduplica candidatas con el mismo tiempo y distancia (OSRM a veces devuelve clones).
7. Elige `fastest` (menor duración) y `leastExposed` (menor exposición; a igual exposición, la más
   rápida).
8. **No auto-recomienda si la menos expuesta tarda más del 40% extra** (regla del §15.2): en ese
   caso `recommendedRouteId` es `null` y se muestran ambas con su trade-off.
9. Genera la frase de recomendación y renombra las etiquetas a *Ruta más rápida* y *Menor exposición
   a incidentes reportados* — el doc prohíbe la palabra "ruta segura".

**Si OSRM no responde:** genera tres rutas sintéticas (la recta y dos desvíos en campana), estima el
tiempo a 7.5 m/s (~27 km/h urbano) y las marca `source: 'sintetica'`; la tarjeta lo dice en la UI.

**Ejemplo real, escenario lluvia** (origen `18.4795,-69.87` → destino `18.483,-69.925`):

| Ruta | Tiempo | Exposición | Incidentes cerca |
|---|---|---|---|
| Ruta más rápida | 9 min | 87 | 3 incidentes críticos, el más cercano a 1 m del trazado |
| Menor exposición | 11 min | 0 | ninguno |

Recomendación: *"+2 min, evitando 1 punto de riesgo actualmente identificados."*

---

## 12. Puntuar la exposición de una ruta — `scoreExposure()`

Implementa la fórmula del §15.2, con `routingVersion: "routing-v1"` en la respuesta.

**La unidad es el incidente, no la zona.** Para cada reporte **activo** a ≤80 m del trazado:

```
aporte      = riskScore × pesoDistancia × pesoVerificación
exposición  = min(100, round(Σ aporte / 2.5))
```

| Peso por distancia | | Peso por verificación | |
|---|---|---|---|
| 0-20 m | 1.0 | Validado por operador | 1.0 |
| 21-40 m | 0.7 | Clasificado por IA | 0.8 |
| 41-80 m | 0.4 | Sin verificar | 0.6 |
| >80 m | no cuenta | | |

**Por qué existe el peso de verificación:** una foto ciudadana sin revisar no puede penalizar una
calle como si fuera un hecho comprobado. El doc lo dice explícitamente y es una decisión de
producto, no de cálculo: el sistema distingue entre lo que alguien reportó y lo que un operador
confirmó.

**El `riskScore` de un incidente es el de su zona.** El §15.2 habla del riesgo del incidente; en
este modelo el riesgo se calcula por zona, así que cada incidente hereda el score de la suya
(`exposureIncidentsFrom`). Un reporte sin zona no genera exposición.

**Se devuelve el desglose completo**, no solo el total: cada incidente expuesto viaja con su
categoría, su distancia al trazado, sus dos pesos y su aporte. La tarjeta de ruta lo muestra
—*"drenaje obstruido a 1 m (×1 distancia, ×0.8 clasificado por IA)"*— para que el número sea
auditable a simple vista.

**Ejemplo real, escenario lluvia** (origen `18.4795,-69.87` → destino `18.483,-69.925`):

| Ruta | Tiempo | Exposición | Crudo | Incidentes |
|---|---|---|---|---|
| Ruta más rápida | 9 min | **87** | 218.4 | 3 críticos: basura a 15 m (84), drenaje a 1 m (67.2), inundación a 11 m (67.2) |
| Menor exposición | 11 min | **0** | 0 | ninguno |

Recomendación: *"+2 min, evitando 3 puntos de riesgo actualmente identificados."*

**El divisor 2.5 es calibración de demo**, no un umbral científico; está declarado como tal en el
doc y versionado en `routing-v1`.

---

## 12b. Configuración — `lib/env.ts`

Todas las variables se validan con Zod **al importar el módulo**, no al usarlas. Un valor inválido
o un secreto ausente para el provider activo revienta el arranque con el detalle del campo:

```
Error: Configuración inválida en las variables de entorno:
  ANTHROPIC_API_KEY: PUNTOALERTA_VISION_ENGINE=claude requiere ANTHROPIC_API_KEY
```

`activeVisionEngine()` resuelve el modo `auto`: Claude si hay API key, mock si no. `PUNTOALERTA_DB_FILE`
solo acepta un nombre de fichero (`^[A-Za-z0-9._-]+$`), nunca una ruta.

---

## 12c. Sesión de operador — `lib/auth.ts`

El §8 exige que el cambio de estado sea solo de OPERATOR/ADMIN y el §28 que "el dashboard exija
rol". El doc contempla Supabase Auth; este MVP usa una **cookie firmada con HMAC-SHA256** porque no
hay proveedor de identidad. No hay usuarios: hay un rol compartido con un código de acceso.

**Token:** `operador.<expiración>.<firma>`, con TTL de 8 h. La cookie es `HttpOnly`, `SameSite=Lax`
y `Secure` en producción. La firma y el código se comparan con `timingSafeEqual`: una comparación
normal filtra información por tiempo de respuesta.

**Sin secreto configurado** (`PUNTOALERTA_SESSION_SECRET`) se genera uno efímero por proceso: las
sesiones mueren al reiniciar. Aceptable en desarrollo; en producción se avisa por log.

**Quién puede hacer qué:**

| Acción | Sin sesión | Operador |
|---|---|---|
| Ver mapa, zonas, riesgo, rutas | ✅ | ✅ |
| Crear un reporte | ✅ | ✅ |
| Corregir la **categoría** de un incidente no validado (RF-07) | ✅ | ✅ |
| Corregir la categoría de un incidente **ya validado** | ❌ 403 | ✅ |
| Cambiar **estado** o **severidad** | ❌ 401 | ✅ |
| Recargar el seed | solo con `DEMO_MODE` | ✅ |

**La línea que separa ciudadano de operador no es el endpoint, es el campo.** El mismo `PATCH`
acepta la corrección de categoría de cualquiera —porque enmendar a la IA es un derecho del
ciudadano (RF-07)— y rechaza el cambio de estado sin sesión. Y esa corrección solo se admite
mientras un operador no haya validado el incidente: después, los datos ya son de la operación.

**El login no dice si el código existe.** Un código inválido siempre devuelve el mismo mensaje, y
los intentos pasan por el mismo limitador que los reportes (8 por IP cada 10 min) para que no se
pueda probar por fuerza bruta.

**Probarla:**

```bash
# 401 sin sesión
curl -X PATCH localhost:3000/api/incidents/<id> -H 'content-type: application/json' \
  -d '{"status":"validado"}'

# iniciar sesión y repetir
curl -c cookie.txt -X POST localhost:3000/api/auth/operador \
  -H 'content-type: application/json' -d '{"code":"operador-demo"}'
curl -b cookie.txt -X PATCH localhost:3000/api/incidents/<id> \
  -H 'content-type: application/json' -d '{"status":"validado"}'
```

---

## 13. Validaciones y errores

Todos los errores salen con la misma forma:

```json
{ "error": { "code": "...", "message": "...", "fieldErrors": {...}, "requestId": "uuid" } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Campos inválidos, punto fuera del área, foto no admitida, ruta >50 km. |
| `UNAUTHORIZED` | 401 | Falta sesión de operador para cambiar estado o severidad. |
| `FORBIDDEN` | 403 | Código de acceso inválido, o categoría de un incidente ya validado. |
| `NOT_FOUND` | 404 | Reporte o evidencia inexistente. |
| `CONFLICT` | 409 | Transición de estado hacia atrás. |
| `RATE_LIMITED` | 429 | Más de 8 reportes por IP en 10 min. |
| `UPSTREAM_TIMEOUT` | 504 | Reservado; hoy las fuentes externas degradan en vez de fallar. |
| `INTERNAL_ERROR` | 500 | Cualquier excepción no prevista, capturada por `handler()`. |

`handler()` envuelve **todos** los route handlers: un error inesperado se registra en el servidor y
al cliente le llega un mensaje seguro, nunca un stack.

Los mensajes son accionables por diseño: *"La imagen supera los 8 MB"*, no *"Error 400"*. Y una
validación fallida nunca borra lo que la persona escribió (el estado del formulario vive en React).

---

## 14. Qué muestra cada componente

| Componente | Responsabilidad |
|---|---|
| `IncidentMap.tsx` | Leaflet: tiles de OSM, círculos de zona, pines con emoji de categoría sobre color de riesgo, polilíneas de ruta, clic para elegir punto. Se carga con `ssr: false` porque Leaflet toca `window` al importarse. |
| `MapView.tsx` | Envoltorio con `next/dynamic` y esqueleto de carga. |
| `badges.tsx` | `RiskBadge` (símbolo + palabra + número, nunca solo color), `StatusBadge`, `CategoryChip`, `ConfidenceBadge` (muestra "Confianza baja" bajo 0.6). |
| `RiskReasons.tsx` | Los 5 factores con barra, peso y explicación. |
| `WeatherBanner.tsx` | Aviso vigente + selector de escenario + avisos de simulación y de dato de respaldo. |
| `IncidentCard.tsx` | Tarjeta de la cola: prioridad, categoría, estado, confianza, recurrencia, factor dominante y botón de avance. |
| `MapLegend.tsx` / `CategoryFilter.tsx` | Leyenda de niveles y categorías; filtro con `aria-pressed`. |
| `IncidentList.tsx` | **Alternativa textual del mapa** (§22.5): la misma información en botones enfocables, ordenada por riesgo. Un mapa Leaflet no se navega con teclado ni con lector de pantalla. |
| `ConnectionBanner.tsx` | Estado `offline` (§18) anunciado con `role="status"`: perder la red no es visible para quien usa lector de pantalla. |
| `ui.tsx` | Primitivas compartidas: `Card`, `SegmentedControl`, `IconBubble`, `Stat`. Existen porque cada pantalla repetía su propia combinación de borde, radio y espaciado, y la interfaz se veía distinta en cada sitio sin que nadie lo hubiera decidido. |

**Decisiones de presentación que no son cosmética:**

- **Control segmentado** para las elecciones excluyentes (escenario meteorológico, alcance de la
  suscripción, frecuencia). Tres botones sueltos de anchos distintos no comunican "elige uno".
- **Plurales reales** (`plural()` en `lib/format.ts`) en lugar de `reporte(s)`. La forma con
  paréntesis aparecía en cada tarjeta, cada tooltip y cada correo.
- **Etiquetas cortas** (`CATEGORY_SHORT_LABELS`) para píldoras y filtros; la completa se reserva para
  la leyenda. Con las largas, siete píldoras formaban cuatro filas irregulares en móvil.
- **Orden móvil explícito** con `order-*`: en una columna el mapa quedaba detrás de seis tarjetas.
  En `/` el mapa es lo segundo tras el clima; en `/suscripciones`, lo tercero tras el alcance,
  porque es donde se eligen las zonas. En escritorio vuelve la disposición de dos columnas.
- **El emoji va dentro de `IconBubble`**: suelto flota con un tamaño óptico distinto al del texto.

**Sincronización panel ↔ mapa.** `center` y `zoom` de `MapContainer` son **solo valores iniciales**:
cambiarlos después no mueve el mapa. Por eso el componente `Recenter` llama a `map.setView()` cuando
cambian. Sin él, seleccionar un incidente en el mapa sí actualizaba el panel, pero seleccionar una
zona en el panel no tenía ningún efecto visible — un bug que ningún test unitario ni render estático
detectaba. `scripts/check-zone-selection.mjs` lo comprueba en un navegador real vía CDP:
mide el zoom de los tiles antes y después del clic.

La zona seleccionada se distingue por **trazo discontinuo y grosor**, no solo por relleno, y muestra
su tooltip de forma permanente. En `/reportar` el encuadre del mapa va en un estado aparte del punto
elegido: si se recentrara en cada clic, el mapa se movería bajo el dedo de quien está eligiendo.

**Agregación por zoom en el mapa** (§18): por debajo de zoom 13 se dibuja un marcador por **zona**
con el número de reportes; por encima, uno por reporte. Se agrupa por la zona que ya calcula el Risk
Engine, así que el "cluster" del mapa y la zona del modelo son la misma cosa — un clustering por
píxeles habría inventado una segunda agrupación que no significa nada en el dominio.

---

## 14b. Avisar a quien puede actuar — `lib/notifications.ts` + `lib/notify.ts`

Cierra el ciclo del producto: hasta esta iteración el sistema calculaba 84 🔴 y **nadie se
enteraba**. El diseño completo está en `05-notificaciones-y-suscripciones.md`; aquí va lo que el
código hace hoy.

**Dos módulos, a propósito:** `notifications.ts` son las **decisiones** (funciones puras: a quién
toca, si toca ahora, qué dice el correo) y `notify.ts` es el **despachador** (lee datos, aplica el
antirruido, escribe los envíos). Solo el segundo toca la base.

**Quién la dispara:** crear un reporte, después de persistir el snapshot de riesgo. Si el aviso
falla, el reporte y su riesgo ya están a salvo — por eso va al final y su error se captura.

### Las cuatro reglas que evitan la fatiga

| Regla | Implementación |
|---|---|
| Solo cruces **hacia arriba** | `crossedUpward()` compara el nivel del último snapshot con el nuevo. Que una zona baje de crítico a alto es buena noticia, no urgencia. |
| Nivel mínimo por defecto **alto** | Una suscripción que avisa de todo se silencia en dos días. |
| Antirruido de **6 h por zona** | `throttle()` con el último envío efectivo a ese destinatario para esa zona. |
| Tope de **10 al día** | Se comprueba antes del enfriamiento: si ya recibió 10, no se evalúa nada más. |

**Y una excepción:** un nivel **crítico** se envía al momento aunque la suscripción sea de resumen.
Retenerlo hasta el lunes vacía su utilidad.

### La interfaz — `/suscripciones`

Una sola página con tres modos, según los parámetros de la URL:

| URL | Modo |
|---|---|
| `/suscripciones` | Alta: correo, alcance, eventos, nivel mínimo, frecuencia, categorías y consentimiento. |
| `/suscripciones?verificar=<token>` | Confirma el doble opt-in (es el enlace del correo). |
| `/suscripciones?token=<token>` | Gestión: ver la configuración, pausar/reactivar o darse de baja. |
| `/suscripciones?zona=<zoneKey>` | Alta con esa zona ya elegida. Es el destino del botón "Avisarme de esta zona" del mapa. |

**El alcance por zonas se elige pulsando los círculos del mapa**, no escribiendo identificadores.
El alcance por radio se fija tocando el mapa y moviendo un deslizador de 500 a 5000 m.

**Los textos describen el efecto, no el campo.** En vez de `cambio_nivel` se lee *"Cuando la zona
sube de nivel de riesgo"*; en vez de `digest` se lee *"Cuánto ruido"*. Un formulario que expone los
nombres técnicos del modelo obliga a quien se suscribe a entender el modelo.

**No hay cuenta ni contraseña**: el enlace del correo es el acceso. Por eso el token va firmado y
lleva su propósito dentro de la firma — uno de verificación no sirve para gestionar.

### Doble opt-in

`POST /api/subscriptions` responde **siempre 202**, exista o no el correo: confirmar si una
dirección está registrada convertiría el endpoint en un oráculo de correos. Sin confirmar el enlace,
`listVerifiedSubscriptions()` no devuelve la suscripción y **no se envía ni un aviso**.

Las instituciones **no** pasan por opt-in: las da de alta un administrador, así que reciben desde el
primer incidente de su jurisdicción. Es la diferencia entre una señal ciudadana y un acto
administrativo.

### El proveedor de correo es sustituible

`EmailProvider` con implementación `mock`: no envía nada, y **la fila en `notification_deliveries`
es el registro del envío**. Cambiar a Resend o SES es implementar la misma interfaz. Sin ese
registro no habría antirruido, ni reintentos, ni forma de responder "¿avisaron o no?" — que es la
primera pregunta de cualquier institución.

### Qué lleva y qué no lleva el correo

Lleva nivel, score, las razones del Risk Score y la **zona aproximada** (~11 m, la misma proyección
pública del mapa). No lleva la foto, ni la ruta de la evidencia, ni la coordenada exacta, ni nada
del reportante. Y repite en cada envío que es información complementaria, no una alerta del COE ni
del 9-1-1.

**El pie cambia según el destinatario.** Un suscriptor recibe el enlace de baja en un clic; una
institución, una nota de que el aviso llega por su registro institucional. Ofrecerle "darse de baja"
a un ayuntamiento no tiene sentido: su canal es administrativo, no una suscripción.

### La bandeja — `/dashboard/notificaciones`

Solo operador. Cada fila muestra destinatario, asunto, contenido y **por qué** quedó en ese estado:

| Estado | Qué significa |
|---|---|
| `enviado` | Salió al destinatario. |
| `pendiente_verificacion` | Sin doble opt-in no se envía nada. |
| `pendiente_resumen` | La suscripción es de resumen: se agrupa. |
| `descartado_antirruido` | Ya se avisó de esa zona en las últimas 6 h. |
| `descartado_tope_diario` | El destinatario ya recibió 10 hoy. |
| `fallido` | El proveedor rechazó el envío. |

**Probarla — el ciclo completo, sin SMTP:**

```bash
# 1. suscribirse (siempre 202)
curl -X POST localhost:3000/api/subscriptions -H 'content-type: application/json' \
  -d '{"email":"vecina@ejemplo.do","scope":"todas","minLevel":"alto","digest":"inmediato","consent":true}'

# 2. la bandeja trae el enlace de confirmación (requiere sesión de operador)
curl -c cookie.txt -X POST localhost:3000/api/auth/operador \
  -H 'content-type: application/json' -d '{"code":"operador-demo"}'
curl -b cookie.txt localhost:3000/api/notifications

# 3. confirmar, y a partir de ahí los reportes generan avisos
curl "localhost:3000/api/subscriptions/verify?token=<token de la bandeja>"
```

### El canal institucional — `lib/institutions.ts` + `lib/webhooks.ts`

Una institución **no se auto-registra**: la da de alta un administrador. Es la diferencia entre una
señal ciudadana y un acto administrativo, y por eso las instituciones **no pasan por doble opt-in**.

**Credencial:** clave de servidor a servidor, guardada **hasheada** (sha256). Se acepta por
`Authorization: Bearer` y por `X-PuntoAlerta-Key`, porque los sistemas municipales rara vez pueden
elegir. La búsqueda es por hash: la clave en claro no existe en la base.

**Jurisdicción** = zonas × categorías. `GET /api/institutional/incidents` devuelve solo lo suyo, con
la misma proyección pública del mapa. En la demo:

| Institución | Ve |
|---|---|
| Ayuntamiento del Distrito Nacional | 17 incidentes: drenaje, basura, vías, inundación |
| Ministerio de Medio Ambiente | 8 incidentes: solo quema y basura |

**Cambio de estado por la institución:** `PATCH /api/institutional/incidents/:id`. Fuera de su
jurisdicción, `403` con el motivo:

> `Ayuntamiento del Distrito Nacional no tiene jurisdicción sobre este incidente (quema).`

Y una institución solo puede usar `validado`, `asignado`, `en_proceso`, `resuelto` y `descartado`:
no puede dejar un incidente en revisión ni marcarlo duplicado.

**Atribución en el historial** (docs/05 §3.3): `report_events` tiene `actor_type` y `actor_id`. El
historial deja de decir solo *qué* pasó y dice *quién* lo hizo:

```
09:14:44  →  reportado           [sistema]
11:18:53  reportado → validado   [institucion/inst-medioambiente]
```

**Webhook firmado** (§3.2): `X-PuntoAlerta-Signature` es un HMAC-SHA256 de `timestamp.cuerpo` — se
firma el timestamp junto al cuerpo precisamente para que reenviar la firma con otro timestamp no
sirva. Se rechazan timestamps de más de 5 minutos, y `X-PuntoAlerta-Delivery` permite a la
institución detectar el mismo aviso dos veces.

`POST /api/dev/webhook-sink` es una sonda local que hace de institución receptora: verifica la firma
igual que debería hacerlo un ayuntamiento y registra si el aviso es duplicado. Permite demostrar el
canal sin depender de un servidor externo.

**Probar el ciclo institucional:**

```bash
# la institución consulta su jurisdicción
curl -H "Authorization: Bearer pa_demo_ambiente_2026" \
  localhost:3000/api/institutional/incidents

# y cierra el ciclo desde su propio sistema
curl -X PATCH localhost:3000/api/institutional/incidents/<id> \
  -H "Authorization: Bearer pa_demo_ambiente_2026" \
  -H 'content-type: application/json' -d '{"status":"validado"}'
```

Las claves `pa_demo_*` son públicas a propósito: existen para que la demo corra sin dar de alta nada
a mano. En un despliegue real se generan al registrar la institución y se muestran una sola vez.

### Enrutamiento automático (RF-20) y el estado `derivado`

Al crear un reporte, `mostSpecific()` busca la institución cuya jurisdicción contiene el punto y
cuyas categorías incluyen la del incidente. Si la encuentra, **el reporte nace `derivado`** a esa
institución, no `reportado`.

Con varias candidatas gana la de **jurisdicción más pequeña** (la más específica); a igual tamaño, la
que declara menos categorías. Si no hay ninguna, el reporte queda en la cola general.

`derivado` significa *enrutado y notificado, pendiente de que la institución acepte o rechace*, así
que desde ahí solo se puede pasar a `validado` (acepta), `descartado` (rechaza con motivo) o
`duplicado`. No puede saltar a `en_proceso` ni volver a `reportado`.

En la demo, un reporte de quema se deriva solo:

```
categoría: quema | estado: derivado | derivado a: Ministerio de Medio Ambiente
```

El Ayuntamiento no lo recibe porque no declara `quema` entre sus categorías, y el Ministerio sí.

### Atestaciones

`POST /api/incidents/:id/atestacion?token=` con `sigue_igual`, `empeoro` o `ya_no_esta`. Quien
recibió el aviso responde con un clic, usando el mismo token de gestión del correo.

**Una atestación no cambia el estado.** Escribe un evento en el historial con
`actor_type: 'suscriptor'` y el estado de origen igual al de destino:

```
11:24:18  →  derivado             [sistema]     Reporte creado por ciudadano
11:24:37  derivado → derivado     [suscriptor]  Atestación: el problema empeoró
```

**Por qué no cierra incidentes:** el correo se reenvía. Un token capaz de marcar "resuelto"
permitiría sacar de la cola un drenaje crítico la noche antes de una lluvia — justo el caso que
justifica el producto. Cerrar exige institución u operador; atestiguar, solo haber recibido el
aviso. Y no se admiten atestaciones sobre incidentes ya cerrados.

---

## 15. Cómo correr la demo completa

```bash
npm install
npm run dev
curl -X POST http://localhost:3000/api/seed
npm test          # 60 tests unitarios
```

**El guion, en el orden que cuenta la historia:**

1. **`/` con *Sin lluvia*** → la zona de la Av. México marca **64/100 — Alto**. Abrir el desglose:
   severidad 9/10, 3 reportes en 14 días, 6 en 180, contexto con drenaje, agua acumulada y vía
   principal. *La zona ya requiere atención antes de que llueva.*
2. **Cambiar a *Lluvia intensa*** → la misma zona pasa a **84/100 — Crítico**. Ningún reporte
   cambió: el único factor que se movió es el meteorológico, y aporta exactamente 20 puntos.

   > "No apareció un problema nuevo. Cambió el contexto. PuntoAlerta RD identifica cuándo una
   > vulnerabilidad existente necesita convertirse en prioridad inmediata."

3. **`/reportar`** → foto de un imbornal; la IA propone *drenaje obstruido* con su confianza, se
   puede corregir y el riesgo se recalcula dejando un snapshot inmutable.
4. **`/dashboard`** → la zona crítica encabeza la cola; avanzar un estado y mostrar la auditoría.
5. **`/rutas`** → *Escenario de la demo*: la ruta directa cruza la zona crítica a 4 m del trazado;
   la alternativa llega con **+2 min y exposición 0**.

**Dos cosas que no hay que decir:**

- No decir *"estaba tranquilo y se volvió crítico"*. 64 ya es **Alto**. La narrativa correcta es
  "ya requería atención y el clima lo convirtió en prioridad inmediata".
- No presentar el score como probabilidad de inundación. Es nivel de riesgo/prioridad según las
  señales disponibles.

**Si preguntan "¿por qué pasó de 64 a 84?"**, el desglose de los cinco factores lo responde con el
número exacto que aportó cada uno. Ese desglose es parte de la demo, no un detalle técnico.

---

## 16. Tests — `npm test`

60 casos unitarios con Vitest, todos sobre módulos puros (sin base de datos ni red), que fijan
exactamente los casos del §22.2:

| Fichero | Qué fija |
|---|---|
| `tests/risk.test.ts` | Todos los factores a 0 → score 0. Todos al máximo → 100. Recorte a 0..100 con contexto de 120. Límites de nivel 25/26, 50/51, 75/76. Escalones del factor de lluvia. Sin pronóstico → factor 0 y razón sin mencionar clima. Determinismo. **Av. México: 64 alto en seco, 84 crítico con lluvia.** Cambiar solo el clima no altera los otros cuatro factores y la diferencia es exactamente 20. Un punto sin historial no llega a crítico ni con 120 mm. Los resueltos cuentan en historial pero no en severidad observada. Ventanas de 14 y 180 días y vecindad de 100 m. |
| `tests/status.test.ts` | Las 6 transiciones permitidas, las 6 prohibidas, ninguna transición a sí mismo y ninguna salida desde un estado terminal. |
| `tests/duplicates.test.ts` | Radio 19/20/21 y 59/60/61 m; ventana 2h59/3h01, 11h58/12h02, 23h58/24h02; misma categoría; ignora resueltos; excluye el propio reporte. |
| `tests/exposure.test.ts` | Sin zonas → 0. Fuera del radio no cuenta. Más cerca pesa más. Nivel más alto pesa más. Conteo de críticas y altas. Recorte a 100. Orden por score. Umbral del 40%. |
| `tests/validation.test.ts` | Lat/lng −90/90 y −180/180 y sus límites rotos. `formField` evita que un campo vacío se convierta en 0. Área de demo excluye (0,0). Nota 280/281. Imagen 8 MB. Formatos admitidos. Las seis categorías. |
| `tests/weather.test.ts` | Umbrales de aviso 4/15/40. `unavailable` devuelve ceros reales. Acumulados finitos y no negativos. |

**El test que más importa** es el que fija 64 y 84: si alguien cambia un peso, un escalón o el seed,
la demo se rompe en `npm test` y no delante del jurado.

**Lo que todavía no cubren:** integración con MSW y E2E con Playwright (§22.3, §22.4), y auditoría
a11y con axe (§22.5). Pendientes como P1 en el backlog.

---

