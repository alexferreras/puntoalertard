# PuntoAlerta RD — imagen de ejecución
#
# Multi-etapa para que la imagen final no lleve compiladores ni node_modules
# completo. Tres cosas que no son obvias:
#
#   1. `better-sqlite3` es un módulo nativo: el binario tiene que compilarse
#      dentro de esta imagen (Linux). Copiar un build hecho en macOS no sirve.
#   2. `output: 'standalone'` deja en .next/standalone un servidor con solo las
#      dependencias que realmente usa, incluido el .node compilado.
#   3. `/app/data` se crea en la imagen y con dueño `node`. Docker copia esos
#      permisos al crear el volumen, y sin eso el proceso sin root no podría
#      escribir la base ni la evidencia.

# ── Dependencias ─────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS deps
WORKDIR /app

# Herramientas de compilación por si no hay binario preconstruido de
# better-sqlite3 para esta plataforma. Solo viven en esta etapa.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
# `npm ci` exige que el lock lo haya generado un npm compatible: se regenera con
# esta misma imagen (`docker run node:24 npm install --package-lock-only`).
RUN npm ci

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Telemetría fuera: no queremos llamadas salientes desde el build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Ejecución ────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runner
WORKDIR /app

# Puerto 8090: el 3000 lo ocupa EasyPanel y el 8088 finance-bot en el mismo VPS.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8090 \
    HOSTNAME=0.0.0.0

# El servidor standalone y los estáticos. El usuario `node` (uid 1000) ya existe
# en la imagen base; no se ejecuta nada como root.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Punto de montaje del volumen: la base SQLite, la evidencia y los respaldos.
RUN mkdir -p /app/data/uploads /app/data/backups && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 8090

# La sonda mira que la base sea legible, no solo que el proceso viva.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `server.js` ejecuta instrumentation.ts al arrancar: valida la configuración y
# aplica migraciones antes de aceptar peticiones. No hace falta un paso previo
# de migración como `alembic upgrade head`.
CMD ["node", "server.js"]
