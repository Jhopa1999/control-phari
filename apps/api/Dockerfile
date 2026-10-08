# Dockerfile del backend NestJS (apps/api).
# Build context esperado: la RAIZ del monorepo (respeta npm workspaces).
# Multi-stage: deps -> build -> runtime.

# ---------- Base ----------
FROM node:24-bookworm-slim AS base
WORKDIR /repo
ENV NODE_ENV=production

# ---------- Dependencias (incluye dev para compilar) ----------
FROM base AS deps
ENV NODE_ENV=development
# Manifiestos del monorepo y de los workspaces necesarios para instalar.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/api-client/package.json packages/api-client/
COPY apps/web/package.json apps/web/
RUN npm ci

# ---------- Build ----------
FROM deps AS build
# Prisma (schema + config) y codigo fuente del backend.
COPY apps/api/ apps/api/
# Genera el Prisma Client y compila NestJS.
# Se conservan las devDependencies (prisma CLI + tsx) en la imagen para poder
# ejecutar "prisma migrate deploy" como paso explicito de despliegue
# (docker compose run --rm api npm run prisma:migrate:deploy ...).
RUN npm run prisma:generate --workspace apps/api \
  && npm run build --workspace apps/api

# ---------- Runtime ----------
FROM base AS runtime
WORKDIR /repo
# node_modules de produccion (incluye el delegate del adapter y @prisma/client).
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
# Artefactos del backend: compilado, cliente generado, schema y config.
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/src/generated ./apps/api/src/generated
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Ejecutar como usuario no-root (el usuario "node" ya existe en la imagen).
USER node

EXPOSE 3001
# DATABASE_URL y PORT se inyectan por variables de entorno (nunca en la imagen).
CMD ["node", "apps/api/dist/main.js"]
