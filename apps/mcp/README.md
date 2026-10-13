# @plantilla-portales/mcp

Servidor **Model Context Protocol** (transporte **stdio**) de la plantilla de
portales. Expone, como _tools_ MCP, las operaciones del backend (`apps/api`)
mapeadas **1:1** al contrato OpenAPI, para que un LLM pueda operar el portal.

Es una **capa delgada**: no contiene lógica de negocio, ni autorización, ni
validación de dominio, ni accede a Prisma/PostgreSQL. Toda esa responsabilidad
vive en `apps/api`. El MCP reutiliza el cliente tipado `@plantilla-portales/api-client`
(generado desde OpenAPI) y solo traduce entrada/salida y errores.

- **stdout está reservado al protocolo MCP.** Todo logging del servidor va a
  **stderr**.
- El **token JWT vive solo en memoria** del proceso; nunca se escribe a disco ni
  a logs.

## Variables de entorno

Se configuran por entorno (no se hardcodea nada). Copia `apps/mcp/.env.example`
a tu `.env` local y define los valores. Los secretos (`MCP_API_TOKEN`,
`MCP_LOGIN_PASSWORD`) tienen placeholder **vacío** en el ejemplo y **no** deben
versionarse.

| Variable                | Obligatoria              | Descripción                                                                 |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `MCP_API_BASE_URL`      | Sí                       | URL base de `apps/api` (sin credenciales). Si falta, el proceso aborta.     |
| `MCP_AUTH_MODE`         | No (default `dev-header`)| `jwt` activa autenticación real; cualquier otro valor se trata `dev-header`.|
| `MCP_ACTOR_ID`          | Sí en `dev-header`       | Identidad enviada en la cabecera `X-Actor-Id`.                              |
| `MCP_API_TOKEN`         | Vía (a) en `jwt`         | JWT ya emitido. **Secreto.** No admite re-login ante 401.                   |
| `MCP_LOGIN_IDENTIFIER`  | Vía (b) en `jwt`         | Identificador para `POST /auth/login` (login perezoso).                     |
| `MCP_LOGIN_PASSWORD`    | Vía (b) en `jwt`         | Contraseña para el login. **Secreto.**                                      |

El `MCP_AUTH_MODE` debe coincidir con el `AUTH_MODE` del backend.

## Modos de identidad

- **`dev-header`** (default): requiere `MCP_ACTOR_ID`. Cada petición envía
  `X-Actor-Id`. Útil con el backend en modo desarrollo.
- **`jwt`**: requiere **una** vía de credencial:
  - **Vía (a) token directo** — define `MCP_API_TOKEN`. Se envía
    `Authorization: Bearer <token>`. **No** hay re-login reactivo: ante un 401 la
    operación falla.
  - **Vía (b) credenciales de login** — define `MCP_LOGIN_IDENTIFIER` +
    `MCP_LOGIN_PASSWORD`. El MCP hace `POST /auth/login` de forma **perezosa**
    (nunca al arrancar) y guarda el token en memoria. Admite **re-login reactivo**
    ante un 401 (un único reintento).

Si en modo `jwt` se definen ambas vías, prevalece el token directo.

## Build y arranque

El MCP consume `@plantilla-portales/api-client` por su salida compilada
(`dist`), así que **antes** de typecheck/build del MCP hay que construir el
cliente. Desde la raíz del monorepo:

```bash
# Precondición: construir el cliente de API y verificar tipos del MCP
npm run build:api-client
npm run typecheck:mcp

# Construir el MCP
npm run build:mcp

# Arrancar (ejemplo en modo dev-header)
MCP_API_BASE_URL=http://localhost:3001 MCP_ACTOR_ID=jefe@demo.local \
  node apps/mcp/dist/index.js
```

En Windows PowerShell:

```powershell
$env:MCP_API_BASE_URL = "http://localhost:3001"
$env:MCP_ACTOR_ID = "jefe@demo.local"
node apps/mcp/dist/index.js
```

El arranque solo falla por **configuración faltante** (fail-fast con mensaje a
stderr). Un fallo de login **no** es fatal: el login es perezoso.

## Pruebas

**Framework: runner nativo de Node (`node --test`).** El workspace es ESM puro;
el runner nativo evita la fricción de configurar Jest-ESM y no añade
dependencias nuevas. Las pruebas son unitarias y **sin red** (config, mapeo de
errores e `inputSchema` de tools representativas con el api-client mockeado); no
prueban reglas de negocio (eso corresponde a `apps/api`). El agregado
`test:unit` de la raíz sigue cubriendo solo `apps/api` y no se toca.

```bash
npm run test --workspace apps/mcp
```

El script compila primero (`tsconfig.test.json` -> `dist-test/`, directorio
ignorado por git) y luego ejecuta `node --test`.

## Smoke test por stdio (sin backend vivo)

Verifica el handshake MCP y que `tools/list` devuelve todas las tools con su
`inputSchema`, **sin** necesidad de un backend corriendo (el login es perezoso).

PowerShell (Windows):

```powershell
$env:MCP_API_BASE_URL = "http://localhost:3001"
$env:MCP_ACTOR_ID = "smoke@demo.local"
$msgs = @(
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}',
  '{"jsonrpc":"2.0","method":"notifications/initialized"}',
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
) -join "`n"
$msgs | node apps/mcp/dist/index.js
```

bash/zsh:

```bash
export MCP_API_BASE_URL=http://localhost:3001
export MCP_ACTOR_ID=smoke@demo.local
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node apps/mcp/dist/index.js
```

La respuesta a `initialize` anuncia `serverInfo` y la de `tools/list` lista
todas las tools, cada una con su `inputSchema` (JSON Schema). El logging de
arranque sale por stderr; stdout contiene solo las respuestas JSON-RPC.
