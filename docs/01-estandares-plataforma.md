|     |
|-----|

**PUNTOALERTA RD**

Plataforma Inteligente de Riesgo Urbano y Resiliencia Ambiental

Documento de concepto, alcance, estándares y propuesta de valor

<img src="media/image1.png" title="Señales ciudadanas conectadas" style="width:5.9in;height:2.36in" alt="Constelación decorativa de puntos y estrellas que representa señales ciudadanas conectadas." />

| **Versión** | 1.0 |
|----|----|
| **Propósito** | Explicar PuntoAlerta RD de forma consistente a equipo, jurado, aliados técnicos y potenciales instituciones. |

*Identidad visual: blanco + morado + dorado, con una constelación de estrellas como símbolo de señales ciudadanas conectadas. La identidad evita copiar logotipos, proporciones o símbolos de organizaciones políticas.*

# Contenido

> **01 Resumen ejecutivo**
>
> **02 Problema y oportunidad en RD**
>
> **03 Qué es PuntoAlerta RD**
>
> **04 Diferencial frente a soluciones existentes**
>
> **05 Usuarios y casos de uso**
>
> **06 Modelo funcional end-to-end**
>
> **07 Inteligencia de riesgo**
>
> **08 Clima y prevención**
>
> **09 Rutas de menor exposición**
>
> **10 Modelo de datos y ciclo de vida**
>
> **11 Gobernanza, privacidad y seguridad**
>
> **12 Identidad visual y accesibilidad**
>
> **13 Métricas de éxito**
>
> **14 Roadmap**
>
> **15 Supuestos, límites y riesgos**
>
> **16 Referencias validadas**

# 1. Resumen ejecutivo

**PuntoAlerta RD** es una plataforma digital que convierte reportes ciudadanos geolocalizados en señales de riesgo urbano útiles para prevención, priorización operativa y respuesta. El ciudadano toma una foto o video de una condición observable —por ejemplo, basura acumulada, drenaje obstruido, agua acumulada o vía afectada— y el sistema registra ubicación y hora, clasifica la evidencia con IA y la incorpora a un mapa vivo de incidentes.

**El valor diferencial no es solamente recibir denuncias.** PuntoAlerta RD conserva y combina las señales con recurrencia, historial, condiciones meteorológicas y contexto geográfico para generar un Risk Score explicable. Cuando cambia el pronóstico, un punto puede cambiar de prioridad, permitiendo identificar dónde conviene intervenir antes de que el problema escale.

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Propuesta de valor en una frase</strong></p>
<p>Usar lo que la ciudad reporta hoy para identificar qué punto atender primero y reducir exposición al riesgo mañana.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- **Modo ciudadano:** reportar en menos de 30 segundos y consultar incidentes/riesgo cercano.

- **Modo operativo:** priorizar incidentes y organizar rutas de intervención para brigadas.

- **Modo preventivo:** recalcular prioridad cuando cambia el clima o aumenta la recurrencia.

- **Modo movilidad:** comparar alternativas de ruta según exposición a incidentes conocidos, sin sustituir instrucciones oficiales.

# 2. Problema y oportunidad en República Dominicana

RD ya cuenta con canales de denuncia ambiental; por eso el proyecto no debe presentarse como “la primera app para reportar basura”. Línea Verde RD permite denuncias con fotos/videos y seguimiento \[S1\]. La oportunidad es transformar reportes dispersos y reactivos en inteligencia preventiva y operacional.

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Dato que sostiene el problema</strong></p>
<p>En octubre de 2025, Presidencia reportó que el Gobierno y el Ayuntamiento del Distrito Nacional habían reforzado 50 de 75 puntos críticos de drenaje de la capital. Esos puntos se definieron considerando historial de inundaciones, acumulación de residuos, densidad poblacional y conectividad con redes de drenaje y transporte [S2].</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Ese criterio es muy cercano a la lógica de PuntoAlerta RD: combinar señales urbanas, historial y contexto para priorizar. Además, el mismo reporte oficial menciona un piloto de semáforos pluviales y el uso de videovigilancia del 9-1-1 para detectar niveles de agua y reposicionar equipos \[S2\]. Esto valida que existe necesidad institucional de monitoreo y priorización en tiempo real.

- Un reporte aislado sirve para responder a una incidencia; una serie histórica de reportes sirve para descubrir recurrencia.

