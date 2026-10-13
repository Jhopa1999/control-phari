# Diseño: Servidor MCP para control-phari

## Resumen

Se añade un nuevo workspace `apps/mcp` (paquete privado `@plantilla-portales/mcp`) que expone un servidor **Model Context Protocol** sobre transporte **stdio**, construido con el SDK oficial `@modelcontextprotocol/sdk`. El servidor es una **capa delgada**: no contiene lógica de negocio, autorización ni validaciones de dominio. Cada herramienta (tool) MCP valida la forma de sus argumentos de entrada, delega la operación al backend NestJS (apps/api) reutilizando el cliente tipado `@plantilla-portales/api-client`, y traduce la respuesta o el error de la API a una respuesta MCP entendible. La identidad del actor y la URL de la API se resuelven por variables de entorno al arrancar, replicando los dos modos que ya soporta el backend (`dev-header` y `jwt`). El contrato OpenAPI generado es la única fuente de verdad de endpoints y tipos; el MCP no redeclara ninguno.

Este documento resuelve de forma inequívoca: identidad, granularidad y nomenclatura de tools, estructura de archivos, manejo de errores y estrategia de verificación. No incluye código; es la especificación para implementar.

## Stack (bloqueado tras aprobación)

- **Node** >= 20.9.0 (igual que la raíz del monorepo). El runtime objetivo es Node 20; el código del MCP **solo usa APIs disponibles en Node 20.9+** (p. ej. `process.env`, `process.stdin/stdout`, `process.exit`; el `fetch` global existe estable desde Node 18). Nota sobre `@types/node`: se sigue la versión de la raíz (26.x), que corresponde a tipos de Node 24+ y por tanto podría *tipar* APIs inexistentes en Node 20 (p. ej. features recientes de `util.parseArgs` o del test runner). Mitigación: **no se usan** esas APIs; si se adopta `node --test` (ver verificación), se restringe a funcionalidad del runner estable desde Node 20.9 (`describe`/`it`/`assert`), evitando añadidos posteriores. Si en implementación esta desalineación generara ruido, la alternativa es fijar `@types/node` a la línea `20.x` solo en el workspace `apps/mcp`.
- **TypeScript 5.9.3** en modo estricto (misma versión que apps/api y packages/api-client).
- **@modelcontextprotocol/sdk** — versión **fija/pinned** (sin rango `^`), transporte **stdio** (`StdioServerTransport`).
- **zod** — versión fija, para validar los argumentos de cada tool. Es la vía recomendada por el SDK de MCP (la API `registerTool`/`tool` acepta un `inputSchema` de zod) y evita escribir validación manual. Se añade como dependencia directa del workspace.
- **@plantilla-portales/api-client** — dependencia de workspace (`"*"`), reutilizada tal cual. Aporta `createApiClient`, `components`, `paths`, `operations`.
- **openapi-fetch** llega transitivamente a través de api-client; el MCP **no** lo declara ni lo usa directamente.

No se introduce ningún otro runtime, framework ni infraestructura (sin Redis, Kafka, Kubernetes, sin servidor HTTP propio). El MCP no abre puertos: habla por stdin/stdout.

### Por qué este enfoque (alternativas descartadas)

- **Reusar api-client vs. reimplementar fetch**: se reusa api-client. Reimplementar llamadas HTTP duplicaría endpoints y tipos, violando el steering ("MCP deberá reutilizar capacidades controladas por el backend" y "no duplicar lógica de negocio"). El cliente ya está tipado desde el mismo contrato que consume el frontend.
- **stdio vs. HTTP/SSE**: stdio. Es el transporte estándar para servidores MCP locales lanzados por un host (p. ej. un cliente LLM de escritorio), no requiere gestionar puertos, CORS ni TLS, y mantiene la "solución simple" que exige el steering. Un transporte HTTP se puede añadir después sin cambiar la capa de tools.
- **zod vs. JSON Schema a mano**: zod. Es la integración de primera clase del SDK y da inferencia de tipos estática; escribir JSON Schema manual sería más verboso y propenso a desincronizarse de los tipos.

## Identidad del actor (resuelta)

El backend resuelve la identidad de dos formas excluyentes (confirmado en `apps/web/src/lib/api-client.ts` y en `.env.example`): **`dev-header`** inyecta `X-Actor-Id: <identifier>`, y **`jwt`** inyecta `Authorization: Bearer <token>`. El MCP replica exactamente esto, eligiendo **una sola** cabecera por request mediante un middleware `api.use({ onRequest })`, igual que el frontend. Nunca envía ambas.

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `MCP_API_BASE_URL` | Sí | URL base del backend NestJS (p. ej. `http://localhost:3001`). Coherente con `NEXT_PUBLIC_API_BASE_URL`. No es secreto. |
| `MCP_AUTH_MODE` | No (default `dev-header`) | `dev-header` o `jwt`. Cualquier valor distinto de `jwt` se trata como `dev-header`, igual que el frontend. |
| `MCP_ACTOR_ID` | Sí **solo** si `MCP_AUTH_MODE=dev-header` | Identifier del actor (p. ej. `jefe@demo.local`) que se envía en `X-Actor-Id`. |
| `MCP_API_TOKEN` | Ver abajo | JWT ya emitido, usado directamente como `Authorization: Bearer`. Es un secreto; nunca se versiona. |
| `MCP_LOGIN_IDENTIFIER` | Ver abajo | Identifier para hacer `POST /auth/login` y obtener el token al arrancar. |
| `MCP_LOGIN_PASSWORD` | Ver abajo | Contraseña para el login. Es un secreto; nunca se versiona. |

