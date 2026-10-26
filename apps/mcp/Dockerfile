# Dockerfile del servidor MCP (apps/mcp) para el transporte HTTP.
# Build context esperado: la RAIZ del monorepo (respeta npm workspaces).
# Multi-stage: deps -> build -> runtime. El MCP necesita el api-client COMPILADO.

# ---------- Base ----------
FROM node:24-bookworm-slim AS base
WORKDIR /repo
ENV NODE_ENV=production

# ---------- Dependencias (incluye dev para compilar TypeScript) ----------
FROM base AS deps
ENV NODE_ENV=development
# Manifiestos del monorepo y de los workspaces necesarios para instalar.
COPY package.json package-lock.json ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci

# ---------- Build ----------
FROM deps AS build
# El MCP consume @plantilla-portales/api-client por su salida COMPILADA; se
# construye primero.
COPY packages/api-client/ packages/api-client/
RUN npm run build --workspace packages/api-client
# Codigo fuente del MCP y compilacion a dist/.
COPY apps/mcp/ apps/mcp/
RUN npm run build --workspace apps/mcp

# ---------- Runtime ----------
FROM base AS runtime
WORKDIR /repo
# node_modules de produccion (incluye el SDK MCP y su @hono/node-server).
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
# Artefactos del MCP: compilado y manifiesto.
COPY --from=build /repo/apps/mcp/package.json ./apps/mcp/package.json
COPY --from=build /repo/apps/mcp/dist ./apps/mcp/dist
# api-client compilado (dependencia de ejecucion del MCP via workspace).
COPY --from=build /repo/packages/api-client/package.json ./packages/api-client/package.json
COPY --from=build /repo/packages/api-client/dist ./packages/api-client/dist

# Ejecutar como usuario no-root (el usuario "node" ya existe en la imagen).
USER node

EXPOSE 3002
# Toda la configuracion (MCP_TRANSPORT, MCP_HTTP_PORT, MCP_API_BASE_URL, ...) se
# inyecta por variables de entorno; nunca se hornean secretos en la imagen.
CMD ["node", "apps/mcp/dist/index.js"]
