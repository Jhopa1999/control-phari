# Implementation Plan · Responsable principal del Triage como FK (`mainResponsibleUserId`)

Basado en el diseño APROBADO (`.agents/tasks/triage-responsible-fk/design.md`, revisión 2) y su revisión
(`.agents/tasks/triage-responsible-fk/design-review.md`, APPROVED). El plan respeta todas las decisiones del
diseño; no re-decide arquitectura. Todas las rutas son absolutas.

Comandos reales confirmados en `package.json`:
- raíz: `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:web`, `npm run build`,
  `npm run contracts:generate`, `npm run build:api-client`, `npm run test:unit`, `npm run prisma:validate`.
- `apps/api`: `npm run prisma:migrate:dev` (= `prisma migrate dev`), `npm run openapi:generate`, `npm run test`.

Orden obligatorio por dependencia: Prisma/migración → backend DTO/service/controller + spec → regeneración
OpenAPI/api-client → frontend. Cada ítem deja el repo en estado compilable.

NOTA runtime (NIT-2 del review): antes de aplicar la migración del ítem 2, confirmar `SELECT count(*) FROM triages;`
= 0 en la base de desarrollo. Si hubiera filas, el `DROP COLUMN main_responsible` pierde ese texto de prueba
(aceptado explícitamente por el usuario y el diseño: son datos de prueba sin valor). El `ADD COLUMN` nullable no
rompe aunque existan filas.

---

- [ ] 1. Editar el esquema Prisma: convertir el responsable de texto a FK y nombrar ambas relaciones a `User`.
      En el modelo `Triage` (`c:\Users\analistabi2\Desarrollo\control-phari\apps\api\prisma\schema.prisma`):
      quitar `mainResponsible String? @map("main_responsible")`; añadir
      `mainResponsibleUserId String? @map("main_responsible_user_id") @db.Uuid`; añadir la relación nombrada
      `mainResponsible User? @relation("TriageMainResponsible", fields: [mainResponsibleUserId], references: [id], onDelete: Restrict)`;
      renombrar la relación existente a `decidedBy User @relation("TriageDecidedBy", fields: [decidedByUserId], references: [id], onDelete: Restrict)`;
      añadir `@@index([mainResponsibleUserId])`. En el modelo `User`: renombrar `triages Triage[]` →
      `triages Triage[] @relation("TriageDecidedBy")` y añadir `triagesAsMainResponsible Triage[] @relation("TriageMainResponsible")`.
      No tocar `Request.triages` (inverso de `Triage.request`, otra relación). `onDelete: Restrict`, `@db.Uuid` e
      índice siguen el patrón de toda FK a `User` del esquema (verificado: `Grant.user`, `Task.responsible`, etc.).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\prisma\schema.prisma`
      Verify: `npm run prisma:validate` (en raíz, delega a apps/api) termina sin error "ambiguous relation" y sin
      otros errores de validación.

- [ ] 2. Generar la migración versionada (crea el SQL y regenera el cliente Prisma).
      Ejecutar `npm run prisma:migrate:dev -- --name triage_main_responsible_fk` desde
      `c:\Users\analistabi2\Desarrollo\control-phari\apps\api`. Esto crea
      `apps\api\prisma\migrations\<timestamp>_triage_main_responsible_fk\migration.sql` (debe contener
      `DROP COLUMN "main_responsible"`, `ADD COLUMN "main_responsible_user_id" UUID`, el índice y la
      `FOREIGN KEY ... REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`) y encadena `prisma generate`
      regenerando `apps\api\src\generated\prisma\**` (incl. `TriageGetPayload` con la relación `mainResponsible`).
      No editar migraciones ya aplicadas. El renombrado de relaciones del ítem 1 NO altera el SQL (es lógico de
      Prisma). Si el cliente no puede conectar a la base, aplicar igualmente la generación con `prisma migrate dev`
      requiere DB; si la DB no está disponible, dejarlo registrado como bloqueo (no inventar comandos alternativos).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\prisma\migrations\<timestamp>_triage_main_responsible_fk\migration.sql` (nuevo),
      `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\generated\prisma\**` (regenerado)
      Verify: `npm run prisma:migrate:dev -- --name triage_main_responsible_fk` aplica sin error y
      `prisma migrate status` (en apps/api) reporta la base al día.