### Lógica de resolución al arrancar (orden determinista)

1. Si falta `MCP_API_BASE_URL` → **error fatal entendible** y el proceso termina con código ≠ 0 (mismo espíritu que el `throw new Error(...)` del frontend cuando falta `NEXT_PUBLIC_API_BASE_URL`). El mensaje indica la variable que falta y remite al `.env.example` del workspace.
2. Modo `dev-header` (default): si falta `MCP_ACTOR_ID` → error fatal entendible. Si está, el middleware añade `X-Actor-Id: <MCP_ACTOR_ID>` en cada request.
3. Modo `jwt`: se valida al arrancar que **exista una vía de credencial** y, según cuál, se fija la estrategia de obtención del token:
   - a. Si existe `MCP_API_TOKEN`, se usa directamente (no se hace login). Útil para tokens de servicio.
   - b. Si no, y existen **ambos** `MCP_LOGIN_IDENTIFIER` y `MCP_LOGIN_PASSWORD`, se habilita el login por credenciales. **El login NO se ejecuta al arrancar**: se difiere (lazy) a la primera llamada a una tool que necesite token (ver abajo). Al arrancar solo se comprueba que las variables están presentes.
   - c. Si no hay ninguna de las dos vías → error fatal entendible listando las variables aceptadas.

**Momento del login (lazy, resuelto):** la validación de arranque solo verifica la **presencia de config** (fail-fast ante config faltante). El `POST /auth/login` de la vía (b) se ejecuta **perezosamente** en la primera request que requiera token, no durante el arranque. Esto garantiza que `initialize` y `tools/list` funcionan **en cualquier modo sin backend vivo** (coherente con el caso borde "backend apagado" y con el smoke test del paso 4). Un fallo del login (red o credenciales) **no tumba el servidor**: se traduce a un error MCP de autenticación en la tool que lo disparó. El único fallo fatal al arrancar en modo `jwt` es la **ausencia de config** (ni token ni par identifier+password), no un fallo de red.

El token (venga de `MCP_API_TOKEN` o del login) se guarda **solo en memoria del proceso**, nunca en disco ni en logs.

### Renovación del token JWT

`LoginResponseDto` incluye `expiresIn` (string tipo `"8h"`), no una fecha absoluta, y el backend responde `401` cuando el token caduca o es inválido. Estrategia elegida (la más simple y robusta): **renovación reactiva ante 401**. El re-login solo es posible cuando hay **credenciales de login en memoria** (vía b: `MCP_LOGIN_IDENTIFIER` + `MCP_LOGIN_PASSWORD`). En ese caso, si una llamada a una tool devuelve `401`, el servidor realiza (o re-realiza) el login, actualiza el token en memoria y **reintenta la llamada una sola vez**; si el reintento vuelve a fallar con 401, devuelve un error MCP de autenticación. Con **token directo (vía a, `MCP_API_TOKEN`)** o sin credenciales de login, **no hay re-login posible**: un `401` se traduce directamente a error MCP indicando que el token es inválido o caducó. No se implementa un temporizador proactivo basado en `expiresIn` en esta iteración (añade complejidad de parseo y relojes sin beneficio claro frente al reintento reactivo); queda como posible mejora.

### Criterio de éxito de toda llamada (regla transversal)

`openapi-fetch` no distingue 200 de 201: el **éxito de cualquier llamada** (login incluido) se determina por `result.error == null` (equivalente a una respuesta 2xx, con `result.data` poblado), **nunca** comprobando un status code concreto. Esto es importante porque `POST /auth/login` responde **200** (verificado en el contrato: sus únicas respuestas declaradas son `200` y `401`), no el `201` habitual de un `POST` en NestJS. Un implementador que comprobara `response.status === 201` trataría todo login válido como fallido. El mismo criterio (`result.error == null` = éxito) rige en los handlers de tools y en el traductor de errores: si `result.error != null`, se traduce usando `response.status`.

### Nota crítica sobre el login y los tipos del contrato

El endpoint `POST /auth/login` del contrato OpenAPI **no declara `requestBody`** (el controlador no anota `@ApiBody`), por lo que `paths['/auth/login']['post']` **no tiene** un `requestBody` tipado en `schema.d.ts` (verificado: `LoginRequestDto` no está entre los 126 schemas generados). Consecuencia de diseño: la llamada de login debe enviar el cuerpo `{ identifier, password }` sin apoyarse en el tipo del body generado. Se encapsula en un único helper de autenticación que:

- Llama `api.POST('/auth/login', { body: { identifier, password } })`. El tipo de `body` será laxo por la carencia del contrato; se tipa localmente una interfaz mínima `LoginBody { identifier: string; password: string }` **solo** para el cuerpo de entrada (no es un tipo de dominio ni un endpoint nuevo: es el formato de credenciales ya documentado en el DTO del backend). La **respuesta** sí se tipa con `components['schemas']['LoginResponseDto']`.
- Esta es la única excepción permitida a "no redeclarar tipos"; se documenta en el código con un comentario que apunta a `login-request.dto.ts`. Si en el futuro el backend añade `@ApiBody` al controlador, se elimina la interfaz local y se usa el tipo generado.

