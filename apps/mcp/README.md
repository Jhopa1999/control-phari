# @plantilla-portales/mcp

Servidor **Model Context Protocol** de la plantilla de portales. Soporta dos
transportes: **stdio** (local, por defecto) y **HTTP** (por red, ver más abajo).
Expone, como _tools_ MCP, las operaciones del backend (`apps/api`) mapeadas
**1:1** al contrato OpenAPI, para que un LLM pueda operar el portal.

## Catálogo declarativo de tools

Las tools no se escriben a mano: son **entradas de datos** en
`src/tools/specs/*.ts` (un archivo por dominio), cada una con `name`,
`operation` (`'METHOD /path'` del contrato), `description` en español y `access`
(`read` | `write` | `destructive`). El motor genérico (`src/tools/openapi.ts` y
`register.ts`) deriva de cada entrada:

- el **esquema de entrada** (zod, vía `z.fromJSONSchema`) desde el OpenAPI;
  argumentos **planos**: parámetros de ruta con su nombre (`id`, `requestId`...),
  parámetros de query con su nombre (`active`, `objectType`...) y `body` de
  primer nivel con el DTO del contrato (objetos cerrados, sin claves libres);
- la **llamada** al api-client (con re-login reactivo ante 401 y traducción de
  errores) y el `resourceId` de los 404 (primer parámetro de ruta);
- las **anotaciones** MCP: `readOnlyHint` solo en `read`; `destructiveHint` solo
  en `destructive` (`DELETE` y `plan.import`); `idempotentHint` en
  GET/PATCH/PUT/DELETE.

`optionalBody: true` hace opcional el `body` y envía `{}` si falta (DTO con todos
los campos opcionales: `plan.submit`, `plan.authorize`, avance y aprobación de
gates). Las únicas tools manuales son `health.check` y `dev.actors.list`
(`src/tools/manual.ts`), por su comportamiento propio.

El contrato llega al MCP **en runtime** desde `@plantilla-portales/api-client`
(`import '@plantilla-portales/api-client/openapi.json'`): `npm run
contracts:generate` copia `apps/api/openapi/openapi.json` a
`packages/api-client/src/generated/openapi.json` y el build lo deja en
`dist/generated/` (el Dockerfile solo copia ese paquete).

### Cómo añadir una tool

1. Asegura que la operación existe en la API y en el contrato (`npm run
   contracts:generate`).
2. Añade **una entrada** al archivo de su dominio en `src/tools/specs/` (o crea
   uno y regístralo en `specs/index.ts`).
3. Quita la operación de `src/tools/exclusions.ts` y **baja `MAX_PENDIENTES`**.
4. `npm run test:mcp`. No hay código por tool.

### Exclusiones y guard de cobertura

`src/tools/exclusions.ts` lista las operaciones del contrato que **no** se
exponen, cada una con su motivo: **permanentes** (autenticación, administración,
descargas/subidas binarias, `/health/ready`, sugerencia de IA) y **PENDIENTE**
(se expondrán en las siguientes entregas; acotadas por `MAX_PENDIENTES`, que solo
puede bajar). El test `src/__tests__/coverage.test.ts` **falla** si una
operación no tiene tool ni exclusión, si una exclusión está obsoleta, si una
tool no tiene operación en el contrato, si falta una anotación, si una tool GET
no es de solo lectura, si un `body` es de forma libre o si hay más pendientes
que el tope. Hoy hay 101 tools sobre 198 operaciones (32 exclusiones permanentes
y 65 pendientes, todas de escritura). Las de coordinación (crear y editar hallazgos,
reuniones y compromisos, y cambiar el estado de hallazgos y compromisos) ya están expuestas. Todas las lecturas (GET) del contrato
están expuestas salvo las descargas binarias.

> Nota: `audit.events.list` ahora sigue el contrato vigente (`objectType`,
> `action`, `page`, `pageSize`); el argumento `take` ya no existe en la API.

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
| `MCP_TRANSPORT`         | No (default `stdio`)     | `stdio` (local) o `http` (red). Solo `http` activa HTTP. Ver sección HTTP.  |
| `MCP_AUTH_MODE`         | No (default `dev-header`)| Solo stdio. `jwt` activa autenticación real; otro valor se trata `dev-header`.|
| `MCP_ACTOR_ID`          | Sí en `dev-header`       | Solo stdio. Identidad enviada en la cabecera `X-Actor-Id`.                  |
| `MCP_API_TOKEN`         | Vía (a) en `jwt`         | Solo stdio. JWT ya emitido. **Secreto.** No admite re-login ante 401.       |
| `MCP_LOGIN_IDENTIFIER`  | Vía (b) en `jwt`         | Solo stdio. Identificador para `POST /auth/login` (login perezoso).         |
| `MCP_LOGIN_PASSWORD`    | Vía (b) en `jwt`         | Solo stdio. Contraseña para el login. **Secreto.**                          |
| `MCP_HTTP_HOST`         | No (default `0.0.0.0`)   | Solo http. Host del listener HTTP.                                          |
| `MCP_HTTP_PORT`         | No (default `3002`)      | Solo http. Puerto del listener HTTP.                                        |

