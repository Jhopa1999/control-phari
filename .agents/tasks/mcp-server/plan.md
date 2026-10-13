# Implementation Plan — Servidor MCP para control-phari

Plan derivado del diseño APROBADO (`.agents/tasks/mcp-server/design.md`) y su revisión
(`.agents/tasks/mcp-server/design-review.md`, veredicto APPROVED, solo NITs). Todas las rutas
son absolutas bajo el worktree `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\mcp-server`.

Contexto verificado contra el código real:
- Monorepo npm workspaces; `workspaces: ["apps/*","packages/*"]` ya cubre `apps/mcp` (no se toca la lista).
- `engines.node >= 20.9.0`. Existe `package-lock.json` en la raíz del worktree.
- `packages/api-client` es ESM, `type: module`, `exports` **solo** a `dist` (sin subpath a `src`); su build es
  `tsc -p tsconfig.json && node ./scripts/copy-schema.mjs`. Exporta `createApiClient`, `paths`, `components`, `operations`.
  Su `tsconfig` usa `moduleResolution: bundler` (lo re-empaqueta su consumidor).
- `apps/api` es CommonJS (NestJS). Scripts raíz: `build = build:api && build:api-client && build:web`;
  `typecheck = apps/api && packages/api-client && apps/web`.
- El cliente del frontend (`apps/web/src/lib/api-client.ts`) inyecta UNA sola cabecera de identidad vía `api.use({ onRequest })`
  (`X-Actor-Id` en dev-header, `Authorization: Bearer` en jwt) y lanza error si falta la base URL. Es el patrón a replicar.
- `AuditEventsQuery = NonNullable<paths['/audit-events']['get']['parameters']['query']>` (una sola envoltura en el front).
- OpenAPI confirma TODAS las rutas/métodos mapeados por el diseño (verificado contra `apps/api/openapi/openapi.json`).
- `.env.example` del repo usa placeholders vacíos para secretos (`JWT_SECRET=`); nunca hay `.env` reales versionados.
- `docs/README.md` registra como pendiente alinear el `@ApiQuery` de `objectType` (4 valores) a los 26 de `OBJECT_TYPES`.

Decisiones de secuenciación (orden por dependencia): scaffold + gate de factibilidad primero (desbloquea todo lo demás),
luego la capa de identidad/errores, luego las tools, y por último tests + integración raíz + verificación. Cada ítem deja el
árbol compilable.

- [ ] 1. Crear el scaffold del workspace `apps/mcp` y fijar versiones (PASO 0 del diseño).
      Crear `apps/mcp/package.json` (`@plantilla-portales/mcp`, `private: true`, `type: module`, `main: ./dist/index.js`,
      scripts `build: "tsc -p tsconfig.json"`, `typecheck: "tsc --noEmit -p tsconfig.json"`, `start: "node dist/index.js"`;
      deps `@plantilla-portales/api-client: "*"` y, PINEADAS SIN rango `^`, el último estable de `@modelcontextprotocol/sdk`
      y de `zod` compatibles con Node 20.9+; devDeps `typescript: "5.9.3"` y `@types/node: "26.6.4"` siguiendo apps/api).
      Crear `apps/mcp/tsconfig.json` partiendo del estilo de `packages/api-client/tsconfig.json` PERO con
      `module: nodenext` + `moduleResolution: nodenext` (el MCP se ejecuta con Node y debe resolver los `exports` ESM del SDK),
      `strict`, `noUnusedLocals`, `noUnusedParameters`, `outDir: ./dist`, `rootDir: ./src`, `declaration` opcional.
      Registrar las versiones elegidas del SDK/zod en `docs/README.md` (sección de versiones instaladas).
      Files: `apps/mcp/package.json`, `apps/mcp/tsconfig.json`, `docs/README.md`
      Verify: desde la raíz del worktree, `npm install` instala el nuevo workspace sin errores y crea el symlink de
      `@plantilla-portales/mcp` en `node_modules`.

- [ ] 2. Gate de factibilidad del SDK: entrypoint mínimo + build de api-client + typecheck + arranque.
      Crear `apps/mcp/src/index.ts` mínimo que importe `McpServer` desde `@modelcontextprotocol/sdk/server/mcp.js` y
      `StdioServerTransport` desde `@modelcontextprotocol/sdk/server/stdio.js`, cree un `McpServer` vacío, conecte el transporte
      stdio y mantenga el proceso vivo (sin tools todavía). Debe compilar e importar también `createApiClient` de
      `@plantilla-portales/api-client` para probar la resolución del workspace dep.
      Files: `apps/mcp/src/index.ts`
      Verify: `npm run build:api-client` y luego `npm run typecheck --workspace apps/mcp` resuelven el SDK Y api-client sin
      errores de módulo en modo estricto; `npm run build --workspace apps/mcp` genera `dist/index.js`; `node apps/mcp/dist/index.js`
      arranca sin crash (terminarlo tras confirmar que no sale error). Si `nodenext` no resolviera los `exports` del SDK (improbable
      y distinto de "api-client sin build"), cambiar a `moduleResolution: bundler` y re-verificar; `nodenext` es el valor por defecto.