## Herramientas MCP (granularidad resuelta)

### Principio

Diseño limpio y extensible por encima de cobertura 100%. La primera iteración cubre un **conjunto representativo y coherente**: lectura de los módulos núcleo más las acciones principales del flujo de demanda y planificación, que es el corazón del dominio. El patrón de registro (abajo) permite añadir tools módulo a módulo sin tocar el arranque del servidor.

### Nomenclatura

Formato `recurso.accion` en minúsculas con punto como separador de dominio (compatible con los nombres de tool de MCP). Verbos: `list`, `get`, `create`, `update`, `transition`, `submit`, `approve`, etc., alineados con el método/semántica del endpoint. Ejemplos: `catalog.list`, `catalog.get`, `catalog.create`, `request.list`, `request.create`, `request.triage.submit`, `plan.get`, `task.status.update`. Esta convención es predecible para un LLM y mapea 1:1 a una operación del contrato.

### Tools de la primera iteración

Agrupadas por módulo. Cada una envuelve **una** operación real del contrato (ruta + método verificados en openapi.json).

**Identidad / salud**
- `health.check` → `GET /health`. **Verificado**: `GET /health` es una ruta **pública** (el `HealthController` no aplica `CurrentUserGuard`; en este backend los guards se aplican por módulo, nunca como `APP_GUARD` global). Por tanto `health.check` **no requiere identidad y no envía cabecera de identidad** (ni `X-Actor-Id` ni `Authorization`). Sirve como smoke end-to-end del transporte y de la conectividad con el backend sin depender de que la auth esté bien configurada. Como no dispara login, su llamada tampoco provoca la obtención perezosa del token en modo jwt.
- `me.permissions` → `GET /me/permissions`. **Requiere identidad**: usa la cabecera del modo configurado (`X-Actor-Id` en dev-header, `Authorization: Bearer` en jwt). En modo jwt vía (b) es una de las tools que puede disparar el login perezoso. Sin identidad válida el backend responde 401 (traducido según la tabla de errores).
- `dev.actors.list` → `GET /dev/actors` (solo útil en modo dev-header; devuelve el error del backend si está deshabilitado). Envía la identidad del modo configurado; con el backend en modo jwt el endpoint responde 404 (ver casos borde).

**catalog**
- `catalog.list` → `GET /catalog-items`
- `catalog.get` → `GET /catalog-items/{id}`
- `catalog.create` → `POST /catalog-items`
- `catalog.update` → `PATCH /catalog-items/{id}`

**process**
- `process.list` → `GET /processes`
- `process.get` → `GET /processes/{id}`
- `process.create` → `POST /processes`
- `process.update` → `PATCH /processes/{id}`

**user**
- `user.list` → `GET /users`
- `user.get` → `GET /users/{id}`
- `user.create` → `POST /users`
- `user.update` → `PATCH /users/{id}`

**grant**
- `grant.list` → `GET /grants`
- `grant.create` → `POST /grants`
- `grant.delete` → `DELETE /grants/{id}`

**request (flujo de demanda, lectura + acciones principales)**
- `request.list` → `GET /requests`
- `request.get` → `GET /requests/{id}`
- `request.create` → `POST /requests`
- `request.update` → `PATCH /requests/{id}`
- `request.triage.get` → `GET /requests/{id}/triage` (respuesta `components['schemas']['TriageContextResponseDto']`: el triage **más** los candidatos elegibles como responsable, no `TriageResponseDto`)
- `request.triage.create` → `POST /requests/{id}/triage`
- `request.priority.create` → `POST /requests/{id}/priority`
- `request.approval.get` → `GET /requests/{id}/approval`
- `request.approval.create` → `POST /requests/{id}/approval`

**plan / task (planificación, lectura + acciones principales)**
- `plan.get` → `GET /requests/{requestId}/plan`
- `plan.create` → `POST /requests/{requestId}/plan`
- `plan.submit` → `POST /requests/{requestId}/plan/submit`
- `plan.tasks.list` → `GET /plans/{planId}/tasks`
- `task.get` → `GET /tasks/{id}`
- `task.status.update` → `PATCH /tasks/{id}/status`

**audit (lectura)**
- `audit.events.list` → `GET /audit-events` (con `take` y `objectType` opcionales). `objectType` es un `z.enum` con los cuatro valores verificados en el contrato: **`PROCESS`, `USER`, `GRANT`, `CATALOG_ITEM`**.

**portfolio (lectura)**
- `portfolio.get` → `GET /portfolio`

**Módulos de negocio cubiertos en la primera iteración**: `audit`, `catalog`, `grant`, `plan` (incluye las tools de `task`, agrupadas en un mismo archivo por su acoplamiento), `portfolio`, `process`, `request`, `user`. Además de un grupo transversal de **identidad / salud** (`health`, `me/permissions`, `dev/actors`) que no es un módulo de negocio sino el soporte de conectividad y diagnóstico.

**Módulos de negocio explícitamente fuera de alcance** (ver Fuera de alcance): `capacity`, `coordination`, `governance` (gates/validations) y `knowledge` (assets/documents). Añadirlos es mecánico gracias al patrón de registro.