- La lluvia prevista cambia el nivel de riesgo de una obstrucción que, en condiciones secas, podría ser de baja prioridad.

- La información ciudadana puede aportar granularidad de calle o esquina que complemente las alertas macro de organismos oficiales.

- Los datos abiertos de INDOMET permiten explorar posteriormente correlaciones históricas entre precipitación e incidencias \[S3\].

# 3. Qué es PuntoAlerta RD

PuntoAlerta RD es una capa de inteligencia cívica y ambiental compuesta por cinco capacidades: captura, comprensión, priorización, visualización y acción.

| **Capacidad** | **Qué hace** | **Resultado** |
|----|----|----|
| Captura | Foto/video + GPS + fecha/hora + nota opcional. | Incidente geolocalizado. |
| Comprensión | IA propone categoría, severidad y señales visibles. | Datos estructurados. |
| Priorización | Risk Engine combina severidad, recurrencia, clima e historial. | Nivel 0-100 + razones. |
| Visualización | Mapa público y dashboard operacional. | Contexto espacial y hotspots. |
| Acción | Cola priorizada, ruta de brigada y comparación de rutas. | Decisiones accionables. |

## Objetivos del producto

- Reducir fricción para reportar condiciones ambientales/urbanas observables.

- Transformar evidencia no estructurada en incidentes normalizados.

- Detectar duplicados y recurrencia para evitar ruido y revelar patrones.

- Ajustar prioridad según condiciones meteorológicas y contexto histórico.

- Ofrecer información explicable: siempre mostrar por qué un punto tiene cierto riesgo.

- Mantener separación clara entre “señal ciudadana”, “validación operativa” y “alerta oficial”.

## No objetivos del MVP

- No emitir alertas oficiales de emergencia ni sustituir al COE, INDOMET, 9-1-1 o autoridades municipales.

- No afirmar que una calle es segura; únicamente indicar exposición relativa a incidentes conocidos.

- No identificar automáticamente infractores ni emitir sanciones.

- No entrenar un modelo propio de predicción de inundaciones durante el hackathon.

- No cubrir todo el país desde el primer día; se demostrará una zona acotada.

# 4. Diferencial frente a soluciones existentes

| **Dimensión** | **Canal tradicional de denuncia** | **PuntoAlerta RD** |
|----|----|----|
| Entrada | Formulario / evidencia. | Evidencia + GPS con clasificación asistida. |
| Unidad principal | Caso o denuncia. | Incidente + zona + patrón. |
| Después de resolver | El caso se cierra. | El historial sigue alimentando recurrencia. |
| Clima | Normalmente separado. | Recalcula prioridad según pronóstico. |
| Duplicados | Pueden entrar como casos separados. | Se agrupan como evidencia del mismo punto. |
| Explicabilidad | Estado del caso. | Risk Score + factores que lo elevan. |
| Movilidad | No es el foco. | Compara exposición de alternativas de ruta. |

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Posicionamiento recomendado</strong></p>
<p>“No somos otro buzón de quejas. Convertimos señales ciudadanas en una capa de inteligencia para priorizar, anticipar y responder mejor.”</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 5. Usuarios y casos de uso

## Ciudadano

- Reportar una condición en menos de 30 segundos.

- Ver el estado del reporte y si fue agrupado con otros.

- Consultar mapa público sin exponer datos personales ni evidencia sensible.

- Comparar alternativas de movilidad con indicación de exposición a puntos conocidos.

## Operador municipal / brigada

- Ver cola ordenada por riesgo y severidad.

- Validar/corregir clasificación de IA.

- Cambiar estados: reportado, validado, asignado, en proceso, resuelto, descartado.

- Generar secuencia sugerida de intervención.

## Suscriptor (persona que quiere estar al tanto)

- Registrarse con solo un correo y elegir si quiere avisos de todas las zonas o de zonas concretas.

- Activar o desactivar los avisos cuando quiera, y darse de baja en un clic.

- Recibir aviso cuando una zona de su interés sube de nivel o cuando se prevé lluvia sobre un punto
  ya crítico.

- Atestiguar con un clic si el problema sigue, empeoró o desapareció.

Detalle completo en `05-notificaciones-y-suscripciones.md`.

## Institución integrada (ayuntamiento, ministerio, brigada)