- [ ] 3. Implementar la configuración por variables de entorno (`config.ts`), fail-fast ante config faltante.
      Crear `apps/mcp/src/config.ts` que lee y valida: `MCP_API_BASE_URL` (obligatoria, error fatal entendible si falta, remitiendo a
      `apps/mcp/.env.example`); `MCP_AUTH_MODE` (default `dev-header`; cualquier valor != `jwt` se trata como dev-header);
      en dev-header exige `MCP_ACTOR_ID` (error fatal si falta); en jwt exige UNA vía de credencial: `MCP_API_TOKEN` directo, o el par
      `MCP_LOGIN_IDENTIFIER` + `MCP_LOGIN_PASSWORD` (error fatal listando las vías aceptadas si no hay ninguna). Expone un objeto de
      config tipado. NO hardcodea valores; NO lee archivos `.env` reales. Solo valida PRESENCIA de config (no ejecuta login).
      Files: `apps/mcp/src/config.ts`
      Verify: `npm run typecheck --workspace apps/mcp` pasa (requiere api-client ya construido del ítem 2).

- [ ] 4. Implementar la capa de API + identidad + helper de login (`api.ts`).
      Crear `apps/mcp/src/api.ts` que construye `createApiClient({ baseUrl })` y registra UN middleware `api.use({ onRequest })` que
      inyecta UNA sola cabecera según el modo (nunca ambas): `X-Actor-Id` en dev-header, `Authorization: Bearer <token>` en jwt,
      replicando `apps/web/src/lib/api-client.ts`. El token se guarda SOLO en memoria del proceso (nunca en disco ni en logs).
      Incluir un helper de login lazy: tipa localmente `interface LoginBody { identifier: string; password: string }` (única excepción
      documentada por la carencia de `requestBody` del contrato, con comentario a `login-request.dto.ts`), llama
      `api.POST('/auth/login', { body })`, trata éxito como `result.error == null`, tipa la respuesta con
      `components['schemas']['LoginResponseDto']`, y guarda `accessToken` en memoria. `expiresIn` se recibe pero NO se parsea ni se usa:
      la caducidad se detecta reactivamente por el 401 del backend. El login NO se ejecuta al arrancar.
      Files: `apps/mcp/src/api.ts`
      Verify: `npm run typecheck --workspace apps/mcp` pasa.

- [ ] 5. Implementar el traductor de errores puro (`errors.ts`).
      Crear `apps/mcp/src/errors.ts` con una función pura `toMcpError(result | exception, context)` que mapea los resultados de
      openapi-fetch y excepciones a resultados MCP con `isError: true` y `content` de texto, según la tabla del diseño:
      éxito 2xx (sin error); 400 "Solicitud inválida" + message; 401 "No autenticado/autorizado"; 403 "sin permiso"; 404 "Recurso no
      encontrado" + id; 409/422 message del backend tal cual; 5xx genérico sin cuerpo; fallo de red "No se pudo contactar la API en
      {baseUrl}"; fallo de validación zod con el campo; error inesperado "Error interno del MCP". NUNCA filtra stack traces, secretos ni
      la URL con credenciales. El logging va SIEMPRE a stderr (stdout reservado al protocolo MCP). El re-login reactivo ante 401 (1 solo
      reintento, solo si hay credenciales de login en memoria) vive aquí o en `api.ts` según acople; documentar dónde.
      Files: `apps/mcp/src/errors.ts`
      Verify: `npm run typecheck --workspace apps/mcp` pasa.