- [ ] 3. Actualizar `CreateTriageDto`: quitar el texto libre, añadir la FK validada como UUID opcional.
      En `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\dto\create-triage.dto.ts`
      eliminar el campo `mainResponsible` (y su `@MaxLength(255)`/`@IsString`/`@Transform(trim)`). Añadir
      `mainResponsibleUserId?: string` con `@ApiPropertyOptional({ type: String, format: 'uuid', description: ... })`,
      `@IsOptional()` y `@IsUUID()` (importar `IsUUID` de `class-validator`). No tocar los demás campos. La validación
      de negocio (candidato elegible) NO va aquí; va en el service (ítem 6).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\dto\create-triage.dto.ts`
      Verify: incluido en `npm run typecheck:api` del ítem 8 (compila sin error de tipos ni import no usado).

- [ ] 4. Actualizar `TriageResponseDto`: reemplazar `mainResponsible` por `mainResponsibleUserId` + `mainResponsibleName`.
      En `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\dto\triage-response.dto.ts`
      quitar `mainResponsible: string | null`; añadir
      `mainResponsibleUserId!: string | null` (`@ApiProperty({ type: String, format: 'uuid', nullable: true, ... })`) y
      `mainResponsibleName!: string | null` (`@ApiProperty({ type: String, nullable: true, ... })`). Patrón de "nunca
      exponer UUID crudo sin nombre" (como `CapacitySummaryRowDto`, `PortfolioItemResponseDto.responsibleName`).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\dto\triage-response.dto.ts`
      Verify: incluido en `npm run typecheck:api` del ítem 8.

- [ ] 5. Crear el DTO de contexto del GET con la lista de candidatos elegibles.
      Crear `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\dto\triage-context-response.dto.ts`
      con dos clases: `EligibleResponsibleDto { id!: string (uuid); name!: string }` y
      `TriageContextResponseDto { triages!: TriageResponseDto[]; eligibleResponsibles!: EligibleResponsibleDto[] }`,
      ambas con decoradores `@ApiProperty` (usar `type: [TriageResponseDto]` y `type: [EligibleResponsibleDto]` para
      los arrays). Importar `TriageResponseDto` del DTO vecino.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\dto\triage-context-response.dto.ts` (nuevo)
      Verify: incluido en `npm run typecheck:api` del ítem 8.

- [ ] 6. Implementar la lógica de candidatos y la persistencia FK en `TriageService`.
      En `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\triage.service.ts`:
      (a) importar `BadRequestException`; definir la constante `RESPONSIBLE_NOT_ELIGIBLE_MESSAGE` (§2.3.2 del diseño,
      mensaje accionable exacto); (b) añadir el alias de tipo
      `type TriageWithResponsible = Prisma.TriageGetPayload<{ include: { mainResponsible: { select: { id: true; name: true } } } }>`
      y cambiar la firma de `snapshot`/`toResponse` de `TriageModel` a `TriageWithResponsible`; (c) en `snapshot`
      reemplazar `mainResponsible` por `mainResponsibleUserId: triage.mainResponsibleUserId` (solo id, igual que
      `decidedByUserId`); (d) en `toResponse` reemplazar `mainResponsible` por
      `mainResponsibleUserId: triage.mainResponsibleUserId` y `mainResponsibleName: triage.mainResponsible?.name ?? null`;
      (e) añadir la función privada `eligibleResponsibleIds(request): Promise<string[]>` exactamente como §2.3.1
      (primero `prisma.grant.findMany({ where: { active: true, processId: request.mainProcessId, role: { code: 'LIDER_PROCESO' } }, select: { userId: true }, distinct: ['userId'] })`;
      si vacío, respaldo con todos los grants activos del `mainProcessId`); usar `RoleCode.LIDER_PROCESO` de
      `../../auth/role-code`; (f) añadir `assertMainResponsibleCandidate(request, userId)` que lanza
      `BadRequestException(RESPONSIBLE_NOT_ELIGIBLE_MESSAGE)` si el id no está en el conjunto; (g) en `create`, antes
      de la `$transaction` y solo si `dto.mainResponsibleUserId !== undefined`, llamar
      `assertMainResponsibleCandidate(request, dto.mainResponsibleUserId)`; en `tx.triage.create` reemplazar el spread
      de `mainResponsible` por el de `mainResponsibleUserId` y añadir
      `include: { mainResponsible: { select: { id: true, name: true } } }`; (h) cambiar `findForRequest` para devolver
      `TriageContextResponseDto`: el `findMany` lleva el mismo `include`, y `eligibleResponsibles` se resuelve con
      `eligibleResponsibleIds(request)` + `prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })`
      (obtener `request` vía `requireInScope`, que devuelve `RequestModel` con `mainProcessId`). No importar
      `CoordinationScopeService` (decisión Opción A, §2.6).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\triage.service.ts`
      Verify: `npm run test:unit` tras el ítem 7 (los tests del service pasan).