- Recibir los incidentes de su jurisdicción por webhook firmado, por API o por correo.

- Cambiar el estado de un incidente desde su propio sistema, sin entrar al dashboard.

- Delegar en colaboradores verificados que también puedan cerrar el ciclo.

- Quedar registrada como autora de cada cambio en el historial de auditoría.

## Analista / planificación

- Identificar hotspots recurrentes.

- Comparar cantidad de incidentes por categoría y zona.

- Revisar puntos que reaparecen después de ser resueltos.

- Explorar correlaciones con lluvia e historial en fases posteriores.

# 6. Modelo funcional end-to-end

**1.** El usuario abre la PWA y selecciona “Reportar un punto”.

**2.** La aplicación solicita permiso de ubicación únicamente cuando es necesario y explica el uso.

**3.** El usuario toma/sube una foto. Video se considera P1; el MVP puede iniciar con una imagen.

**4.** Se valida tipo, tamaño y dimensiones del archivo antes de enviar.

**5.** El backend guarda el reporte con estado REPORTADO y media privada.

**6.** El proveedor de visión analiza la imagen y devuelve JSON estructurado con categoría, severidad, señales y confianza.

**7.** El sistema valida el JSON contra un esquema estricto; si falla, marca NEEDS_REVIEW sin bloquear el reporte.

**8.** Se ejecuta búsqueda geoespacial de posibles duplicados en un radio y ventana temporal configurables.

**9.** Se obtiene contexto meteorológico de la zona.

**10.** El Risk Engine calcula score y razones. No utiliza una caja negra en el MVP.

**11.** El mapa y dashboard se actualizan.

**11b.** Si el incidente cae en la jurisdicción de una institución registrada, se deriva y se le
notifica por su canal (webhook, API o correo).

**11c.** Los suscriptores cuyo alcance incluye la zona reciben aviso si se cumple su filtro de nivel
y de evento, con antirruido por zona y tope diario.

**12.** Un operador puede validar, asignar y resolver el incidente.

**13.** El incidente resuelto deja de mostrarse como activo, pero su registro anonimizado continúa aportando a recurrencia/historial.

# 7. Inteligencia de riesgo

El Risk Score del MVP será determinista y explicable. Debe representar prioridad operativa, no una probabilidad científica de inundación. El score se normaliza de 0 a 100 y debe guardar también sus componentes para auditoría.

| **Factor** | **Peso MVP** | **Ejemplo de entrada** |
|----|----|----|
| Severidad observada | 30% | IA + corrección de operador, 0-100. |
| Recurrencia reciente | 25% | Número de incidentes similares cercanos. |
| Lluvia pronosticada | 20% | Precipitación acumulada próxima, normalizada. |
| Historial del punto | 15% | Incidentes históricos de la zona. |
| Contexto adicional | 10% | Vía principal, drenaje, alerta oficial manual, etc. |

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Regla de seguridad</strong></p>
<p>La interfaz nunca debe presentar el score como “probabilidad de que ocurra una inundación”. Debe etiquetarse “Nivel de riesgo/prioridad según señales disponibles”.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

El clima pesa 0.20, así que puede aportar 20 puntos como máximo. Es una propiedad deseada del modelo, no una limitación: **la lluvia no crea el riesgo, activa o intensifica una vulnerabilidad que ya existe**. Un punto sin severidad, recurrencia ni historial no llega a crítico porque cambie el pronóstico.

Niveles sugeridos: 0-25 BAJO, 26-50 MODERADO, 51-75 ALTO, 76-100 CRÍTICO. El color nunca será la única señal: cada estado tendrá texto, icono y valor numérico para cumplir con WCAG 2.2 \[S4\].

# 8. Clima y prevención

Para el MVP se usa un WeatherProvider desacoplado. Open-Meteo permite consultar pronóstico horario por latitud/longitud y variables como precipitación \[S8\]. Esto evita depender de que exista una API pública oficial en tiempo real. INDOMET seguirá siendo referencia institucional y fuente potencial de datos históricos \[S3\].

- El sistema consulta lluvia prevista para las próximas 1, 3 y 6 horas.

- Se almacena un snapshot con timestamp para que el score sea reproducible.

- Si el proveedor falla, se conserva el último snapshot válido y se marca como STALE; el reporte sigue funcionando.

