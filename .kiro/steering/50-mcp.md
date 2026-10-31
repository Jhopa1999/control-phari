---
inclusion: fileMatch
fileMatchPattern: 'apps/mcp/**'
---

# MCP (apps/mcp)

`apps/mcp` es el servidor Model Context Protocol del portal. Soporta dos
transportes: **stdio** (local, por defecto) y **HTTP** (por red, publicado
detrás de Nginx en `/mcp`). Expone operaciones del backend como _tools_ MCP para
que un LLM opere el portal.

Es una **capa delgada**. Toda la lógica de negocio, autorización, validación de
dominio y acceso a datos vive en `apps/api`. El MCP solo traduce entrada/salida
y errores. Su contrato de referencia es `apps/mcp/README.md`; respétalo.

# Reglas obligatorias

- El MCP NO implementa una segunda lógica de negocio. No duplica reglas, ni
  autorización, ni validaciones de dominio que ya pertenecen a `apps/api`. Esto
  aplica igual en stdio y en HTTP: el transporte HTTP solo transporta identidad
  y mensajes; no añade lógica de dominio.
- El MCP NO usa Prisma ni se conecta a PostgreSQL. Consume el backend a través
  del cliente tipado `@plantilla-portales/api-client` (generado desde OpenAPI).
- Las tools mapean el contrato OpenAPI del backend. No inventes tools ni campos
  fuera del contrato. Si una tool necesita una capacidad nueva, primero existe
  en `apps/api` y en el contrato; el MCP la reutiliza después.
- No hay tipado manual de contratos: cuerpos, parámetros y respuestas salen del
  cliente tipado generado (incluido `POST /auth/login`, cuyo cuerpo
  `LoginRequestDto` ya está en el contrato). Los esquemas de entrada de las tools
  se derivan del OpenAPI.
- Todo cambio de API actualiza, en el mismo PR, el contrato, el MCP y la
  documentación: ver `.kiro/steering/55-sincronia-api-mcp-docs.md`. Cada tool
  declara anotaciones (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

# Identidad y secretos

- **stdio** (sin cambios): identidad por entorno. Modo `dev-header` (default,
  cabecera `X-Actor-Id`) o `jwt`. `MCP_AUTH_MODE` debe coincidir con el
  `AUTH_MODE` del backend. Solo el valor exacto `jwt` activa JWT. El token JWT
  vive **solo en memoria**; el login es **perezoso** y el re-login reactivo ante
  401 solo aplica a la vía de credenciales en memoria (un único reintento).
- **HTTP** (`MCP_TRANSPORT=http`): identidad **por persona y por petición**. Cada
  request trae `Authorization: Bearer <token>` y el MCP lo reenvía al backend
  para esa sesión/petición. No hay token a nivel de proceso: dos usuarios
  concurrentes nunca comparten identidad. Sin `Bearer` válido => **401** (nunca
  un usuario por defecto). `dev-header` NO existe en HTTP; en producción
  `AUTH_MODE=jwt`. Las variables de identidad de stdio (`MCP_ACTOR_ID`,
  `MCP_API_TOKEN`, `MCP_LOGIN_*`) se ignoran en HTTP.
- El token (stdio o HTTP) **nunca** se escribe a disco ni a logs.
- Toda la configuración viene de variables de entorno (fail-fast validando solo
  presencia; en http se validan además `MCP_HTTP_HOST`/`MCP_HTTP_PORT`). No
  hardcodear valores. Mantener `apps/mcp/.env.example` con nombres y placeholders
  seguros; los secretos van vacíos y nunca se versionan.

# Protocolo y logging

- **stdout está reservado al protocolo MCP.** Todo logging del servidor va a
  **stderr**. En HTTP los diagnósticos van a stderr y NUNCA incluyen el token.
- Un fallo de configuración es fatal (código != 0, mensaje a stderr remitiendo a
  `.env.example`). Un fallo de login NO es fatal (el login es perezoso).

# Build, dependencias y pruebas

- El MCP consume `@plantilla-portales/api-client` por su salida compilada. Antes
  de typecheck/build del MCP hay que construir el cliente: `npm run
  build:api-client`, luego `npm run typecheck:mcp` y `npm run build:mcp`.
- Workspace ESM puro. Las pruebas usan el runner nativo de Node (`node --test`),
  sin red y sin reglas de negocio (eso corresponde a `apps/api`). No agregues
  Jest ni otra librería de testing a este workspace.
- El transporte HTTP usa el `StreamableHTTPServerTransport` del SDK MCP (que ya
  incluye `@hono/node-server`): NO agregues express, hono ni otras dependencias.
  No agregues dependencias ni infraestructura sin necesidad demostrada. Mantén
  la capa delgada: ante la duda, la capacidad pertenece al backend.