- [ ] 7. Ajustar el controller y actualizar los tests unitarios del service.
      En `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\triage.controller.ts`
      cambiar el `@ApiResponse` del `GET` de `type: [TriageResponseDto]` a `type: TriageContextResponseDto` (importar
      el nuevo DTO). No cambiar autorización (`@Roles(JEFE_AREA, LIDER_PROCESO)`) ni el `POST` (sigue
      `type: TriageResponseDto`). En
      `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\triage.service.spec.ts`:
      añadir `grant: { findMany: jest.fn() }` y `user: { findMany: jest.fn() }` a `createMocks`; en los casos que
      llaman `create` sin responsable no hace falta configurar grants; actualizar el fixture `mainResponsible: null`
      del primer test a `mainResponsibleUserId: null, mainResponsible: null`; añadir los casos nuevos de §7 del diseño
      (candidato líder → OK; candidato no elegible con proceso que sí tiene líderes → 400 sin `triage.create`;
      proceso sin líderes + miembro del proceso → OK vía respaldo; proceso sin líderes + no miembro → 400;
      `mainResponsibleUserId` undefined → OK sin consultar grants; `toResponse` resuelve nombre con la relación
      incluida y `null`→`null`; `findForRequest` publica `eligibleResponsibles` iguales a los que valida `create`).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\triage.controller.ts`,
      `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\src\modules\request\triage\triage.service.spec.ts`
      Verify: `npm run test:unit` (raíz) — todos los tests de `triage.service.spec.ts` pasan, incluidos los nuevos.

- [ ] 8. Typecheck del backend completo.
      Verify: `npm run typecheck:api` (raíz) termina sin errores de tipos (confirma DTOs, service, controller y
      cliente Prisma regenerado alineados).

- [ ] 9. Regenerar el contrato OpenAPI y el paquete `@plantilla-portales/api-client`.
      Ejecutar `npm run contracts:generate` (raíz; corre `openapi:generate` en apps/api →
      `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\openapi\openapi.json`, luego `api-client:generate` →
      `c:\Users\analistabi2\Desarrollo\control-phari\packages\api-client\src\generated\schema.d.ts`) y después
      `npm run build:api-client`. No editar los artefactos generados a mano. Resultado esperado: `CreateTriageDto` sin
      `mainResponsible` y con `mainResponsibleUserId`; `TriageResponseDto` con `mainResponsibleUserId`/`mainResponsibleName`;
      aparecen `TriageContextResponseDto` y `EligibleResponsibleDto`; `GET /requests/:id/triage` referencia
      `TriageContextResponseDto`.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\api\openapi\openapi.json` (regenerado),
      `c:\Users\analistabi2\Desarrollo\control-phari\packages\api-client\src\generated\schema.d.ts` (regenerado)
      Verify: `npm run contracts:generate && npm run build:api-client` terminan sin error; `grep` manual no sustituye
      la verificación — el build del paquete compila los tipos nuevos.

