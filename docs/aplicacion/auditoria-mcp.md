# Auditoría del MCP (capa delgada)

Fecha: 2026-10-14

## Alcance y referencia

Esta auditoría verifica que `apps/mcp` cumple su contrato de **capa delgada**: no
duplica lógica de negocio, no accede a la base de datos y delega todo al backend
(`apps/api`) a través del cliente tipado `@plantilla-portales/api-client`
(generado desde OpenAPI).

- Referencia versionada del contrato de capa delgada: `apps/mcp/README.md`.
- **No** se usó el steering `.kiro/steering/50-mcp.md`: no está garantizado en
  esta worktree (que parte de `main`), así que la auditoría se apoya solo en el
  README versionado y en el código.
- Archivos revisados: `apps/mcp/src/api.ts`, `config.ts`, `errors.ts`,
  `index.ts`, `server.ts`, `tools/**` y `__tests__/**`.

Las referencias de evidencia son `archivo:línea` relativas a la raíz del
repositorio.

---

## (a) Las tools mapean operaciones del contrato y NO reimplementan reglas de dominio

**Veredicto: Cumple.**

Cada tool se registra con `server.registerTool(...)` y delega en el api-client
tipado mediante el helper común `runApiTool`, sin cálculos, autorización,
validaciones de negocio ni transiciones de estado propias.

- Patrón común (sin lógica de dominio; solo ejecuta la llamada, traduce errores y
  serializa la respuesta): `apps/mcp/src/tools/shared.ts:36` (`runApiTool`) y
  `apps/mcp/src/tools/shared.ts:24` (`okJson`).
- Mapeo 1:1 ruta/método a tool, con el body casteado al DTO del contrato y
  delegado al backend:
  - `apps/mcp/src/tools/request.ts:35` (`request.list` -> `GET /requests`),
    `request.ts:73` (`request.create` -> `POST /requests`, body
    `CreateRequestDto`), `request.ts:87` (`request.update` -> `PATCH
    /requests/{id}`).
  - `apps/mcp/src/tools/governance.ts:32` (`governance.gates.get` -> `GET
    /requests/{id}/gates`), `governance.ts:52` (`gc4.request-validation` -> `POST
    .../GC4/request-validation`). Las descripciones citan la secuencia de estados
    como **documentación** para el LLM; la transición la decide y valida el
    backend (el cuerpo se castea a `AdvanceStageDto` y se delega).
- El único branching en una tool es presentación/control de flujo, no dominio: en
  `apps/mcp/src/tools/health.ts:70` se traduce un 404 de `/dev/actors` a un
  mensaje neutro (la ruta solo existe en backend dev-header). No hay reglas de
  negocio.
- Validación de **forma** aceptable (no es dominio): `apps/mcp/src/tools/audit.ts:91`
  acota `take` a `1..500` y `objectType` a un `z.enum`. El límite 500 replica un
  tope de forma del backend y el enum se mantiene equivalente al contrato por una
  **salvaguarda de equivalencia en tiempo de compilación**
  (`apps/mcp/src/tools/audit.ts:78` `EquivalenceGuard`): si el enum del contrato
  diverge, el `typecheck:mcp` falla a propósito. Es restricción de forma, no
  lógica de dominio.

No se encontró ninguna regla de dominio reimplementada (sin cálculos de
prioridad/score, sin recomputar aprobabilidad de gates, sin decidir
transiciones). Todo eso vive en `apps/api`.

---

## (b) No hay imports de Prisma/@prisma/client/pg ni acceso directo a BD

**Veredicto: Cumple.**

Búsqueda sobre `apps/mcp/src/**/*.ts` de `prisma`, `@prisma/client`, `pg`: **sin
coincidencias**. El MCP no importa ni referencia ningún cliente de base de datos;
su única dependencia de datos es el api-client HTTP.

- Imports del cliente de datos del MCP: `apps/mcp/src/api.ts:11`
  (`createApiClient` de `@plantilla-portales/api-client`). No hay otro origen de
  datos.

---

## (c) Toda llamada sale por el api-client tipado, sin fetch manual ni URLs de negocio hardcodeadas

**Veredicto: Cumple.**

