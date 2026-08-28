# PuntoAlerta RD

Plataforma de riesgo urbano para el Gran Santo Domingo (hackathon). La spec funcional
(RF-01..RF-20, RNF-01..RNF-14) y los estándares están en `docs/` y en el documento
"PuntoAlerta RD — Plataforma Inteligente de Riesgo Urbano". Lee el README antes de tocar código.

Convenciones de este repo:

- Comentarios y textos de UI en español. Los comentarios explican el *por qué*, no el *qué*.
- Sin punto y coma, comillas simples, `type`/`interface` explícitos en fronteras de módulo.
- Toda integración externa (visión, clima, routing) degrada sin romper la demo: nunca lanzar
  hacia la UI, siempre devolver un resultado marcado como respaldo.
- Ningún número de riesgo se devuelve sin la frase que lo explica (RNF-10).
- `lib/db.ts` y `lib/storage.ts` usan `node:fs`: no importarlos desde componentes de cliente.
- Verificación mínima antes de dar algo por hecho: `npm run verify` (lint, tsc, tests, build y
  comprobación de secretos en el bundle) y una llamada real al endpoint tocado.
- Un componente de cliente **no** puede importar valores de módulos que importen `lib/env.ts`
  (`lib/db.ts`, `lib/weather.ts`, `lib/auth.ts`…). Para lo compartido existe `lib/weather-shared.ts`
  y `lib/limits.ts`; `npm run check:secrets` lo vigila.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