- En el demo se permite “Modo simulación” para demostrar cómo cambia el mapa ante lluvia intensa sin falsificar que es el pronóstico real.

# 9. Rutas de menor exposición

OSRM ofrece rutas, alternativas, matrices de tiempo/distancia, nearest y trip planning sobre datos de OpenStreetMap \[S9\]. PuntoAlerta RD usa esas rutas como candidatas y calcula exposición a incidentes activos cercanos a cada geometría.

<table style="width:97%;">
<colgroup>
<col style="width: 97%" />
</colgroup>
<thead>
<tr>
<th><p><strong>Terminología obligatoria</strong></p>
<p>Usar “ruta de menor exposición a incidentes conocidos” o “alternativa con menor exposición”. No usar “ruta segura” ni “ruta oficial de evacuación”. Las instrucciones oficiales siempre tienen prioridad.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- Ruta ciudadana: compara 2-3 alternativas y muestra tiempo, distancia, puntos de riesgo cercanos y score de exposición.

- Ruta de brigada: ordena múltiples puntos de intervención por prioridad y distancia; para MVP puede usar OSRM Trip/Table.

- No bloquear una calle basándose únicamente en una foto ciudadana no validada; aplicar una penalización de exposición y mostrar confianza/estado.

# 10. Modelo de datos y ciclo de vida

| **Entidad** | **Responsabilidad** | **Retención / privacidad** |
|----|----|----|
| Incident | Incidente canónico geolocalizado. | Histórico anonimizado para recurrencia. |
| Report | Aporte individual del ciudadano. | Minimizar PII; conservar trazabilidad. |
| Media | Foto/video original. | Privada; no se expone en mapa público. |
| AI Analysis | Clasificación y confianza. | Versionada por proveedor/modelo/prompt. |
| Risk Snapshot | Score + factores + clima. | Inmutable para auditoría. |
| Weather Snapshot | Datos meteorológicos usados. | TTL operativo + histórico mínimo. |
| Incident Event | Cambios de estado. | Auditoría. |

| Subscriber | Persona suscrita a avisos. | Solo el correo, cifrado; hash en logs; borrado en un clic. |
| Subscription | Alcance y filtros de los avisos. | Sin PII adicional. |
| Institution | Institución registrada con jurisdicción y credenciales. | Credenciales hasheadas; se muestran una sola vez. |
| Notification Delivery | Un intento de envío por canal. | Auditoría del "¿avisaron o no?" y base del antirruido. |

Estados canónicos: REPORTED → NEEDS_REVIEW/VALIDATED → ASSIGNED → IN_PROGRESS → RESOLVED. Estados terminales alternativos: DISMISSED o DUPLICATE. Con integración institucional se añade DERIVADO (enrutado y notificado, pendiente de que la institución lo acepte o lo rechace). Todo cambio de estado debe generar un evento de auditoría **con el actor que lo hizo** (operador, institución, colaborador, suscriptor o sistema).

# 11. Gobernanza, privacidad y seguridad

La Ley 172-13 protege datos personales en RD \[S6\]. El diseño debe aplicar minimización desde el MVP. Las evidencias pueden capturar rostros, placas, viviendas o personas que no consintieron; por ello no deben publicarse directamente.

- **Datos mínimos:** no exigir nombre, cédula, teléfono ni correo para reportar.

- **Sesión anónima:** identificador aleatorio local para seguimiento básico; no se usa como identidad legal.

- **Media privada:** bucket privado; acceso administrativo mediante URL firmada y expiración corta.

- **Mapa público:** mostrar categoría, zona aproximada, riesgo y estado, no imagen original ni coordenada exacta si existe riesgo de privacidad.

- **Administración:** autenticación, roles y Row Level Security; principio de mínimo privilegio \[S10\].

- **Seguridad:** usar OWASP ASVS 5.0.0 como lista de verificación base \[S5\].

- **Suscripciones:** el correo de un suscriptor es el **primer y único dato personal** que la
  plataforma almacena. Exige consentimiento explícito, doble opt-in como prueba, cifrado en reposo,
  hash en logs, retención máxima de 24 meses sin actividad y baja en un clic. Los endpoints de
  suscripción responden igual exista o no el correo, para no funcionar como oráculo de direcciones.