`auth` no se expone como tool de usuario: el login es un detalle de arranque/identidad, no una operación de dominio.

### Patrón de registro (extensibilidad resuelta)

- Cada módulo vive en `src/tools/<modulo>.ts` y exporta una función `register<Modulo>Tools(ctx)` que recibe un **contexto** `{ server, api }` (el `McpServer` y la instancia de api-client ya configurada con el middleware de identidad) y registra sus tools con `server.registerTool(name, { description, inputSchema }, handler)`.
- Un archivo agregador `src/tools/index.ts` exporta un array `registerAll` que invoca todos los `register<Modulo>Tools`. Añadir un módulo nuevo = crear su archivo y añadir una línea en el agregador. El arranque (`src/server.ts`) no cambia.
- Cada handler sigue la misma forma: (1) los argumentos ya vienen validados por el `inputSchema` de zod; (2) llama al método tipado de api-client (`api.GET`/`api.POST`/`api.PATCH`/`api.DELETE`) con la ruta del contrato; (3) pasa la respuesta por el traductor de errores común; (4) devuelve el `data` serializado como contenido de texto MCP (JSON) en caso de éxito.
- Los tipos de inputs/outputs de cada tool se derivan del contrato: `components['schemas'][...]` para cuerpos y respuestas, y `paths[...]` para parámetros de ruta/query. No se declara ningún tipo de dominio a mano (salvo la excepción documentada del body de login).

### Validación de inputs (resuelta)

Cada tool declara un `inputSchema` de zod que describe **exactamente** los parámetros que necesita el endpoint: parámetros de ruta (p. ej. `id: z.string().min(1)`), query (p. ej. `take: z.number().int().positive().max(500).optional()`, `objectType: z.enum(['PROCESS','USER','GRANT','CATALOG_ITEM']).optional()`, con los valores verificados en el contrato) y, para cuerpos de `POST`/`PATCH`, un objeto cuyos campos reflejan el DTO del contrato (requeridos/opcionales, tipos y límites tal como los expone el schema). Reglas:

- La **autoridad final** de validación de negocio es el backend. zod en el MCP solo garantiza forma y tipos antes de llamar a la API, y produce mensajes de error locales entendibles sin tocar la red. No duplica reglas de negocio (p. ej. no revalida transiciones de estado permitidas: eso lo decide el backend).
- Campos obligatorios → requeridos en zod; opcionales → `.optional()`. Enums del contrato se reflejan como `z.enum`.
- **Nota sobre `take` de `audit.events.list`**: el contrato declara `take` como `"type": "number"` (no `integer`) y el límite `500` vive en la **descripción textual** del parámetro, **no** como `maximum` del schema. Por tanto `z.number().int().positive().max(500)` es una **restricción local más estricta** que el contrato (reduce `number` a entero y aplica un tope tomado de la descripción/backend), no el reflejo de un `maximum` tipado. Se adopta como validación de forma defensiva; el backend sigue siendo la autoridad del límite real.
- **Tools sin parámetros** (`health.check`, `me.permissions`, `portfolio.get`, `dev.actors.list` y los listados sin filtros): declaran un `inputSchema` **vacío** explícito (`z.object({})`), nunca se omite. Así `tools/list` expone un JSON Schema consistente (`type: object` con `properties` vacío) para todas las tools, en lugar de mezclar tools con y sin schema, lo que simplifica el consumo por el LLM.
- Comportamiento ante fallo de validación: la tool **no** llama a la API; devuelve un error MCP (ver abajo, `isError: true`) con el detalle de qué campo falló, sin stack trace.

## Estructura de archivos del workspace `apps/mcp`

```
apps/mcp/
  package.json          # @plantilla-portales/mcp, privado, type: module, scripts build/typecheck/start
  tsconfig.json         # strict, module/moduleResolution nodenext (resolución Node real para el SDK ESM), outDir dist, rootDir src
  .env.example          # documenta MCP_API_BASE_URL, MCP_AUTH_MODE, MCP_ACTOR_ID, MCP_API_TOKEN, MCP_LOGIN_* (placeholders vacíos para secretos)
  README.md             # cómo configurar, variables de entorno, cómo arrancar, cómo probar (smoke)
  src/
    index.ts            # entrypoint: carga config, construye api-client + identidad, crea server, registra tools, conecta stdio
    config.ts           # lee y valida env vars; expone un objeto de config tipado o lanza error fatal entendible
    api.ts              # crea la instancia de api-client con baseUrl y el middleware onRequest de identidad; helper de login/token
    errors.ts           # traducción de resultados de openapi-fetch y excepciones a errores MCP (sin fugas)
    server.ts           # construye el McpServer y conecta StdioServerTransport
    tools/
      index.ts          # registerAll(ctx): invoca cada register<Modulo>Tools
      health.ts         # health.check, me.permissions, dev.actors.list
      catalog.ts
      process.ts
      user.ts
      grant.ts
      request.ts
      plan.ts           # plan.* y task.*
      audit.ts
      portfolio.ts
```

El workspace cae bajo el patrón `apps/*` ya declarado en el `package.json` raíz: **no se modifica la lista `workspaces`**.

### `apps/mcp/package.json` (forma)