- [ ] 10. Añadir los alias de tipo en el cliente web y ajustar `lib/triage.ts`.
      En `c:\Users\analistabi2\Desarrollo\control-phari\apps\web\src\lib\api-client.ts` añadir
      `export type TriageContext = components['schemas']['TriageContextResponseDto'];` y
      `export type EligibleResponsible = components['schemas']['EligibleResponsibleDto'];` (patrón de los alias
      existentes). En `c:\Users\analistabi2\Desarrollo\control-phari\apps\web\src\lib\triage.ts`: reescribir el
      cuerpo de `listTriage` para devolver `Promise<TriageContext>` (`return data;` ahora es el objeto
      `{ triages, eligibleResponsibles }`, no un array) — importar `TriageContext`; en `toTriageError`/`createTriage`
      preferir el `message` del cuerpo de error de NestJS cuando venga (leer `error.message` del body y, si existe,
      usarlo; si no, caer a `messageForStatus(status)`), para propagar el mensaje accionable del 400 de candidato no
      elegible. No borrar `trimOrUndefined` ni otras funciones aún usadas.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\web\src\lib\api-client.ts`,
      `c:\Users\analistabi2\Desarrollo\control-phari\apps\web\src\lib\triage.ts`
      Verify: incluido en `npm run typecheck:web` del ítem 12.

- [ ] 11. Reemplazar el `<Input>` de texto por un `<Select>` de candidatos en la vista de triage.
      En `c:\Users\analistabi2\Desarrollo\control-phari\apps\web\src\app\demanda\triage\triage-view.tsx`:
      (a) en `TriageFormValues` renombrar `mainResponsible: string` → `mainResponsibleUserId: string` y actualizar
      `EMPTY_FORM`; (b) añadir estado `const [eligibleResponsibles, setEligibleResponsibles] = React.useState<EligibleResponsible[]>([])`
      (importar `EligibleResponsible` y `listTriage`); (c) al seleccionar una solicitud (en `selectRequest`/efecto de
      selección) cargar los candidatos con `listTriage(id).then((c) => setEligibleResponsibles(c.eligibleResponsibles)).catch(() => setEligibleResponsibles([]))`,
      recalculando al cambiar de solicitud (los candidatos dependen del `mainProcessId`); limpiar a `[]` cuando no hay
      selección; (d) reemplazar el bloque `<Field id="triage-responsible"><Input .../></Field>` por un `<Field>` en
      forma render-prop (como `renderCatalogSelect`, para que `SelectTrigger` reciba `control`/aria) con un `<Select>`
      cuyo valor sea `form.mainResponsibleUserId || NONE`, opción `NONE` → "Sin especificar" y un `SelectItem value={c.id}`
      con `c.name` por cada candidato; campo opcional (sin `required`); (e) en `handleSubmit` enviar
      `mainResponsibleUserId: selectedOrUndefined(form.mainResponsibleUserId)` en lugar de
      `mainResponsible: trimOrUndefined(...)`. No mostrar nunca el UUID crudo. Si `eligibleResponsibles` viene vacío,
      el Select muestra solo "Sin especificar" y el usuario puede guardar igual (campo opcional).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\apps\web\src\app\demanda\triage\triage-view.tsx`
      Verify: incluido en `npm run typecheck:web` del ítem 12.

- [ ] 12. Typecheck del frontend.
      Verify: `npm run typecheck:web` (raíz) termina sin errores de tipos (confirma que api-client regenerado,
      `lib/triage.ts`, `lib/api-client.ts` y `triage-view.tsx` compilan juntos).

- [ ] 13. Verificación integral final.
      Ejecutar en orden: `npm run prisma:validate`; `npm run typecheck` (api + api-client + web); `npm run test:unit`;
      `npm run build` (build:api + build:api-client + build:web). NO levantar dev servers (`dev:web`/`dev:api`/
      `start:dev`). Registrar el comando exacto y su resultado para cada uno. Opcional/condicional: `npm run test:e2e`
      solo si existe un flujo Playwright de triage (el review confirmó que hoy no hay E2E que escriba este campo, así
      que puede omitirse si no aplica).
      Verify: `npm run prisma:validate`, `npm run typecheck`, `npm run test:unit` y `npm run build` terminan todos sin
      error.

---

## Notas de decisión (del diseño aprobado, para el implementador)

- La regla de candidatos vive en UNA sola función `eligibleResponsibleIds(request)` consumida tanto por la validación
  del `POST` como por el `eligibleResponsibles` del `GET`, garantizando que el desplegable nunca ofrezca algo que el
  backend rechace (resuelve HIGH-1/HIGH-2). Depende del `mainProcessId` de la solicitud, no del actor.
- `onDelete: Restrict` + `@db.Uuid` + `@@index` es el patrón de toda FK a `User` del esquema; no usar `SetNull`.
- Nombrar AMBAS relaciones `Triage→User` (`TriageDecidedBy` + `TriageMainResponsible`) es obligatorio: al existir una
  segunda FK, Prisma falla con "ambiguous relation" si no se nombran.
- El snapshot de auditoría guarda solo `mainResponsibleUserId` (consistente con `decidedByUserId`); el nombre se
  resuelve por join al leer, no se congela.
- `mainResponsibleName` se añade al contrato por el principio de no exponer UUID crudo y para consumidores futuros;
  en esta tarea el único cambio de UI es la captura (`<Input>` → `<Select>`).
