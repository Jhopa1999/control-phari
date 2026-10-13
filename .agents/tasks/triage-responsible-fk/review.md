# Triage "Responsable principal" convertido a FK (`mainResponsibleUserId`)

El commit `27879ce` reemplaza el texto libre `Triage.mainResponsible` por una referencia real a `User` (`mainResponsibleUserId`), atravesando las cinco capas del contrato del monorepo: Prisma + migración, DTO/servicio/controller NestJS, OpenAPI, `@plantilla-portales/api-client` regenerado y el formulario de triage del front. La regla de negocio (el responsable debe ser líder del proceso principal, con respaldo al equipo del proceso si no hay líder) vive en una sola función del backend que alimenta tanto la validación del POST como el desplegable del GET, de modo que el front nunca ofrezca un candidato que el backend rechace. La implementación sigue el diseño aprobado (revisión 2) y el plan al pie de la letra.

Watch for: nada bloqueante. La evidencia de verificación (`verification.md`) reporta typecheck/build/tests/migración en verde (440 tests, 6 nuevos del responsable, exit 0) y fue tratada como autoritativa; no se re-ejecutaron las suites (confirmed). Un par de observaciones menores no bloqueantes se listan abajo.

**Verdict**: APPROVED

## High-level view

La capa Prisma convierte la columna a `main_responsible_user_id UUID` nullable con `onDelete: Restrict`, índice y ambas relaciones `Triage→User` nombradas (`TriageDecidedBy` + `TriageMainResponsible`), que es obligatorio al existir una segunda FK. La migración nueva (`20261013055736`) hace exactamente `DROP COLUMN` del texto viejo + `ADD COLUMN` + índice + FK, sin tocar migraciones aplicadas.

El backend es el dueño de la verdad: una única `eligibleResponsibleIds(request)` calcula los candidatos a partir del `mainProcessId` de la solicitud (líderes activos; si no hay, el equipo del proceso), y la consumen tanto `assertMainResponsibleCandidate` en el POST (400 accionable si el id no es elegible) como `eligibleResponsibles` en el GET. El valor sintáctico lo valida el DTO con `@IsOptional`/`@IsUUID`; la integridad referencial la respalda la FK de PostgreSQL.

El contrato (`TriageResponseDto` con `mainResponsibleUserId` + `mainResponsibleName`, nuevos `TriageContextResponseDto`/`EligibleResponsibleDto`) se regeneró a OpenAPI y a `schema.d.ts` sin edición manual. El front sustituye el `<Input>` de texto por un `<Select>` de nombres con centinela "Sin especificar", carga tolerante a fallo, guarda de condición de carrera y accesibilidad vía el render-prop de `Field`; nunca muestra el UUID crudo y no usa Prisma.

<details>
<summary>Issues (0)</summary>

Sin hallazgos accionables. Dos notas informativas sin acción: el snapshot de auditoría guarda solo `mainResponsibleUserId` (decisión explícita del diseño §2.4, consistente con `decidedByUserId`), y `eligibleResponsibles` no produce duplicados (`distinct: ['userId']` + `user.findMany` por id).

</details>

<details>
<summary>Details</summary>

## Modelo Prisma y migración

El modelo `Triage` cambia `mainResponsible String? @map("main_responsible")` por `mainResponsibleUserId String? @map("main_responsible_user_id") @db.Uuid`, con la relación `mainResponsible User? @relation("TriageMainResponsible", ..., onDelete: Restrict)` y `@@index([mainResponsibleUserId])`. Como ahora hay dos FKs `Triage→User`, ambas relaciones quedan nombradas (`decidedBy` pasa a `@relation("TriageDecidedBy")`) y en `User` se renombra el inverso `triages` a `@relation("TriageDecidedBy")` y se añade `triagesAsMainResponsible @relation("TriageMainResponsible")`. Sin estos nombres Prisma falla con "ambiguous relation"; el diff los incluye los tres. El patrón (`@db.Uuid`, `onDelete: Restrict`, índice) coincide con el resto de FKs a `User` del esquema.