- [ ] 6. Implementar el armazón del servidor y el agregador de tools (`server.ts`, `tools/index.ts`) y reconfigurar `index.ts`.
      Crear `apps/mcp/src/server.ts` que construye el `McpServer`, recibe el contexto `{ server, api }` y conecta
      `StdioServerTransport`. Crear `apps/mcp/src/tools/index.ts` que exporta `registerAll(ctx)` invocando cada
      `register<Modulo>Tools(ctx)` (vacío por ahora, se poblará en el ítem 7). Reescribir `apps/mcp/src/index.ts` para: cargar config
      (`config.ts`), construir api-client + identidad (`api.ts`), crear el server (`server.ts`), llamar `registerAll` y conectar stdio.
      El arranque solo falla por config faltante (fatal, código ≠ 0 a stderr); un fallo de login NO es fatal.
      Files: `apps/mcp/src/server.ts`, `apps/mcp/src/tools/index.ts`, `apps/mcp/src/index.ts`
      Verify: `npm run build:api-client` && `npm run typecheck --workspace apps/mcp` && `npm run build --workspace apps/mcp` pasan;
      `node apps/mcp/dist/index.js` arranca con `MCP_API_BASE_URL` y `MCP_ACTOR_ID` de prueba sin crash.

- [ ] 7. Implementar los módulos de tools con el patrón de registro y validación zod.
      Crear un archivo por módulo bajo `apps/mcp/src/tools/`, cada uno exportando `register<Modulo>Tools(ctx)` que registra sus tools
      con `server.registerTool(name, { description, inputSchema }, handler)`. Cada handler: (1) argumentos ya validados por zod;
      (2) llama al método tipado de api-client con la ruta del contrato; (3) pasa el resultado por `toMcpError`; (4) devuelve `data`
      serializado como texto JSON. Tools sin parámetros declaran `z.object({})` explícito. Tipos derivados del contrato
      (`components['schemas'][...]`, `paths[...]`), sin tipos de dominio a mano. Mapeo exacto a OpenAPI (todas verificadas):
      - `health.ts`: `health.check`→GET /health (SIN cabecera de identidad, ruta pública), `me.permissions`→GET /me/permissions,
        `dev.actors.list`→GET /dev/actors (mensaje neutro de 404 citando disponibilidad en modo dev-header).
      - `catalog.ts`: list/get/create/update → GET/GET{id}/POST/PATCH{id} /catalog-items.
      - `process.ts`: list/get/create/update → /processes.
      - `user.ts`: list/get/create/update → /users.
      - `grant.ts`: list→GET, create→POST, delete→DELETE /grants/{id}.
      - `request.ts`: list/get/create/update; `request.triage.get`→GET /requests/{id}/triage (respuesta
        `TriageContextResponseDto`); `request.triage.create`→POST; `request.priority.create`→POST /requests/{id}/priority;
        `request.approval.get`→GET; `request.approval.create`→POST /requests/{id}/approval.
      - `plan.ts` (incluye task): `plan.get`→GET, `plan.create`→POST /requests/{requestId}/plan; `plan.submit`→POST .../plan/submit;
        `plan.tasks.list`→GET /plans/{planId}/tasks; `task.get`→GET /tasks/{id}; `task.status.update`→PATCH /tasks/{id}/status.
      - `audit.ts`: `audit.events.list`→GET /audit-events con `take` (`z.number().int().positive().max(500).optional()`, restricción
        local más estricta que el contrato) y `objectType` (`z.enum(['PROCESS','USER','GRANT','CATALOG_ITEM']).optional()`), más la
        comprobación de equivalencia bidireccional contra `NonNullable<NonNullable<paths['/audit-events']['get']['parameters']['query']>['objectType']>`
        que rompe `typecheck:mcp` a propósito si el contrato diverge (nota: `docs/README.md` registra como pendiente ampliar a 26 valores;
        cuando ocurra, este typecheck fallará intencionadamente y habrá que actualizar el `z.enum`).
      - `portfolio.ts`: `portfolio.get`→GET /portfolio.
      Poblar `tools/index.ts` para invocar todos los `register<Modulo>Tools`.
      Files: `apps/mcp/src/tools/health.ts`, `apps/mcp/src/tools/catalog.ts`, `apps/mcp/src/tools/process.ts`,
      `apps/mcp/src/tools/user.ts`, `apps/mcp/src/tools/grant.ts`, `apps/mcp/src/tools/request.ts`, `apps/mcp/src/tools/plan.ts`,
      `apps/mcp/src/tools/audit.ts`, `apps/mcp/src/tools/portfolio.ts`, `apps/mcp/src/tools/index.ts`
      Verify: `npm run build:api-client` && `npm run typecheck --workspace apps/mcp` && `npm run build --workspace apps/mcp` pasan.