- El cliente se construye una sola vez con la `baseUrl` **de configuración** (no
  hardcodeada): `apps/mcp/src/api.ts:58` (`createApiClient({ baseUrl:
  config.baseUrl })`); `config.baseUrl` proviene de `MCP_API_BASE_URL`
  (`apps/mcp/src/config.ts:76`).
- Todas las tools llaman por `api.client.GET/POST/PATCH` con rutas del contrato
  (p. ej. `apps/mcp/src/tools/request.ts:42`, `governance.ts:44`). No hay `fetch(`
  manual ni URLs absolutas: la búsqueda de `fetch(`, `http://` y `https://` en
  `apps/mcp/src/**` no arroja llamadas de red manuales ni endpoints de negocio
  hardcodeados.
- La identidad se inyecta con un único middleware de request
  (`apps/mcp/src/api.ts:84` `identityMiddleware`), nunca construyendo URLs a mano.

---

## (d) No hay tipado manual de contratos salvo la única excepción documentada

**Veredicto: Cumple (con la única excepción esperada y documentada).**

- Los tipos de DTO de las tools se derivan del contrato con
  `components['schemas'][...]` (p. ej. `apps/mcp/src/tools/request.ts:21-26`,
  `governance.ts:22-23`), no a mano.
- Única excepción permitida: el **body** de `POST /auth/login`. El contrato
  OpenAPI no expone ese `requestBody`, por lo que se tipa a mano con
  `interface LoginBody` en `apps/mcp/src/api.ts:25`, con un comentario que remite
  al DTO del backend. Se verificó que el DTO sigue teniendo exactamente esos dos
  campos: `apps/api/src/modules/auth/dto/login-request.dto.ts:13` (`identifier`) y
  `:18` (`password`). La **respuesta** del login sí sale del contrato:
  `apps/mcp/src/api.ts:17` (`LoginResponse =
  components['schemas']['LoginResponseDto']`).

No se encontró ninguna otra interfaz de contrato tipada a mano.

---

## (e) Config por entorno (fail-fast), stdout reservado al protocolo, token JWT solo en memoria

**Veredicto: Cumple.**

- **Config por entorno con fail-fast:** `apps/mcp/src/config.ts:75` (`loadConfig`)
  lee solo de `process.env` y aborta con mensaje si falta algo obligatorio
  (`fatalConfigError`, `apps/mcp/src/config.ts:55`, que escribe a stderr y
  `process.exit(1)`). El arranque fail-fast se orquesta en
  `apps/mcp/src/index.ts:26`.
- **stdout reservado al protocolo; logging a stderr:** el único logger escribe a
  `process.stderr` (`apps/mcp/src/index.ts:20` `logStderr`); el error de config
  también va a stderr (`apps/mcp/src/config.ts:56`). Búsqueda de `console.log` y
  `process.stdout` en `apps/mcp/src/**`: **sin coincidencias**. El transporte
  stdio (`apps/mcp/src/server.ts:33`) es el único que usa stdout, para el
  protocolo MCP.
- **Token JWT solo en memoria:** el token vive en una variable local del proceso
  (`apps/mcp/src/api.ts:63` `let accessToken`), se inyecta en la cabecera
  `Authorization` (`apps/mcp/src/api.ts:76`) y se actualiza tras un login
  perezoso (`apps/mcp/src/api.ts:109`). Nunca se escribe a disco ni a logs; el
  traductor de errores evita filtrar secretos y URLs con credenciales
  (`apps/mcp/src/errors.ts`).

---

## Veredicto global

**Cumple.** `apps/mcp` se comporta como una capa delgada: mapea tools 1:1 al
contrato OpenAPI, delega toda la lógica de negocio, autorización y validaciones
al backend, no accede a la base de datos, usa exclusivamente el api-client
tipado con `baseUrl` de entorno, respeta stdout para el protocolo (logging a
stderr) y mantiene el token JWT solo en memoria. La única excepción de tipado
manual (body de `POST /auth/login`) está documentada y es la permitida.

**Correcciones aplicadas:** ninguna. No se encontró nada trivial que corregir ni
desviaciones que exigieran mover lógica al backend o cambiar el contrato. No hay
recomendaciones pendientes de decisión del usuario.
