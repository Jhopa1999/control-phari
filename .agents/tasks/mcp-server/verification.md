# Verificacion — Servidor MCP, FEAT-001 (scaffold + PASO 0 + gate de factibilidad)

Scaffold del workspace `apps/mcp`: servidor Model Context Protocol sobre stdio,
capa delgada que reutiliza `@plantilla-portales/api-client` y resuelve el SDK.
Sin tools todavia (FEAT-002+). Todo el logging va a stderr; stdout queda para el
protocolo MCP.

## Versiones elegidas (PASO 0, pineadas SIN rango `^`)

- `@modelcontextprotocol/sdk`: **1.32.1** — `latest` estable del SDK de
  TypeScript; `engines.node` = `>=18` (OK con Node 20.9+). La linea v2 es
  preliminar en el momento del andamiaje, por eso no se usa.
- `zod`: **4.6.7** — ultimo estable. El peer del SDK admite `^3.25 || ^4.0`,
  asi que 4.x es compatible.
- Dev: `typescript@5.9.3`, `@types/node@26.6.4` (igual que apps/api).

Registradas en `docs/README.md` (seccion "Servidor MCP (apps/mcp)").

## Archivos creados/modificados

Creados (apps/mcp):
- `apps/mcp/package.json` — `@plantilla-portales/mcp`, `type: module`,
  `main ./dist/index.js`; scripts `build`/`typecheck`/`start`; deps SDK+zod
  pineadas y `@plantilla-portales/api-client: *`.
- `apps/mcp/tsconfig.json` — estilo de `packages/api-client` (ES2021, strict,
  esModuleInterop, skipLibCheck, forceConsistentCasingInFileNames,
  noUnusedLocals, noUnusedParameters) PERO con `module`/`moduleResolution` =
  `nodenext` y `lib ['ES2021']`.
- `apps/mcp/src/index.ts` — McpServer minimo + StdioServerTransport; importa
  `createApiClient` (para probar la resolucion del workspace dep); logging a
  stderr; proceso vivo sin tools.

Modificados (raiz):
- `package.json` (raiz) — se EXTENDIO `build` (+`build:mcp`) y `typecheck`
  (+`typecheck --workspace apps/mcp`); se anadieron `build:mcp` y
  `typecheck:mcp`. No se toco la lista `workspaces` ni ningun script existente.
- `docs/README.md` — seccion de versiones del MCP; item de pendientes de MCP
  actualizado a "scaffold inicial listo".

## Fix de raiz en packages/api-client (resolucion ESM para Node)

El smoke test inicial fallo con `ERR_MODULE_NOT_FOUND` al cargar
`@plantilla-portales/api-client`: su `dist/index.js` emitia `from './client'`
SIN extension `.js`, y el loader ESM nativo de Node exige extensiones
explicitas. Bug latente del paquete compartido (su tsconfig usaba
`moduleResolution: 'bundler'`), que el MCP es el PRIMER consumidor en ejecutar
bajo Node ESM (apps/web lo toleraba porque Next.js lo bundlea). El acceptance
criterion de FEAT-001 exige arrancar sin crash, asi que se corrigio de raiz
(aprobado por el padre del workflow).

Cambio MINIMO, solo resolucion de modulos ESM — NO altera el contrato ni las
firmas publicas del api-client:
- `packages/api-client/src/index.ts` — imports relativos con extension:
  `./client` -> `./client.js`, `./generated/schema` -> `./generated/schema.js`.
- `packages/api-client/src/client.ts` — `./generated/schema` ->
  `./generated/schema.js`.
- `packages/api-client/tsconfig.json` — `module` y `moduleResolution` de
  `ESNext`/`bundler` a `nodenext` (lib `['ES2021','DOM']` sin cambios).

Emitido tras rebuild: `dist/index.js` ahora hace `from './client.js'` (ESM
valido para Node). Los exports de tipos (`schema.js`) se eliden en runtime.

Supervivencia a `contracts:generate`: el generador (`openapi-typescript`) solo
reescribe `src/generated/schema.d.ts`, que es un archivo de PUROS tipos SIN
imports relativos (verificado: 0 coincidencias de `import`/`from './`). Los dos
archivos editados son fuente hecha a mano, no generada, asi que el fix NO se
reintroduce en el proximo `contracts:generate`. No hizo falta tocar el generador
ni `copy-schema.mjs`.

## Verificacion — comandos y resultado real

Orden del worktree:
1. `npm install` (raiz) -> OK. `added 1021 packages`. Crea el symlink (junction)
   `node_modules/@plantilla-portales/mcp` -> `apps/mcp`.
2. `npm run build:api-client` -> OK (precondicion: el `exports` de api-client
   apunta solo a `dist`).
3. `npm run typecheck --workspace packages/api-client` -> OK (estricto, tras el
   fix ESM).
4. `npm run typecheck --workspace apps/mcp` -> OK (estricto; resuelve el SDK Y
   api-client con `nodenext`, sin errores de modulo).
5. `npm run build --workspace apps/mcp` -> OK; genera `apps/mcp/dist/index.js`.

Impacto en el frontend (api-client es consumido por apps/web):
- `npm run typecheck:web` -> **OK, sin errores**. Confirma que el cambio de
  api-client NO rompe la resolucion de tipos del frontend.
- `npm run build:web` -> compila y pasa TypeScript ("Compiled successfully",
  "Finished TypeScript"), pero FALLA en el prerender estatico con
  `Error: Falta la configuracion NEXT_PUBLIC_API_BASE_URL`. Es una restriccion
  del ENTORNO (sin `.env.local`; politica: no crear `.env` reales), NO una
  regresion del fix: `apps/web/src/lib/api-client.ts` lanza a proposito si falta
  la variable al prerenderizar. La resolucion de api-client funciono (el modulo
  cargo y compilo). La autoridad sobre "no rompe al frontend" es el
  `typecheck:web` en verde.

## Smoke test MCP (stdio, SIN backend vivo)

`node apps/mcp/dist/index.js` con `MCP_API_BASE_URL=http://localhost:3001` y
`MCP_ACTOR_ID=jefe@demo.local`, enviando por stdin los mensajes JSON-RPC MCP
`initialize`, `notifications/initialized` y `tools/list`:

- NO hay `ERR_MODULE_NOT_FOUND`: el SDK y api-client resuelven en runtime.
- stderr: "MCP server conectado por stdio." (log a stderr, correcto).
- `initialize` -> respuesta valida con `protocolVersion`, `capabilities` y
  `serverInfo { name: "@plantilla-portales/mcp", version: "0.1.0" }`. Handshake OK.
- `tools/list` -> `-32601 Method not found`. ESPERADO en FEAT-001: el scaffold
  no registra tools todavia, por lo que el server no anuncia la capability
  `tools`. Las tools llegan en features siguientes. El gate de factibilidad
  (arranca sin crash, resuelve SDK + api-client) se cumple.
- Exit code 0; proceso terminado tras el handshake.

Limpieza: se eliminaron los logs temporales del smoke test
(`mcp-stderr.log`, `mcp-stdout.log`). No se crearon `.env` reales.

## Nota para el revisor

El unico cambio fuera de `apps/mcp` y de los scripts raiz es la correccion ESM
de `packages/api-client` (3 archivos: `src/index.ts`, `src/client.ts`,
`tsconfig.json`). Es puramente de resolucion de modulos; `typecheck:web` en
verde confirma que el frontend sigue consumiendo el paquete sin cambios de
comportamiento ni de API. `build:web` solo falla por falta de
`NEXT_PUBLIC_API_BASE_URL` en el entorno (prerender), no por el fix.