El `MCP_AUTH_MODE` debe coincidir con el `AUTH_MODE` del backend. En modo `http`
la identidad llega por petición (`Authorization: Bearer`) y las variables de
identidad de stdio se ignoran.

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
errores, `inputSchema`/argumentos del motor y el **guard de cobertura** del
catálogo frente al contrato, con el api-client mockeado); no
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

## Transporte HTTP (uso por red)

Además del transporte **stdio** (local, por defecto, **sin cambios**), el MCP
puede exponerse por **HTTP (Streamable HTTP)** para que un equipo lo use por red
sin instalar nada. Se activa con `MCP_TRANSPORT=http`.

| Variable        | Default   | Descripción                                            |
| --------------- | --------- | ------------------------------------------------------ |
| `MCP_TRANSPORT` | `stdio`   | `stdio` (local) o `http` (red). Solo `http` activa HTTP.|
| `MCP_HTTP_HOST` | `0.0.0.0` | Host del listener HTTP (solo en modo `http`).          |
| `MCP_HTTP_PORT` | `3002`    | Puerto del listener HTTP (solo en modo `http`).        |

Diferencias clave del modo HTTP:

- **Identidad por persona (Bearer por petición).** Cada petición debe traer
  `Authorization: Bearer <token>`. El MCP reenvía **ese** token al backend para
  **esa** sesión/petición. No hay token a nivel de proceso: dos usuarios
  concurrentes nunca comparten identidad.
- **Sin Authorization => 401.** Una petición sin `Bearer` válido recibe un error
  JSON-RPC `401 Unauthorized`; **nunca** se usa un usuario por defecto.
- **`dev-header` es solo de stdio.** En HTTP la identidad es siempre el `Bearer`
  por petición (producción `AUTH_MODE=jwt`). `MCP_ACTOR_ID`, `MCP_API_TOKEN` y
  `MCP_LOGIN_*` se **ignoran** en HTTP.
- **El token nunca se registra** (ni stdout ni stderr). stdout sigue reservado;
  los diagnósticos HTTP van a stderr sin el valor del token.
- **stdio no cambia**: mismo comportamiento, misma identidad por entorno.

### Smoke test HTTP en local (sin Docker)

```powershell
$env:MCP_TRANSPORT = "http"
$env:MCP_API_BASE_URL = "http://localhost:3001"
$env:MCP_HTTP_HOST = "127.0.0.1"
$env:MCP_HTTP_PORT = "3002"
node apps/mcp/dist/index.js   # en otra terminal, deja el server escuchando
```

```powershell
# (a) initialize CON Bearer -> 200 + cabecera Mcp-Session-Id
$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}'
$init | Out-File -Encoding utf8 init.json
curl.exe -i -X POST http://127.0.0.1:3002/ `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" `
  -H "Authorization: Bearer <tu-token>" --data '@init.json'

# (b) initialize SIN Authorization -> HTTP 401 (JSON-RPC error, sin usuario por defecto)
curl.exe -i -X POST http://127.0.0.1:3002/ `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" --data '@init.json'
```

El login al backend es **perezoso**, así que el handshake y `tools/list`
funcionan sin un backend vivo; una **invocación** real de tool sí requiere la API
corriendo y un token válido (ese token delimita el alcance por rol de la
persona).

### Configuración del cliente Kiro (MCP por red)

Para usar el MCP publicado por red (ver despliegue abajo), el cliente NO pone
ninguna ruta local: solo la URL y su `Bearer`.

```json
{
  "mcpServers": {
    "control-phari": {
      "url": "http://192.168.0.116:8080/mcp",
      "headers": {
        "Authorization": "Bearer <TU_TOKEN_PERSONAL>"
      }
    }
  }
}
```

Cómo obtiene cada persona su token: hace `POST /api/auth/login` con su
identificador y contraseña y copia el `accessToken` de la respuesta. Por
ejemplo:

```bash
curl -X POST http://192.168.0.116:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"tu-usuario","password":"tu-contraseña"}'
# -> { "accessToken": "<TU_TOKEN_PERSONAL>", "expiresIn": ... }
```

Cada persona usa **su** token (su rol y permisos); nunca se comparte entre
usuarios. Si el token caduca (401), la persona vuelve a hacer login y actualiza
su configuración.

### Despliegue del MCP por red (producción, bajo Nginx `/mcp`)

El servicio `mcp` se publica detrás de Nginx en `/mcp` (ver `compose.prod.yaml`
e `infra/nginx/nginx.conf`). No publica puerto al host: solo Nginx habla con él,
que reenvía `Authorization` tal cual. Ver `docs/deployment.md`.
