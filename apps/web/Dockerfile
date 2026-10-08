# Dockerfile del frontend Next.js (apps/web).
# Build context esperado: la RAIZ del monorepo (respeta npm workspaces).
# Multi-stage: deps -> build -> runtime (salida standalone).

# ---------- Base ----------
FROM node:24-bookworm-slim AS base
WORKDIR /repo

# ---------- Dependencias ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/package.json apps/api/
RUN npm ci

# ---------- Build ----------
FROM deps AS build
# NEXT_PUBLIC_API_BASE_URL es publica y Next la incrusta en el bundle del
# cliente durante el build. En produccion, por defecto, el navegador consume la
# API mediante el mismo dominio bajo /api (Nginx hace el proxy).
ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
# El frontend consume el api-client (workspace); se construye primero.
COPY packages/api-client/ packages/api-client/
RUN npm run build --workspace packages/api-client
# Codigo del frontend y build de Next (output: standalone).
COPY apps/web/ apps/web/
RUN npm run build --workspace apps/web

# ---------- Runtime ----------
FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Salida standalone: incluye el server y solo las dependencias necesarias.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

USER node

EXPOSE 3000
# server.js del standalone queda en apps/web/ por la estructura del monorepo.
CMD ["node", "apps/web/server.js"]