La migración `20261013055736_triage_main_responsible_fk/migration.sql` es nueva (no se editó ninguna aplicada) y hace `DROP COLUMN "main_responsible"`, `ADD COLUMN "main_responsible_user_id" UUID`, crea `triages_main_responsible_user_id_idx` y la `FOREIGN KEY ... REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`. El `onDelete: Restrict` del esquema se traduce correctamente a `ON DELETE RESTRICT`. La nulabilidad del `ADD COLUMN` evita romper filas existentes; `verification.md` confirma además que no había triage legado, así que el `DROP COLUMN` no perdió datos de valor (confirmed).

## Validación de negocio y autorización en el backend

La fuente de verdad es `eligibleResponsibleIds(request)`: primero `grant.findMany({ active: true, processId: request.mainProcessId, role: { code: RoleCode.LIDER_PROCESO }, distinct: ['userId'] })`; si vacío, respalda con todos los grants activos del `mainProcessId`. Depende del proceso de la solicitud, no del actor, que es justo lo que elimina la divergencia desplegable/validación que el diseño marcó como HIGH-1/HIGH-2 (confirmed).

En `create`, `assertMainResponsibleCandidate(request, dto.mainResponsibleUserId)` corre solo si llega un id (`!== undefined`) y antes de abrir la `$transaction`, lanzando `BadRequestException` con `RESPONSIBLE_NOT_ELIGIBLE_MESSAGE` — un 400 accionable que dice qué corregir sin filtrar interno. El orden es correcto: `requireInScope` (404 fuera de alcance) → gate de fase REGISTRADA (409) → catálogos → candidato → transacción, así que un id no elegible no muta nada (confirmed, verificado leyendo el service entre las líneas 178-203). La autorización de ruta (`@Roles(JEFE_AREA, LIDER_PROCESO)`) no cambia.

La integridad referencial queda respaldada por la FK (`onDelete: Restrict`) como última línea; la validación de forma la hace el DTO con `@IsOptional`/`@IsUUID` (un no-UUID → 400 de `ValidationPipe` sin tocar la BD).

## Contrato y DTOs sin UUID crudo

`CreateTriageDto` pierde `mainResponsible` (y su `@IsString/@MaxLength/@Transform`) y gana `mainResponsibleUserId?: string` con `@IsOptional()`/`@IsUUID()`; los imports `Transform/IsString/MaxLength/trim` siguen usados por otros campos, así que no quedan imports muertos (confirmed). `TriageResponseDto` expone `mainResponsibleUserId` + `mainResponsibleName`, siguiendo el patrón del proyecto de no publicar un UUID sin su nombre. El nuevo `TriageContextResponseDto { triages, eligibleResponsibles }` + `EligibleResponsibleDto { id, name }` empaquetan el GET.

El tipado del payload usa `type TriageWithResponsible = Prisma.TriageGetPayload<{ include: { mainResponsible: { select: { id, name } } } }>`, sin `any` ni casts, y `toResponse` resuelve `mainResponsibleName: triage.mainResponsible?.name ?? null`. `findForRequest` resuelve `triages` y `eligibleResponsibleIds` en paralelo y luego `user.findMany({ where: { id: { in } }, orderBy: { name: 'asc' } })`, consumiendo literalmente la misma función que valida el POST.

## api-client regenerado, no editado a mano

El diff de `packages/api-client/src/generated/schema.d.ts` es consistente con los decoradores `@nestjs/swagger` (mismas descripciones y `format: uuid`, nuevos `TriageContextResponseDto`/`EligibleResponsibleDto`, el GET pasa de `TriageResponseDto[]` a `TriageContextResponseDto`). No hay señales de edición manual: los cambios son exactamente los que produce la regeneración. `verification.md` registra `contracts:generate` + `build:api-client` en exit 0.

## Frontend: Select accesible y sin fuga de UUID