```jsonc
{
  "name": "@plantilla-portales/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@plantilla-portales/api-client": "*",
    // Versiones fijadas en el PASO 0 de implementación (último estable
    // compatible con Node 20.9+), pineadas SIN rango. Registradas también
    // en docs/README.md. No se hardcodean en el diseño.
    "@modelcontextprotocol/sdk": "<versión fija del paso 0>",
    "zod": "<versión fija del paso 0>"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    // @types/node sigue la línea de la raíz (26.x). El código solo usa APIs de
    // Node 20.9+; alternativa documentada: fijar 20.x aquí si surge desalineación.
    "@types/node": "26.6.4"
  }
}
```

El `tsconfig.json` parte del estilo de `packages/api-client` (ESM, `strict`, `noUnusedLocals`, `noUnusedParameters`, `outDir: dist`, `rootDir: src`), con esta **decisión de resolución de módulos fijada por criterio de aceptación**:

- **A diferencia de api-client** (que usa `moduleResolution: bundler` porque sus consumidores lo re-empaquetan), el MCP se ejecuta con `node dist/index.js`, es decir Node resuelve sus imports en runtime. `@modelcontextprotocol/sdk` se publica como paquete ESM con `exports`/subpath exports que **Node debe resolver**. Por ello la opción por defecto es **`module: nodenext` + `moduleResolution: nodenext`**, que modela la resolución real de Node (respeta `exports`, requiere extensiones explícitas en imports relativos) y evita que `tsc` acepte imports que Node luego rechazaría en runtime.
- **Precondición obligatoria del typecheck (orden de build):** `@plantilla-portales/api-client` publica en su `package.json` un mapa `exports` que **solo** apunta a `dist` (`"types": "./dist/index.d.ts"`, `"default": "./dist/index.js"`, `"files": ["dist"]`); **no** hay subpath a `src`. Con `moduleResolution: nodenext`, TypeScript resuelve los tipos del import `@plantilla-portales/api-client` a través de ese `exports`, es decir a `dist/index.d.ts`. Por tanto, **`npm run typecheck:mcp` requiere que api-client esté construido**: si falta su `dist`, el typecheck falla por módulo no resuelto. El flujo correcto es siempre `npm run build:api-client && npm run typecheck:mcp`. Esto se refleja en el README del workspace y es imprescindible no confundir ese fallo (falta de build) con una incompatibilidad de `nodenext`.
- **Paso 0 (antes del gate): fijar versiones.** El gate no puede ejecutarse hasta elegir e instalar una versión concreta del SDK y de zod. Como paso previo se selecciona el **último estable de `@modelcontextprotocol/sdk` compatible con Node 20.9+** (y de `zod`), se instala **pineado sin rango** (sin `^`), y se registra en `apps/mcp/package.json` y en `docs/README.md`. No se hardcodea la versión en este diseño; la decisión de versión es parte del paso 0 de implementación.
- **Gate de factibilidad (antes de escribir las tools):** con api-client ya construido (precondición anterior) y las versiones fijadas (paso 0), se añade un import de prueba del SDK (`import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'` y `StdioServerTransport`) y se ejecuta `npm run build:api-client && npm run typecheck:mcp`. Criterio de aceptación: el typecheck resuelve el SDK **y** api-client sin errores de módulo **y** `node dist/index.js` arranca. Si por algún motivo `nodenext` no resolviera correctamente los `exports` del SDK (improbable, y distinto del caso "api-client sin build"), se prueba `bundler` como alternativa; `nodenext` es la opción por defecto y la que se documenta salvo que el gate demuestre lo contrario.

## Cambios en el `package.json` raíz (mínimos, sin romper el orden)

Se añaden dos scripts propios y se incluye el MCP en los agregados, **respetando el orden existente** (api → api-client → web, con mcp al final):

- `"build:mcp": "npm run build --workspace apps/mcp"`
- `"typecheck:mcp": "npm run typecheck --workspace apps/mcp"`
- `build` pasa a: `... build:api && build:api-client && build:web && build:mcp` (mcp al final porque depende de api-client ya construido).
- `typecheck` pasa a: `... apps/api && packages/api-client && apps/web && apps/mcp` (mcp al final).

Ningún script existente cambia de nombre ni de comportamiento; `db:*`, `test:unit`, `test:e2e`, `contracts:generate`, `docker:*` quedan intactos. El MCP depende de `@plantilla-portales/api-client`; por eso en `build` va **después** de `build:api-client`, para consumir su `dist`.

## Manejo y traducción de errores (resuelto, por operación)

`openapi-fetch` devuelve `{ data, error, response }`: en 2xx `data` está poblado y `error` es `undefined`; en 4xx/5xx `error` contiene el cuerpo de error del backend y `response.status` el código. El backend NestJS usa el envoltorio estándar `{ statusCode, message, error }` (y `401` sin cuerpo para login/credenciales). El módulo `errors.ts` centraliza la traducción. Para **cada** llamada de tool:

| Condición | Recuperable | Qué recibe el caller (MCP) | Log |
| --- | --- | --- | --- |
| Éxito 2xx | — | `content` de texto con el JSON de `data`; `isError` ausente | no |
| 400 (validación backend) | no (es error del input) | error MCP: "Solicitud inválida" + `message` del backend (sin stack) | a stderr, nivel warn |
| 401 (auth) | Recuperable **solo** si hay `MCP_LOGIN_IDENTIFIER`+`MCP_LOGIN_PASSWORD` en memoria (vía b): re-login y 1 reintento. Con `MCP_API_TOKEN` directo (vía a), modo `dev-header`, o sin credenciales de login → **no recuperable** | tras reintento fallido, o cuando no hay vía de re-login: error MCP "No autenticado/autorizado: revisa la identidad configurada" | stderr, warn |
| 403 (autorización) | no | error MCP: "El actor configurado no tiene permiso para esta operación" | stderr, warn |
| 404 | no | error MCP: "Recurso no encontrado" + id solicitado | stderr, info |
| 409 / 422 (conflicto/regla de negocio) | no | error MCP con el `message` del backend tal cual (es información de dominio útil) | stderr, warn |
| 5xx | no (desde el MCP) | error MCP genérico: "Error del servidor backend" + status, **sin** cuerpo detallado | stderr, error |
| Fallo de red / backend caído (sin `response`) | no | error MCP: "No se pudo contactar la API en {baseUrl}" | stderr, error |
| Fallo de validación zod (antes de la red) | no | error MCP con el detalle del campo inválido | no (es feedback de uso) |
| Error inesperado en el handler | no | error MCP genérico "Error interno del MCP" | stderr, error |

Reglas transversales:
- **Nunca** se filtran stack traces, secretos (token, password) ni la URL con credenciales al contenido devuelto por MCP. Los logs van a **stderr** (stdout está reservado al protocolo MCP y no debe contaminarse).
- Los errores de tool se devuelven como resultado con `isError: true` y un `content` de texto, no como excepción que tumbe el servidor. Un error de arranque por **config faltante** (sin `MCP_API_BASE_URL`, o modo jwt sin ninguna vía de credencial, o dev-header sin `MCP_ACTOR_ID`) **sí** es fatal y termina el proceso con mensaje a stderr y código ≠ 0. En cambio, un **fallo del login** (red o credenciales) en la vía (b) **no** es fatal: ocurre perezosamente en la primera tool y se traduce a error MCP de auth, dejando el servidor vivo.
- El traductor es una función pura `toMcpError(result | exception, context)` → unit-testeable sin red.

### Invariantes y dónde se enforcan

- **Una sola cabecera de identidad por request**: la enforca el middleware `onRequest` en `api.ts` (nunca envía ambas), igual que el frontend. Es responsabilidad del MCP porque es quien construye el request.
- **Autorización y reglas de negocio**: las enforca el **backend**, no el MCP. El MCP solo transporta y traduce. Esto es deliberado y cumple el steering.
- **Forma de los inputs**: la enforca zod en la frontera de cada tool (responsabilidad del MCP, antes de la red).
- **Config obligatoria presente**: la enforca `config.ts` al arrancar (fail-fast).

## Estrategia de verificación (resuelta)

1. **Typecheck**: `npm run typecheck:mcp` y `npm run typecheck` (agregado) pasan sin errores en modo estricto. **Precondición**: api-client debe estar construido antes, porque su `exports` solo resuelve tipos vía `dist` (ver "Precondición obligatoria del typecheck" arriba); el comando reproducible es `npm run build:api-client && npm run typecheck:mcp`. El agregado `npm run typecheck` ya corre tras los builds en el flujo normal, pero ejecutado en aislamiento sobre un árbol limpio exige el build previo de api-client. Verifica que los tipos del contrato se consumen correctamente.
2. **Build**: `npm run build:mcp` genera `dist/` ejecutable; `npm run build` completo (api → api-client → web → mcp) no se rompe.
3. **Unit tests** (añadidos en `apps/mcp`, framework a confirmar — ver nota): se prueban sin red (a) `config.ts` (resolución y fallos de cada combinación de env vars), (b) `errors.ts` (`toMcpError` para cada código de estado), (c) el `inputSchema` de un par de tools representativas (rechaza inputs mal formados, acepta válidos) usando un api-client mockeado. No se prueban reglas de negocio (son del backend).
4. **Smoke test de arranque por stdio**: con `MCP_API_BASE_URL` y una identidad mínima, arrancar `node dist/index.js`, enviar los mensajes JSON-RPC MCP de `initialize` y `tools/list` por stdin y verificar que (a) el server responde el handshake, (b) `tools/list` devuelve la lista esperada de tools con sus descripciones (todas con `inputSchema`, incluso las sin parámetros, por la regla de `z.object({})`). Esto confirma el transporte stdio y el registro de tools **sin depender de un backend vivo y en cualquier modo de identidad**: gracias al login perezoso, ni siquiera el modo `jwt` vía (b) ejecuta red durante `initialize`/`tools/list`. Se documenta en el README como comando reproducible.
5. **Verificación end-to-end opcional** (manual, requiere backend `db:up` + api corriendo): invocar `health.check` y una tool de lectura (`catalog.list`) y confirmar respuesta real. No se automatiza en esta iteración para no acoplar la suite del MCP a un backend vivo.

