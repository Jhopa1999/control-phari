# Revisión de diseño: Servidor MCP para control-phari

Revisión en frío del documento `design.md`, verificada contra el código y el contrato reales del repositorio (no contra afirmaciones previas del propio diseño). El diseño ya pasó dos rondas de revisión y su sección "Respuesta a la revisión de diseño" afirma haber resuelto todos los findings anteriores. Esta revisión confirma esas resoluciones de forma independiente y busca problemas residuales.

## Veredicto

APPROVED — 0 findings HIGH, 0 findings MEDIUM. Los findings que siguen son todos NIT (no bloqueantes).

## Resumen de verificación

Verifiqué los puntos de riesgo señalados en el encargo (identidad, granularidad de tools, patrón de registro, cumplimiento del steering, y mapeo tool→operación OpenAPI). Todas las afirmaciones críticas del diseño resultaron correctas al contrastarlas con el código fuente. El diseño es implementable tal como está. Los NIT son precisiones de exactitud o notas de contexto que conviene incorporar pero no alteran la corrección del plan.

---

## Findings

### 1. NIT — El diseño cita el patrón `NonNullable` del frontend como idéntico, pero no lo es

**Dónde:** Caso borde "Enum del contrato ampliado", que afirma que la expresión correcta es "exactamente como ya hace el frontend (`apps/web/src/lib/api-client.ts`: `type AuditEventsQuery = NonNullable<paths['/audit-events']['get']['parameters']['query']>`)".

**Problema:** El frontend aplica **un solo** `NonNullable` sobre el objeto `query` completo y nunca extrae `objectType` por separado. El diseño propone una expresión con **doble** `NonNullable` (sobre `query` y sobre el miembro `objectType`). Ambas son válidas y la del diseño es la correcta para extraer el miembro en modo estricto (verifiqué en `schema.d.ts`: `AuditController_findMany.parameters.query` es `query?` opcional y `objectType?` es opcional, por lo que la ruta cruda produciría `undefined` en el union). Pero decir "exactamente como el frontend" es inexacto: el frontend no hace la doble envoltura.

**Fix concreto:** Ajustar la redacción a: "siguiendo el mismo criterio que el frontend (envolver `query` con `NonNullable` porque es opcional), extendido además al miembro `objectType` que también es opcional". La expresión de código del diseño ya es correcta; solo la atribución "exactamente como el frontend" debe matizarse.

### 2. NIT — El enum `objectType` del contrato (4 valores) está documentado como desalineado del backend real (26 valores); el diseño no lo menciona

**Dónde:** Tool `audit.events.list` y la validación zod `z.enum(['PROCESS','USER','GRANT','CATALOG_ITEM'])`, más el caso borde "Enum del contrato ampliado".

**Problema:** `docs/README.md` (sección "Pendientes de API detectados...") documenta explícitamente que el `@ApiQuery` de `audit.controller.ts` declara solo 4 `objectType`, pero `ListAuditEventsDto` del backend acepta 26 (`OBJECT_TYPES`), y alinearlos es una tarea pendiente conocida. El diseño elige (correctamente, por el steering: el contrato es la fuente de verdad) reflejar los 4 del contrato con un check de equivalencia bidireccional que **rompe `typecheck:mcp`** si el contrato cambia. Esto es coherente y fail-closed, pero el diseño no reconoce que ese cambio de contrato ya está planificado, de modo que un implementador podría sorprenderse cuando esa alineación futura rompa el typecheck del MCP a propósito.

**Fix concreto:** Añadir una frase en el caso borde del enum: "Nota: `docs/README.md` registra como pendiente alinear el `@ApiQuery` del backend a los 26 valores de `OBJECT_TYPES`. Cuando eso ocurra y se regenere el contrato, el check de equivalencia romperá `typecheck:mcp` **a propósito**, forzando a actualizar el `z.enum` de la tool. Es el comportamiento deseado, no un fallo." Esto convierte una sorpresa futura en una expectativa documentada.

### 3. NIT — `expiresIn` descrito como ejemplo `"8h"`; conviene anclar que no se parsea

**Dónde:** Sección "Renovación del token JWT".

**Problema:** El diseño describe `LoginResponseDto.expiresIn` como string tipo `"8h"` y decide no implementar temporizador proactivo (correcto y verificable: `JWT_EXPIRES_IN=8h` en `.env.example`). La afirmación es correcta, pero deja implícito que el valor nunca se usa en código. Como el campo existe en la respuesta tipada, un implementador podría intentar parsearlo.

**Fix concreto:** Añadir una línea explícita: "`expiresIn` se recibe pero **no se parsea ni se usa** en esta iteración; la caducidad se detecta reactivamente por el `401` del backend." Elimina la tentación de parsear un formato humano (`"8h"`, `"30m"`) sin necesidad.

---

## Sección: Supuestos verificados (correctos)

Los siguientes supuestos del diseño fueron contrastados con el código/contrato y resultaron **correctos**:

1. **Identidad dev-header vs jwt y middleware de una sola cabecera.** Verificado en `apps/web/src/lib/api-client.ts`: usa `api.use({ onRequest })` para inyectar `X-Actor-Id` (dev-header) o `Authorization: Bearer` (jwt), nunca ambas. El cliente `createApiClient` devuelve `Client<paths>` de `openapi-fetch`, que expone `.use()`, así que el patrón es factible en el MCP.
2. **Nombres de variables de entorno coherentes con el repo.** `.env.example` raíz usa `AUTH_MODE`, `JWT_SECRET`, `JWT_EXPIRES_IN`; `apps/web/.env.example` usa `NEXT_PUBLIC_API_BASE_URL` y `NEXT_PUBLIC_AUTH_MODE`. Los nuevos `MCP_*` propuestos no colisionan con ninguno existente y replican la semántica ("cualquier valor != jwt se trata como dev-header" coincide con el comentario del frontend).
3. **`GET /health` es público.** Verificado en `apps/api/src/health/health.controller.ts`: no tiene `@UseGuards`. Confirmado además que los guards se aplican por controller (`@UseGuards(CurrentUserGuard, ...)` en audit, user, portfolio, capacity, etc.) y **nunca** como `APP_GUARD` global — el comentario de `auth.module.ts` lo afirma explícitamente ("nunca como APP_GUARD global"). Por tanto `health.check` sin cabecera de identidad es correcto.
4. **`POST /auth/login` responde 200 (no 201) y no tiene requestBody tipado.** Verificado en `openapi.json` (solo respuestas `200` y `401`) y en `schema.d.ts` (`AuthLoginController_login` tiene `requestBody?: never`). No existe `LoginRequestDto` entre los schemas generados (grep: 0 coincidencias). La decisión de tipar un `LoginBody` local mínimo y la regla "éxito = `result.error == null`" son correctas y necesarias.
5. **Doble `NonNullable` necesario para `objectType` en strict.** Verificado en `schema.d.ts`: `query?` y `objectType?` ambos opcionales; la ruta cruda no compilaría en modo estricto. La expresión del diseño es correcta (ver NIT 1 solo por la atribución).
6. **`take` es `type: number` sin `maximum` formal; el 500 vive en la descripción.** Verificado en `openapi.json` (`"schema": { "type": "number" }`, descripción "acotado a 500"). La caracterización del diseño (`z.number().int().positive().max(500)` como restricción local más estricta, no reflejo de un `maximum` tipado) es exacta.
7. **`api-client` exporta `createApiClient`, `paths`, `components`, `operations`.** Verificado en `packages/api-client/src/index.ts`. Su `package.json` publica `exports` **solo** a `dist` (sin subpath `src`), lo que confirma la precondición "api-client debe estar construido antes del `typecheck:mcp`".
8. **Orden actual de scripts raíz coincide con el estado "antes" descrito.** Verificado en `package.json` raíz: `build` termina en `build:web`, `typecheck` termina en `apps/web`, y `workspaces` ya incluye `apps/*`. Los cambios propuestos (añadir `build:mcp`/`typecheck:mcp` al final, sin tocar `workspaces` ni otros scripts) son mínimos y no rompen comandos existentes (`db:*`, `test:unit`, `contracts:generate`, `docker:*` quedan intactos).
9. **Mapeo tool → operación OpenAPI (todas reales, ninguna inventada).** Verificado contra `openapi.json`:
   - `health.check` → `GET /health` ✓; `me.permissions` → `GET /me/permissions` ✓; `dev.actors.list` → `GET /dev/actors` (404 fuera de dev-header, confirmado en el contrato) ✓
   - catalog: `GET/POST /catalog-items`, `GET/PATCH /catalog-items/{id}` ✓
   - process: `GET/POST /processes`, `GET/PATCH /processes/{id}` ✓
   - user: `GET/POST /users`, `GET/PATCH /users/{id}` ✓
   - grant: `GET/POST /grants`, `DELETE /grants/{id}` ✓
   - request: `GET/POST /requests`, `GET/PATCH /requests/{id}`, `GET/POST /requests/{id}/triage`, `POST /requests/{id}/priority`, `GET/POST /requests/{id}/approval` ✓
   - plan/task: `GET/POST /requests/{requestId}/plan`, `POST /requests/{requestId}/plan/submit`, `GET /plans/{planId}/tasks`, `GET /tasks/{id}`, `PATCH /tasks/{id}/status` ✓
   - audit: `GET /audit-events` (con `take`, `objectType`) ✓
   - portfolio: `GET /portfolio` ✓
10. **`request.triage.get` devuelve `TriageContextResponseDto`.** Verificado en `openapi.json`: `GET /requests/{id}/triage` responde `TriageContextResponseDto` (triage + candidatos elegibles), no `TriageResponseDto`. El `POST` sí responde `TriageResponseDto`. Correcto.
11. **Cumplimiento del steering.** El MCP es capa delgada (sin lógica de negocio, sin autorización, sin validación de dominio), no usa Prisma ni PostgreSQL, reutiliza `@plantilla-portales/api-client`, no hardcodea config (todo por env), no crea `.env` reales (solo `.env.example` con placeholders), y se integra como workspace sin tocar la lista `workspaces` ni los scripts existentes. Todo coherente con las reglas obligatorias del steering.

## Sección: Supuestos no verificados / incorrectos

- **No verificable sin ejecución (y el diseño lo trata correctamente como gate, no como hecho):** la compatibilidad de `@modelcontextprotocol/sdk` + `zod` con Node 20.9+ y la resolución `nodenext` de los `exports` ESM del SDK. El diseño no la afirma como cierta: la convierte en un "Paso 0" (fijar versiones) + "gate de factibilidad" (import de prueba + `typecheck:mcp` + arranque) antes de escribir tools, con `bundler` como alternativa. Es el tratamiento correcto para algo no verificable en diseño; no es un finding.
- **Afirmación de atribución inexacta:** "exactamente como el frontend" para el doble `NonNullable` (ver NIT 1). La expresión en sí es correcta; solo la comparación con el frontend es imprecisa.
- **No existe implementación previa que reconciliar:** confirmé que no hay `apps/mcp` en el árbol principal ni en `.worktrees/mcp-server`, así que el diseño parte de cero sin conflictos con código a medio hacer.

Ningún supuesto resultó **falso** en un sentido que comprometa la corrección. Las dos rondas previas ya habían corregido los errores sustantivos (login 200/201, identidad de health, login lazy, doble NonNullable), y esta revisión los confirma resueltos.