- **Cambio de estado por terceros:** un aviso por correo se reenvía. Por eso un suscriptor cualquiera
  no puede cambiar el estado de un incidente: solo atestiguar. Cerrar el ciclo requiere ser
  institución o colaborador elevado por una institución, y todo cambio queda atribuido.

- **Sanciones:** PuntoAlerta RD no determina culpabilidad ni automatiza multas.

# 12. Identidad visual y accesibilidad

La paleta usa blanco, morado y dorado porque fueron solicitados para la identidad del proyecto. Se diseñó deliberadamente una combinación propia: no debe copiar tonos exactos, estrella única, proporciones, tipografía ni composición de un partido u organización política. El símbolo recomendado es una constelación de varias señales/estrellas conectadas.

| **Token** | **Color** | **Uso** | **Contraste recomendado** |
|----|----|----|----|
| Purple 900 | \#3B1558 | Headers, fondos fuertes. | Blanco: 14.64:1 |
| Purple 700 | \#532275 | Botón primario, links, foco. | Blanco: 11.33:1 |
| Purple 500 | \#7542A6 | Acentos/hover grande. | Blanco: 6.80:1 |
| Gold 500 | \#F4C542 | Highlights, estrellas, badges. | Ink: 10.45:1 |
| Gold 700 | \#8C5A00 | Texto/acento sobre blanco. | Blanco: 5.87:1 |
| Ink | \#24172D | Texto principal. | Blanco: 17.00:1 |
| Canvas | \#FAF8FC | Fondo de aplicación. | Ink: 16.11:1 |

El estándar objetivo es WCAG 2.2 AA \[S4\]. Texto normal requiere al menos 4.5:1 y texto grande 3:1. Color no puede ser el único mecanismo para transmitir riesgo.

- Tipografía: Inter o system sans; cuerpo mínimo 16 px en móvil.

- Espaciado base: 4 px; componentes en múltiplos de 4/8 px.

- Radio: 14 px para cards, 12 px inputs, 999 px badges/pills.

- Foco: outline 3 px Purple 500 con offset de 2 px.

- Estrellas: decoración de fondo o “señales conectadas”; nunca usar una sola estrella amarilla central como logotipo.

- Riesgo: usar icono + etiqueta + valor; patrones/contornos para mapas cuando sea necesario.

# 13. Métricas de éxito

| **Métrica** | **MVP / demo** | **Futuro real** |
|----|----|----|
| Tiempo para reportar | ≤ 30 s en prueba manual. | Mediana \< 25 s. |
| Clasificación IA | Schema válido ≥ 95% en dataset demo. | Precisión por categoría con ground truth. |
| Duplicados | Detectar escenarios sembrados. | Precision/recall de clustering. |
| Risk Score | 100% explicable y reproducible. | Correlación con eventos observados. |
| Mapa | Carga y filtros sin error. | P95 \< 2 s con volumen real. |
| Accesibilidad | Sin violaciones críticas axe. | WCAG 2.2 AA auditada. |
| Operaciones | Generar top prioridades y ruta. | Tiempo/combustible ahorrado. |

# 14. Roadmap

| **Fase** | **Alcance** |
|----|----|
| MVP hackathon | Foto, GPS, IA, mapa, score explicable, clima, dashboard, rutas demo. |
| Piloto | Moderación, **suscripciones por correo con doble opt-in**, **integración municipal por webhook firmado con cambio de estado**, datos reales de una zona. |
| V1 | Routing robusto, historial, métricas operativas, privacidad de media avanzada. |
| V2 | Integración oficial de alertas/datos, modelos predictivos validados, múltiples municipios. |
| V3 | Plataforma nacional interoperable para distintos riesgos urbanos/ambientales. |

# 15. Supuestos, límites y riesgos

| **Riesgo** | **Decisión / mitigación** |
|----|----|
| Reportes falsos o equivocados | Tratar como señal; confianza, moderación, duplicados y rate limit. |
| IA clasifica mal | Usuario confirma; operador corrige; guardar modelo/prompt/confianza. |
| Pronóstico no disponible | Fallback al último snapshot + marca STALE; el sistema no se cae. |
| Mapa induce falsa seguridad | No usar “seguro”; mostrar cobertura limitada y fecha de actualización. |
| Privacidad de imagen | Media privada; no publicar rostros/placas; sanitización futura. |
| Scope excesivo | P0 cerrado; video, notificaciones y automatización institucional son P1/P2. |

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