Nota sobre el framework de test: la raíz usa Jest (vía apps/api) y Playwright (e2e). Para un workspace **ESM puro** como el MCP, configurar Jest con ESM añade fricción. Se evaluará al implementar entre (a) Jest con preset ESM alineado al repo, o (b) el **test runner nativo de Node** (`node --test`), que no añade dependencias y encaja con ESM. Se prefiere (b) si Jest-ESM resulta costoso, documentando la decisión; en ningún caso se rompe `test:unit` (que seguirá ejecutando solo apps/api) — si se desea, se añade un `test:mcp` separado sin tocar los agregados de test existentes.

## Casos borde

- **Backend apagado**: fallo de red traducido a error MCP claro con la baseUrl; el server sigue vivo y responde a `tools/list`.
- **Token caducado a mitad de sesión** (modo jwt+login): re-login reactivo y un reintento; si falla, error de auth sin tumbar el server.
- **`MCP_AUTH_MODE=jwt` sin ninguna credencial**: error fatal al arrancar.
- **`dev.actors.list` con backend en modo jwt**: el backend responde 404. El MCP devuelve un mensaje **neutro** que no afirma la causa con certeza: "Recurso no encontrado (`/dev/actors` solo está disponible cuando el backend corre en modo dev-header)." Un 404 genérico no distingue "deshabilitado" de "ruta inexistente", por eso el mensaje enuncia la condición de disponibilidad sin asegurar el motivo exacto.
- **Enum del contrato ampliado** (p. ej. nuevos `objectType`): el `z.enum` de `audit.events.list` se escribe con los cuatro valores verificados (`PROCESS`, `USER`, `GRANT`, `CATALOG_ITEM`). Como salvaguarda frente a desincronización, se empareja ese `z.enum` con el tipo generado mediante una comprobación de equivalencia que **falla el `typecheck:mcp`** si el contrato amplía o reduce el enum. Punto crítico (verificado en `schema.d.ts`): la operación `AuditController_findMany` declara `query?` **opcional** y `objectType?` **opcional**, por lo que la ruta de tipo cruda `paths['/audit-events']['get']['parameters']['query']['objectType']` **no compila en modo estricto** ("Object is possibly 'undefined'") y, aunque compilara, produciría un union con `undefined` que rompería la equivalencia contra un `z.enum`. Hay que envolver con `NonNullable` tanto `query` como el miembro, **exactamente como ya hace el frontend** (`apps/web/src/lib/api-client.ts`: `type AuditEventsQuery = NonNullable<paths['/audit-events']['get']['parameters']['query']>`). La expresión correcta es:

  ```ts
  // Tipo del contrato, con NonNullable en query y en el miembro:
  type ContractObjectType = NonNullable<
    NonNullable<paths['/audit-events']['get']['parameters']['query']>['objectType']
  >;
  // Union literal del z.enum de la tool:
  type EnumObjectType = z.infer<typeof objectTypeSchema>;
  // Comprobación bidireccional de equivalencia (falla si el contrato diverge del z.enum):
  const _contractIncludesEnum: ContractObjectType = {} as EnumObjectType;
  const _enumIncludesContract: EnumObjectType = {} as ContractObjectType;
  ```

  (o un helper `AssertEqual<ContractObjectType, EnumObjectType>`). Si el backend amplía el enum y se regenera con `contracts:generate`, una de las dos asignaciones deja de compilar y el `typecheck:mcp` **falla**, forzando a actualizar la tool. Así la verdad sigue siendo el contrato y la divergencia se detecta en CI, no en runtime.
- **Respuestas grandes** (listados extensos): se serializan como JSON de texto; se respeta cualquier parámetro de paginación/limit que ofrezca el contrato (p. ej. `take` en audit) y la tool lo expone en su input.
- **stdout contaminado**: cualquier `console.log` accidental rompería el protocolo; regla fija: todo logging va a stderr.

## Fuera de alcance (primera iteración)

- Tools para los módulos **capacity**, **coordination**, **governance** (gates/validations) y **knowledge** (assets/documents). Son añadibles con el patrón de registro sin cambios estructurales.
- Transporte HTTP/SSE (solo stdio).
- Renovación proactiva de token por temporizador (solo reactiva ante 401).
- Caché de respuestas, rate limiting o métricas.
- Cualquier lógica de negocio, autorización o persistencia en el MCP (prohibido por steering).
- Creación o modificación de archivos `.env` reales (solo `.env.example` con placeholders).
- Modificar la lista `workspaces` del package.json raíz o cualquier script existente distinto de los agregados `build`/`typecheck`.

## Respuesta a la revisión de diseño

Pase de revisión: `design-review.json` (veredicto CHANGES_REQUESTED). Todos los findings se resolvieron en el documento; cada uno se verificó contra el código y el contrato reales antes de redactar la corrección.