`triage-view.tsx` renombra `mainResponsible`→`mainResponsibleUserId` en `TriageFormValues`/`EMPTY_FORM`, carga `eligibleResponsibles` vía `listTriage(id)` al seleccionar la solicitud con guarda de carrera (`selectedRef.current === id`) y `.catch(() => [])` tolerante a fallo. El `<Input>` de texto se reemplaza por un `<Select>` con centinela `NONE`→"Sin especificar" y un `SelectItem` por candidato mostrando `person.name` (nunca el id). El envío usa `selectedOrUndefined(form.mainResponsibleUserId)`, campo opcional. La accesibilidad es real: `Field` en forma render-prop pasa `FieldControlProps` (id, aria-describedby, aria-invalid, aria-required) que se esparcen en `SelectTrigger` vía `{...control}` (confirmed, leído en `components/field.tsx`). `lib/triage.ts` ahora prefiere el `message` del cuerpo de error de NestJS (maneja string y array defensivamente) antes de caer al mapeo por status, propagando el 400 accionable.

## Límites arquitectónicos y TS estricto

Prisma se usa solo en `apps/api`; el front consume `@plantilla-portales/api-client` y no toca Prisma ni la BD. La lógica de negocio y la autorización viven en el service; el controller solo delega. No se introdujo `any` en producción (los `as any` del spec son sobre mocks de Jest, test-only). El cálculo de candidatos no importa `CoordinationScopeService` (Opción A del diseño), manteniendo `request` desacoplado de `coordination`.

## Cobertura de pruebas

`triage.service.spec.ts` añade los 6 casos que pide el diseño §7: líder del proceso → OK y persiste la FK; no elegible con proceso que sí tiene líderes → 400 sin `triage.create` ni `request.update`; proceso sin líderes + miembro → OK vía respaldo; proceso sin líderes + ajeno → 400; `mainResponsibleUserId` undefined → OK sin consultar grants; `findForRequest` publica los mismos candidatos que valida `create` y la query de usuarios usa exactamente los ids elegibles. `verification.md` reporta 440 tests en verde; no se re-ejecutaron (confirmed). No tested: la validación `@IsUUID` a nivel ValidationPipe (e2e) y un flujo Playwright del Select — el diseño confirma que hoy no hay E2E que escriba este campo, omisión aceptada.

</details>

<details>
<summary>Mapa de archivos</summary>

- `apps/api/prisma/schema.prisma` — FK `mainResponsibleUserId`, ambas relaciones `Triage→User` nombradas, índice.
- `apps/api/prisma/migrations/20261013055736_triage_main_responsible_fk/migration.sql` — nueva: DROP texto + ADD UUID + índice + FK Restrict.
- `apps/api/src/modules/request/triage/dto/create-triage.dto.ts` — `mainResponsibleUserId` con `@IsOptional`/`@IsUUID`.
- `apps/api/src/modules/request/triage/dto/triage-response.dto.ts` — `mainResponsibleUserId` + `mainResponsibleName`.
- `apps/api/src/modules/request/triage/dto/triage-context-response.dto.ts` — nuevo: `TriageContextResponseDto` + `EligibleResponsibleDto`.
- `apps/api/src/modules/request/triage/triage.service.ts` — `eligibleResponsibleIds`, `assertMainResponsibleCandidate`, tipado con `include`, GET devuelve contexto.
- `apps/api/src/modules/request/triage/triage.controller.ts` — GET `@ApiResponse` → `TriageContextResponseDto`.
- `apps/api/src/modules/request/triage/triage.service.spec.ts` — mocks `grant`/`user` + 6 casos nuevos.
- `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts` — regenerados.
- `apps/web/src/app/demanda/triage/triage-view.tsx` — `<Select>` de candidatos, carga por solicitud, guarda de carrera.
- `apps/web/src/lib/triage.ts` — `listTriage` → `TriageContext`, mensaje de error desde el body.
- `apps/web/src/lib/api-client.ts` — alias `TriageContext`/`EligibleResponsible`.

Diff completo: `git show 27879ce`.

</details>