- [ ] 8. Añadir unit tests sin red (config, errors, un par de inputSchema).
      Elegir framework: Jest-ESM alineado al repo o, preferido si Jest-ESM añade fricción en un workspace ESM puro, el runner nativo de
      Node (`node --test`, sin dependencias nuevas). Documentar la decisión. Pruebas: (a) `config.ts` para cada combinación de env vars
      (presencia/ausencia, cada modo); (b) `errors.ts` `toMcpError` por cada código de estado; (c) el `inputSchema` de 1-2 tools
      representativas (rechaza inputs mal formados, acepta válidos) con un api-client mockeado. No se prueban reglas de negocio.
      Añadir un script `test` propio en `apps/mcp/package.json`; NO tocar el agregado `test:unit` de la raíz (sigue siendo solo apps/api).
      Files: `apps/mcp/package.json`, `apps/mcp/src/*.test.ts` (o `apps/mcp/test/*`), config de test si aplica
      Verify: `npm run test --workspace apps/mcp` pasa todas las pruebas nuevas.

- [ ] 9. Crear `.env.example` y `README.md` del workspace.
      Crear `apps/mcp/.env.example` documentando `MCP_API_BASE_URL`, `MCP_AUTH_MODE`, `MCP_ACTOR_ID`, `MCP_API_TOKEN`,
      `MCP_LOGIN_IDENTIFIER`, `MCP_LOGIN_PASSWORD`, con placeholders VACÍOS para secretos (token/password), siguiendo el estilo de
      `.env.example` raíz y `apps/web/.env.example`. Crear `apps/mcp/README.md` con: variables de entorno, cómo configurar cada modo,
      cómo arrancar (`node dist/index.js`), la precondición `npm run build:api-client && npm run typecheck:mcp`, y el comando
      reproducible del smoke test por stdio (initialize + tools/list). NO crear archivos `.env` reales.
      Files: `apps/mcp/.env.example`, `apps/mcp/README.md`
      Verify: revisión manual de contenido; `apps/mcp/.env.example` no contiene secretos reales.

- [ ] 10. Integrar el MCP en el `package.json` raíz (mínimo, sin romper orden ni comandos).
      Añadir `"build:mcp": "npm run build --workspace apps/mcp"` y `"typecheck:mcp": "npm run typecheck --workspace apps/mcp"`.
      Extender `build` a `... && npm run build:web && npm run build:mcp` (mcp al final, tras api-client). Extender `typecheck` a
      `... && npm run typecheck --workspace apps/web && npm run typecheck --workspace apps/mcp` (mcp al final). NO modificar `workspaces`
      ni ningún otro script (`db:*`, `test:unit`, `test:e2e`, `contracts:generate`, `docker:*`, `dev:*` quedan intactos y en su orden).
      Files: `package.json` (raíz del worktree)
      Verify: `npm run typecheck` (agregado, incluye MCP) pasa tras `npm run build:api-client`; `npm run build` completo
      (api → api-client → web → mcp) termina sin error.

- [ ] 11. Verificación integral y smoke test por stdio; limpieza de temporales.
      Ejecutar, desde la raíz del worktree y en este orden: `npm install`; `npm run build:api-client` (precondición del typecheck del MCP);
      `npm run typecheck` (agregado, incluye MCP); `npm run build:mcp`. Smoke test: arrancar `node apps/mcp/dist/index.js` con
      `MCP_API_BASE_URL` y una identidad mínima (`MCP_ACTOR_ID`), enviar por stdin los mensajes JSON-RPC MCP `initialize` y `tools/list`,
      y confirmar (a) el handshake responde y (b) `tools/list` devuelve TODAS las tools esperadas, cada una con `inputSchema` (incluidas
      las sin parámetros, por `z.object({})`), SIN backend vivo (login lazy). Eliminar cualquier archivo temporal creado para el smoke
      (scripts de prueba, cualquier `.env` local accidental). No debe quedar ningún `.env` real versionado.
      Files: ninguno nuevo (verificación)
      Verify: todos los comandos anteriores terminan en éxito; el smoke test lista las tools; `git status` no muestra archivos
      temporales ni `.env` reales añadidos.

## Supuestos y notas

- La versión concreta del SDK/zod se fija en el ítem 1 (PASO 0): último estable compatible con Node 20.9+, pineado sin `^`.
  Si en implementación el SDK exigiera una versión mínima de Node mayor que 20.9, se documenta y se usa la última versión del SDK que
  sí soporte 20.9.
- `moduleResolution: nodenext` es la opción por defecto; `bundler` es el fallback solo si el gate del ítem 2 demuestra que `nodenext`
  no resuelve los `exports` del SDK (improbable y distinto del fallo por api-client sin construir).
- Framework de test (ítem 8): se prefiere `node --test` si configurar Jest-ESM resulta costoso, sin tocar `test:unit`.