1. **HIGH — login 200 vs 201 / criterio de éxito** (resuelto). Verificado en el contrato: `POST /auth/login` solo declara respuestas `200` y `401`. Se añadió la sección "Criterio de éxito de toda llamada": el éxito se determina por `result.error == null`, nunca por un status concreto; se documenta explícitamente que login responde 200.
2. **HIGH — identidad de `health.check`/`me.permissions`** (resuelto). Verificado en `apps/api/src/health/health.controller.ts`: `GET /health` no aplica `CurrentUserGuard` y los guards de este backend se aplican por módulo (nunca `APP_GUARD` global), así que `/health` es público. Se documentó que `health.check` no envía cabecera de identidad y que `me.permissions`/`dev.actors.list` sí usan la del modo configurado.
3. **HIGH — login eager vs lazy** (resuelto). Se cambió a login **perezoso**: al arrancar solo se valida presencia de config; el `POST /auth/login` ocurre en la primera tool que necesite token. Un fallo de login ya no es fatal (error MCP de auth), solo lo es la config faltante. Esto elimina la contradicción con el caso borde "backend apagado" y con el smoke test del paso 4.
4. **MEDIUM — fila 401 vía a vs vía b** (resuelto). La fila 401 y la sección de renovación ahora precisan que el re-login solo es recuperable con `MCP_LOGIN_IDENTIFIER`+`MCP_LOGIN_PASSWORD` (vía b); con token directo (vía a), dev-header o sin credenciales, el 401 no es recuperable.
5. **MEDIUM — inputSchema de tools sin parámetros** (resuelto). Regla fijada: las tools sin parámetros declaran `z.object({})`, nunca se omite el schema, para un `tools/list` consistente.
6. **MEDIUM — enum `objectType`** (resuelto). Verificado en el contrato: `PROCESS, USER, GRANT, CATALOG_ITEM`. Se listan explícitamente en la tool y en la validación; además se fija un chequeo de tipo (`satisfies` contra `paths[...]['objectType']`) que hace fallar `typecheck:mcp` si el contrato amplía el enum, sustituyendo el vago "cuando sea viable".
7. **MEDIUM — factibilidad SDK / moduleResolution** (resuelto). Decisión fijada: `module/moduleResolution: nodenext` por defecto (el MCP se ejecuta con Node, que debe resolver los `exports` ESM del SDK), con un gate de factibilidad concreto (import de prueba + `typecheck:mcp` + arranque) antes de escribir las tools; `bundler` solo como alternativa si el gate fallara.
8. **MEDIUM — `@types/node` 26.x vs Node 20** (resuelto). Documentado: se mantiene la línea de la raíz (26.x) pero el código solo usa APIs de Node 20.9+; si se usa `node --test`, se restringe al runner estable desde 20.9. Alternativa anotada: fijar `@types/node` 20.x solo en el workspace mcp.
9. **NIT — recuento de módulos** (resuelto). Se eliminó la cifra "10 de 13" y se enumeran los módulos cubiertos (audit, catalog, grant, plan+task, portfolio, process, request, user) más el grupo transversal identidad/salud, y los fuera de alcance (capacity, coordination, governance, knowledge).
10. **NIT — mensaje de `dev.actors.list`** (resuelto). Mensaje neutralizado: "Recurso no encontrado (`/dev/actors` solo está disponible cuando el backend corre en modo dev-header)", sin afirmar la causa exacta del 404.

### Segunda ronda de revisión

Pase de revisión: `design-review.json` (veredicto CHANGES_REQUESTED, 1 HIGH + 1 MEDIUM + 3 NIT). Todos los findings se resolvieron; cada uno se verificó contra `schema.d.ts` y `apps/web/src/lib/api-client.ts` reales antes de redactar la corrección.

1. **HIGH — ruta de tipo del `satisfies` de `objectType` no compila en strict** (resuelto). Verificado en `schema.d.ts`: `AuditController_findMany` declara `query?` y `objectType?` opcionales, así que la ruta cruda produce "Object is possibly 'undefined'" y un union con `undefined`. Se corrigió el caso borde "Enum del contrato ampliado" para usar `NonNullable<NonNullable<paths['/audit-events']['get']['parameters']['query']>['objectType']>` (el mismo patrón que ya usa el frontend con `AuditEventsQuery`), con una comprobación de equivalencia bidireccional que falla el `typecheck:mcp` si el contrato diverge del `z.enum`.
2. **MEDIUM — el gate y `typecheck:mcp` requieren api-client construido** (resuelto). Verificado en `packages/api-client/package.json`: su `exports` solo publica `dist` (sin subpath a `src`). Se añadió una **precondición obligatoria** explícita (`npm run build:api-client && npm run typecheck:mcp`) tanto en la sección del `tsconfig`/gate como en el paso 1 de verificación y en el README del workspace, aclarando que un fallo por falta de build no debe confundirse con una incompatibilidad de `nodenext`.
3. **NIT — tipo de respuesta de `request.triage.get`** (resuelto). Verificado en el contrato: `GET /requests/{id}/triage` responde `TriageContextResponseDto` (triage + candidatos elegibles), no `TriageResponseDto`. La tool se anotó con `components['schemas']['TriageContextResponseDto']`.
4. **NIT — `take` es `number` y el 500 no es un `maximum` formal** (resuelto). Verificado: el contrato declara `take` como `type: number` con el límite 500 en la descripción textual. Se aclaró que `z.number().int().positive().max(500)` es una **restricción local más estricta** que el contrato, no el reflejo de un `maximum` tipado; el backend sigue siendo la autoridad del límite.
5. **NIT — versiones del SDK/zod sin fijar; el gate las requiere** (resuelto). Se añadió un **Paso 0** explícito previo al gate: seleccionar el último estable del SDK/zod compatible con Node 20.9+, instalarlo pineado sin rango y registrarlo en `apps/mcp/package.json` y `docs/README.md`. El comentario del `package.json` de ejemplo apunta a este paso 0.
