# Diseño · Responsable principal del Triage como referencia real a persona (FK)

> **Revisión 2.** Este documento incorpora los hallazgos de
> `.agents/tasks/triage-responsible-fk/design-review.md` (3 HIGH, 2 MEDIUM, 3 NIT).
> Las respuestas puntuales a cada hallazgo están en §10. Los cambios de fondo
> respecto a la revisión 1 son: (a) la fuente de candidatos del desplegable y la
> validación del backend ahora comparten **una sola** definición (§2.3/§5.1);
> (b) se nombra explícitamente la relación `decidedBy` al añadir la segunda FK a
> `User` (§1.1); (c) se fija el tipo del payload con `include` (§2.4); (d) se
> decide y justifica el mensaje de error accionable (§2.3/§5.2).

## Overview

Hoy el "Responsable principal" del Triage es texto libre (`Triage.mainResponsible String? @map("main_responsible")` en Prisma, `CreateTriageDto.mainResponsible?: string`, `TriageResponseDto.mainResponsible: string | null`, y un `<Input>` de texto en `triage-view.tsx`). Es deuda técnica: no referencia a una persona real, no es validable y no puede resolverse a un nombre canónico ni enlazarse con el resto del modelo (grants, procesos).

Este diseño convierte ese campo en una **referencia real a un `User`** —el líder del proceso principal de la solicitud— eliminando por completo el texto libre. El cambio atraviesa las cinco capas del contrato del monorepo: **Prisma + migración → servicio/DTO NestJS → generación OpenAPI → regeneración de `@plantilla-portales/api-client` → frontend del Triage**. La lógica de negocio y la autorización viven **siempre** en el backend; el frontend solo presenta un desplegable y envía un id.

Como la base de desarrollo fue reseteada (no hay triage legado), se elimina el campo viejo y se deja únicamente la FK, sin período de convivencia ni migración de datos. El stack queda fijado y **no se discute más una vez aprobado**: Prisma 7 (adapter pg), NestJS 11 + `class-validator`/`class-transformer`, `@nestjs/swagger` → OpenAPI JSON, `openapi-typescript` → `schema.d.ts`, Next.js App Router + shadcn/ui.

**Decisión transversal de alcance (confirmada):** el desplegable se alimenta con el conjunto de candidatos **elegibles** del proceso principal, calculado por el **backend**. Para no crear un endpoint nuevo ni duplicar lógica de autorización en el front (§5.1), ese conjunto se expone en la **respuesta del propio recurso de triage** (`GET /requests/:id/triage`, campo auxiliar `eligibleResponsibles`). El backend valida contra **exactamente la misma** definición de candidatos que publica, de modo que el front nunca ofrece una opción que el backend luego rechace. Esto resuelve de raíz los hallazgos HIGH-1 y HIGH-2 (divergencia front/back) manteniendo la regla "el backend es el dueño de la verdad".

---

## 1. Capa Prisma + migración

### 1.1 Decisión de modelo

En `apps/api/prisma/schema.prisma`, modelo `Triage`:

- **Eliminar** `mainResponsible String? @map("main_responsible")`.
- **Agregar** la FK y su relación nombrada:

```prisma
mainResponsibleUserId String?  @map("main_responsible_user_id") @db.Uuid
// ... (campos existentes) ...

request        Request @relation(fields: [requestId], references: [id], onDelete: Cascade)
decidedBy      User    @relation("TriageDecidedBy", fields: [decidedByUserId], references: [id], onDelete: Restrict)
mainResponsible User?   @relation("TriageMainResponsible", fields: [mainResponsibleUserId], references: [id], onDelete: Restrict)

@@index([requestId])
@@index([decidedByUserId])
@@index([mainResponsibleUserId])
@@map("triages")
```

**Nombrar también `decidedBy` es obligatorio (hallazgo A, HIGH).** Hoy `decidedBy` es la **única** FK de `Triage` hacia `User`, por eso Prisma no exige `@relation(name:...)` y su inverso en `User` es `triages Triage[]` sin `name`. Al añadir una **segunda** FK a `User` (`mainResponsible`), Prisma deja de poder desambiguar y exige nombrar **ambas** relaciones. Por tanto, además de la nueva relación:

- Se añade `@relation("TriageDecidedBy")` a `decidedBy` en `Triage`.
- Se renombra el inverso en `User`: `triages Triage[]` → `triages Triage[] @relation("TriageDecidedBy")`.
- Se añade el inverso de la nueva relación en `User`: `triagesAsMainResponsible Triage[] @relation("TriageMainResponsible")`.

Sin estos tres cambios, `prisma validate`/`prisma migrate dev` falla con *"ambiguous relation"*. (El `triages Triage[]` del modelo `Request` **no** se toca: es el inverso de `Triage.request`, otra relación distinta.)

Decisiones justificadas:

- **Nombre `mainResponsibleUserId` / `@map("main_responsible_user_id")` / `@db.Uuid`**: confirmado. Es el patrón de toda FK a `User` del esquema (`decidedByUserId`/`decided_by_user_id`, `Task.responsibleUserId`/`responsible_user_id`, `blockedByUserId`), todas `@db.Uuid`.
- **Nullable (`String?`) → campo OPCIONAL**: confirmado. Hoy `mainResponsible` ya es opcional y el formulario no lo exige; mantener la opcionalidad preserva el contrato de comportamiento y no bloquea el triage cuando el proceso aún no tiene líder (ver §2.3). Hacerlo obligatorio sería una regla de negocio nueva no pedida.
- **`onDelete: Restrict`** (no `SetNull`): por **consistencia con todo el esquema**. Cada FK a `User` del proyecto usa `onDelete: Restrict` y los `User` se desactivan por soft-delete (`active=false`), nunca se borran físicamente. `Restrict` protege el histórico de triage. `SetNull` solo tendría sentido si se esperara borrado físico con pérdida tolerable de la referencia, lo que contradice el patrón del dominio.
- **Índice `@@index([mainResponsibleUserId])`**: igual que el proyecto indexa toda FK (`@@index([decidedByUserId])` ya existe). Sirve a joins/filtros por responsable y a la integridad referencial.

### 1.2 Migración versionada

Script real (confirmado en `apps/api/package.json`: `"prisma:migrate:dev": "prisma migrate dev"`). No se editan migraciones aplicadas (hay 9; la última confirmada es `20261009200659_add_user_password_hash`):

```
npm run prisma:migrate:dev --workspace apps/api -- --name triage_main_responsible_fk
```

El SQL generado debe: `DROP COLUMN "main_responsible"`, `ADD COLUMN "main_responsible_user_id" UUID`, crear el índice y la `FOREIGN KEY ... REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE` (`ON UPDATE CASCADE` es el default de Prisma; `Restrict` genera `ON DELETE RESTRICT`). Renombrar la relación `decidedBy` **no** cambia el SQL (el nombre de relación es lógico de Prisma; la columna `decided_by_user_id` y su FK no se alteran). Como la base está reseteada y el único Request de prueba (`FIBI`, REGISTRADA) no tiene triage, **no hay backfill ni data migration**: el `DROP COLUMN` no pierde datos de valor. `migrate dev` encadena `prisma generate`, que regenera el cliente en `apps/api/src/generated/prisma`.

Edge case de integridad: no hay filas en `triages`, así que `DROP`/`ADD` es seguro. Si las hubiera, el `ADD COLUMN` nullable no rompería (quedarían en `NULL`); se parte del hecho confirmado de que no las hay.

---

## 2. Capa servicio / DTO NestJS (módulo `request`, submódulo `triage`)

Toda la lógica nueva vive en `apps/api/src/modules/request/triage/` —el submódulo dueño del triage—. **No se toca `coordination`** ni se importa `CoordinationScopeService` (ver decisión de dependencia en §2.6).

### 2.1 `CreateTriageDto` (`dto/create-triage.dto.ts`)

- **Eliminar** el campo `mainResponsible` (`@IsOptional/@IsString/@MaxLength(255)`).
- **Agregar**:

```ts
@ApiPropertyOptional({
  type: String,
  format: 'uuid',
  description: 'Responsable principal: id de un líder del proceso principal de la solicitud.',
})
@IsOptional()
@IsUUID()
mainResponsibleUserId?: string;
```

Validación de **forma** (class-validator): `@IsOptional()` + `@IsUUID()`. Un valor no-UUID → **400** por la `ValidationPipe` global, sin tocar la base. La validación de **negocio** (que ese usuario sea candidato elegible) no es del DTO sino del service (§2.3), porque requiere consultar grants/proceso.

### 2.2 `TriageResponseDto` (`dto/triage-response.dto.ts`)

Se reemplaza `mainResponsible: string | null` por **dos** campos, siguiendo el patrón del proyecto de **nunca exponer un UUID crudo sin su nombre** (`CapacitySummaryRowDto { userId, userName }`, `PortfolioItemResponseDto.responsibleName`):

```ts
@ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Id del responsable principal (líder de proceso).' })
mainResponsibleUserId!: string | null;

@ApiProperty({ type: String, nullable: true, description: 'Nombre del responsable principal resuelto.' })
mainResponsibleName!: string | null;
```

El id permite al front re-seleccionar en el desplegable y mantener el contrato tipado; el nombre permite mostrar texto legible sin que el front resuelva el UUID. Mismo criterio ya usado en capacity y portfolio.

### 2.3 Definición única de candidatos elegibles y autorización (`triage.service.ts`)

La autorización de "quién puede registrar triage" ya existe y **no cambia**: `TriageController` exige `@Roles(JEFE_AREA, LIDER_PROCESO)` y el service llama `state.requireInScope(actor, requestId)` (404 si la Request está fuera del alcance del actor). Lo nuevo es la regla del **candidato referenciado**, que debe ser **idéntica** en el cálculo que publica el backend (para el desplegable) y en la validación del `POST`.

#### 2.3.1 La función canónica `eligibleResponsibleIds(request)`

Se añade una función privada **única** en `TriageService`, fuente de verdad del conjunto de candidatos para una Request concreta. **No depende del actor**: depende solo del proceso principal de la solicitud, de modo que el desplegable y la validación coincidan exactamente (resuelve HIGH-1 y HIGH-2).

```
async eligibleResponsibleIds(request): Promise<string[]> {
  // Por defecto: líderes activos del proceso principal.
  const leaders = await prisma.grant.findMany({
    where: { active: true, processId: request.mainProcessId, role: { code: 'LIDER_PROCESO' } },
    select: { userId: true }, distinct: ['userId'],
  });
  if (leaders.length > 0) return leaders.map(g => g.userId);

  // Respaldo (preferencia del usuario): el proceso principal NO tiene ningún
  // líder → no bloquear el triage. Candidatos = TODAS las personas con grant
  // activo (cualquier roleCode) en el proceso principal.
  const members = await prisma.grant.findMany({
    where: { active: true, processId: request.mainProcessId },
    select: { userId: true }, distinct: ['userId'],
  });
  return members.map(g => g.userId);
}
```

Decisiones justificadas:

- **Por defecto = líderes del proceso principal.** Encaja de forma natural con el modelo de autorización existente: el "líder de proceso" solo existe como `Grant{ roleCode: LIDER_PROCESO, processId, active }` (confirmado: `ProcessResponseDto` no tiene campo de líder; `Grant` tiene relación `role` con `Role.code`, así que `role: { code: 'LIDER_PROCESO' }` es un `where` válido). `request.mainProcessId` viene de `requireInScope` (devuelve `RequestModel`).
- **Respaldo basado en el PROCESO PRINCIPAL, no en el actor (cambio frente a la revisión 1).** La revisión 1 proponía respaldar con "personas en alcance del actor" (espejo de `peopleWhere`), pero eso hacía que el conjunto dependiera de **quién** registra el triage y divergiera del desplegable (HIGH-1). Aquí el respaldo son **las personas con grant activo en `request.mainProcessId`** —el equipo del proceso que ejecutará el proyecto— independientemente del actor. Es un conjunto bien definido, estable, derivable solo de `Grant`, y coherente con la intención: "si no hay líder formal, elige a alguien del propio proceso". Encaja con el modelo (es un subconjunto de `Grant`), no introduce un segundo modelo de permisos.
- **El conjunto NO usa `scopedProcessIds` ni `CoordinationScopeService.peopleWhere`.** Se verificó en `coordination-scope.service.ts` que `peopleWhere` para un no-jefe se basa en `leaderProcessIds` (procesos donde el actor es líder) + su propio `userId`, **no** en `scopedProcessIds`. Reutilizar cualquiera de esos dos conjuntos ataría los candidatos al actor y no al proceso de la solicitud, reintroduciendo la divergencia. Por eso el cálculo se hace aquí, acotado al `mainProcessId`.

#### 2.3.2 Validación en el `POST` (`create`)

Nueva función privada `assertMainResponsibleCandidate(request, userId)`, ejecutada **antes** de abrir la `$transaction`, solo si `dto.mainResponsibleUserId !== undefined`:

```
1. const ids = new Set(await eligibleResponsibleIds(request));
2. if (!ids.has(dto.mainResponsibleUserId))
     throw new BadRequestException(RESPONSIBLE_NOT_ELIGIBLE_MESSAGE);
```

donde `RESPONSIBLE_NOT_ELIGIBLE_MESSAGE` es un **mensaje accionable y específico** (resuelve HIGH-2):

```ts
const RESPONSIBLE_NOT_ELIGIBLE_MESSAGE =
  'El responsable principal debe ser un líder (o integrante, si no hay líder) del proceso principal de la solicitud.';
```

Decisión sobre la excepción HTTP: **`BadRequestException` (400)** con **mensaje propio** (no el genérico "Revisa los datos ingresados."). El valor es sintácticamente válido (UUID) pero no cumple la regla de negocio del campo: es dato inválido del cliente (400), no 403 (el actor sí puede registrar triage; lo que falla es el *valor*) ni 404 (no se resuelve una ruta ausente). Se usa mensaje específico porque, aunque el desplegable ya solo ofrece candidatos elegibles (§5), un cliente directo de la API podría enviar otro id; el mensaje debe decir *qué* corregir (regla de UX/errores accionables). No filtra información interna. El front mapeará este 400 a su `message` (ver §5.2 y §2.5).

Nota de coherencia: en la **ruta feliz** el desplegable solo contiene ids de `eligibleResponsibleIds(request)` (los mismos que valida el backend), así que el 400 por candidato no elegible deja de ser un caso sistemático y pasa a ser defensa para clientes de API no-UI.

### 2.4 Persistencia, lectura y tipos

En la `$transaction`, el `tx.triage.create.data` reemplaza el spread de `mainResponsible` por:

```ts
...(dto.mainResponsibleUserId !== undefined
  ? { mainResponsibleUserId: dto.mainResponsibleUserId }
  : {}),
```

**Tipo del payload con `include` (resuelve MEDIUM-3).** `toResponse`/`snapshot` dejan de tipar `TriageModel` plano (que no trae relaciones) y pasan a un alias explícito —`TriageGetPayload` existe en `apps/api/src/generated/prisma/models/Triage.ts`, verificado—:

```ts
type TriageWithResponsible = Prisma.TriageGetPayload<{
  include: { mainResponsible: { select: { id: true; name: true } } };
}>;

private toResponse(triage: TriageWithResponsible): TriageResponseDto { ... }
private snapshot(triage: TriageWithResponsible): Prisma.InputJsonValue { ... }
```

Esto mantiene TS estricto sin `any` ni casts. Ambas lecturas cargan la relación:

- `findForRequest`: `prisma.triage.findMany({ where, orderBy, include: { mainResponsible: { select: { id: true, name: true } } } })`.
- `create`: `tx.triage.create({ data, include: { mainResponsible: { select: { id: true, name: true } } } })` (hoy no lleva `include`; se añade).

`toResponse` mapea:

```ts
mainResponsibleUserId: triage.mainResponsibleUserId,
mainResponsibleName: triage.mainResponsible?.name ?? null,
```

Edge case: `mainResponsibleUserId = null` → `mainResponsibleName = null` (sin join efectivo).

**Snapshot de auditoría (resuelve MEDIUM-4).** El `snapshot()` cambia `mainResponsible: triage.mainResponsible` por `mainResponsibleUserId: triage.mainResponsibleUserId`. **Decisión explícita:** se guarda **solo el id**, por consistencia con el resto del módulo, que ya audita `decidedByUserId` sin nombre; el nombre **no se congela** en auditoría (se resuelve por join al leer). Como la base está reseteada, **no existen `AuditEvent` con la clave vieja `mainResponsible`**, así que no hay convivencia de esquemas de `after`. Si en el futuro se necesitara el nombre histórico al momento del hecho, se añadiría `mainResponsibleName` al `after` del snapshot; hoy no es un requisito.

### 2.5 `findForRequest` y el campo auxiliar `eligibleResponsibles` (poblar el desplegable sin endpoint nuevo)

El desplegable del front necesita la lista de candidatos del proceso principal de la **solicitud seleccionada**. En vez de crear un endpoint nuevo o filtrar en el cliente (ambos descartados en §5.1), el backend publica esos candidatos **en la respuesta del recurso de triage que el front ya consulta**.

`GET /requests/:id/triage` hoy devuelve `TriageResponseDto[]` (0 o 1 fila). Se mantiene ese contrato de lista y **se añade** la lista de candidatos como parte de la respuesta del endpoint, envolviéndola en un DTO:

```ts
export class TriageContextResponseDto {
  @ApiProperty({ type: [TriageResponseDto] })
  triages!: TriageResponseDto[];

  @ApiProperty({ type: [EligibleResponsibleDto], description: 'Candidatos elegibles como responsable principal (líderes del proceso principal; o su equipo si no hay líder).' })
  eligibleResponsibles!: EligibleResponsibleDto[];
}

export class EligibleResponsibleDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}
```

`findForRequest` pasa a devolver `TriageContextResponseDto`: resuelve `triages` como hoy (con el `include`) y calcula `eligibleResponsibles` con `eligibleResponsibleIds(request)` + un `user.findMany({ where: { id: { in } }, select: { id, name }, orderBy: { name: 'asc' } })`. Así, **el desplegable y la validación del `POST` consumen literalmente la misma función `eligibleResponsibleIds`**, sin posibilidad de divergencia.

> **Alternativa evaluada y descartada:** añadir un query param de filtro a `/coordination/people` para "líderes de un proceso". Se descarta porque `/coordination/people` razona por el alcance del actor (`peopleWhere`), no por un proceso arbitrario; adaptarlo mezclaría dos semánticas de alcance en un mismo endpoint y seguiría sin garantizar igualdad con la validación del triage. Publicar los candidatos junto al propio recurso de triage mantiene una sola fuente de verdad y no añade superficie de API transversal.

Impacto en el controller: `GET /requests/:id/triage` cambia su `@ApiResponse` de `type: [TriageResponseDto]` a `type: TriageContextResponseDto`. Es un **cambio de contrato** del endpoint de lectura; el front se adapta en §5 (hoy `listTriage()` espera un array y **no** se usa en `triage-view.tsx` para poblar nada, solo existe en `lib/triage.ts`; se ajusta su tipo de retorno). El `POST` sigue devolviendo `TriageResponseDto`.

### 2.6 Dependencia de módulo

El cálculo de candidatos usa solo `PrismaService` (ya inyectado en `TriageService`) y el modelo `Grant`/`User`. **No** se importa `CoordinationScopeService` ni se exporta desde `CoordinationModule`:

- **Opción A (elegida):** consulta propia en `TriageService` acotada a `request.mainProcessId`. Es autocontenida, no acopla `request` → `coordination`, y es la definición correcta (por proceso de la solicitud, no por alcance del actor).
- **Opción B (descartada):** reexportar `CoordinationScopeService` e importarlo en `RequestModule`. Además de acoplar dos módulos de negocio, `peopleWhere` razona por actor, no por `mainProcessId`, así que **ni siquiera resolvería** la regla correcta. Se descarta por acoplamiento y por semántica incorrecta.

### 2.7 Resumen de errores por operación (capa backend)

| Operación | Condición de fallo | Recuperable | Qué recibe el caller | Log |
|---|---|---|---|---|
| Validación DTO | `mainResponsibleUserId` no es UUID | sí (corrige valor) | 400 (ValidationPipe) | no (error de cliente) |
| `requireInScope` | Request fuera de alcance | no para ese actor | 404 "Solicitud … no encontrada." | no |
| Gate de fase | Request no está REGISTRADA | sí (otra solicitud) | 409 | no |
| `assertCatalogCode` | code maestro inexistente | sí | 400 "Revisa los datos ingresados." | no |
| `assertMainResponsibleCandidate` | el usuario no es candidato elegible | sí (elige otro) | **400 con mensaje específico** (§2.3.2) | no |
| `$transaction` | fallo de BD / FK rota | no | 500 genérico (filtro global, sin stack al cliente) | sí (nivel servidor) |

Invariante y dueño: "el responsable principal referenciado es un candidato elegible del proceso principal" lo **enforce el backend** en `TriageService` (§2.3), nunca el frontend. La integridad referencial (que el UUID exista en `users`) la garantiza la **FK de PostgreSQL** (`onDelete: Restrict`) como última línea de defensa.

---

## 3. Capa generación OpenAPI

No hay código nuevo: el contrato se **genera** desde los decoradores `@nestjs/swagger`. Tras cambiar `CreateTriageDto`, `TriageResponseDto` y añadir `TriageContextResponseDto`/`EligibleResponsibleDto`:

```
npm run openapi:generate --workspace apps/api   # tsx src/generate-openapi.ts -> apps/api/openapi/openapi.json
```

Resultado esperado: `CreateTriageDto` pierde `mainResponsible` y gana `mainResponsibleUserId` (uuid, opcional); `TriageResponseDto` pierde `mainResponsible` y gana `mainResponsibleUserId` (string|null) y `mainResponsibleName` (string|null); aparecen `TriageContextResponseDto` y `EligibleResponsibleDto`; `GET /requests/:id/triage` referencia el nuevo `TriageContextResponseDto`. No se edita el JSON a mano.

---

## 4. Capa regeneración `@plantilla-portales/api-client`

Tampoco se edita a mano (regla: se regenera desde OpenAPI):

```
npm run api-client:generate   # openapi-typescript -> packages/api-client/src/generated/schema.d.ts
npm run build:api-client      # tsc + copy-schema.mjs
```

o el combo raíz `npm run contracts:generate` (openapi:generate + api-client:generate) seguido de `build:api-client`. Se actualizan `components['schemas']['CreateTriageDto']`, `['TriageResponseDto']`, `['TriageContextResponseDto']`, `['EligibleResponsibleDto']`. Los alias `CreateTriage`/`Triage` en `apps/web/src/lib/api-client.ts` **no cambian de nombre**; cambia su forma interna. Conviene añadir allí un alias `TriageContext`/`EligibleResponsible` si el front los referencia por nombre (coherente con los alias existentes).

---

## 5. Capa frontend del Triage

### 5.1 Poblado del desplegable — decisión de origen de datos

El desplegable se puebla con **`eligibleResponsibles`** del `GET /requests/:id/triage` de la **solicitud seleccionada** (§2.5). **No** se crea endpoint nuevo y **no** se usa `/coordination/people` ni `/grants` desde el front para esto.

Justificación (resuelve HIGH-1/HIGH-2 en el front):

- La lista que ve el usuario es **exactamente** el conjunto que el backend acepta (misma `eligibleResponsibleIds`): no hay opción ofrecida que luego el backend rechace.
- No se duplica lógica de autorización en el cliente (regla del proyecto): el front solo pinta ids+nombres que el backend ya resolvió.
- Se evita añadir superficie de API transversal: los candidatos viajan con el recurso de triage que la pantalla ya necesita consultar.

`listCoordinationPeople()` (en `worklog.ts`) **deja de usarse** para este campo; no se toca esa función (la usan los módulos de Fase 5).

### 5.2 Cambios en `triage-view.tsx`

- En `TriageFormValues`, renombrar `mainResponsible: string` → `mainResponsibleUserId: string` (string vacío = sin selección, usando el centinela `NONE` ya presente). Actualizar `EMPTY_FORM`.
- Cargar el contexto de triage de la solicitud seleccionada para obtener `eligibleResponsibles`. Hoy `triage-view.tsx` no llama a `listTriage`; se añade una carga de `eligibleResponsibles` **al seleccionar la solicitud** (en `selectRequest`/efecto de selección), tolerante a fallo (`.catch(() => [])`, como ya se hace con `processes`). Guardar en estado `eligibleResponsibles: EligibleResponsible[]`. Al cambiar de solicitud se recalcula (los candidatos dependen del `mainProcessId` de esa solicitud).
- Reemplazar el `<Field id="triage-responsible"><Input .../></Field>` por un **`<Select>`** de shadcn/ui con el mismo patrón de `renderCatalogSelect`: opción `NONE` → "Sin especificar" + un `SelectItem` por candidato (`value={c.id}`, label `c.name`). Campo opcional, sin `required`.
- En `handleSubmit`, enviar `mainResponsibleUserId: selectedOrUndefined(form.mainResponsibleUserId)` (reutiliza el helper que convierte vacío/`NONE` → `undefined`). Se deja de usar `trimOrUndefined` **para este campo** (sigue usándose en `dependencies`/`notes`; **no** se elimina la función).
- Estados obligatorios de pantalla: `load()` ya maneja loading/empty/success/error; `eligibleResponsibles` comparte el ciclo. Si viene vacía (proceso sin equipo o error tolerado), el `Select` muestra solo "Sin especificar" —coherente con campo opcional—; el usuario puede guardar igual.
- Manejo de error de negocio: si el backend devuelve 400 por candidato no elegible (defensa para clientes directos; no debería ocurrir desde la UI porque el desplegable solo ofrece elegibles), `lib/triage.ts` debe propagar el **mensaje específico** del backend. Hoy `messageForStatus(400)` devuelve texto fijo "Revisa los datos ingresados."; se ajusta `toTriageError`/`createTriage` para **preferir el `message` del cuerpo de error** cuando venga (patrón: leer `error.message` del body de NestJS y, si existe, usarlo; si no, caer al mapeo por status). Así el usuario ve el texto accionable de §2.3.2.

Decisión de UX: desplegable con **nombres** (no identifier) y opción explícita "Sin especificar". Se mantiene el `<Field>` con `label` "Responsable principal" (label accesible; navegación por teclado del `Select` de shadcn/ui ya resuelta en el proyecto). El error se muestra junto al formulario (`formError` + `toast`), cumpliendo "errores entendibles y qué hacer".

### 5.3 Mostrar el responsable en lecturas

**Aclaración (resuelve NIT-6):** en esta tarea el front solo cambia la **captura** (`<Input>` → `<Select>`). Hoy `triage-view.tsx` resetea el formulario tras guardar y **no** re-renderiza el responsable en el bloque "ya tiene triage" (muestra decisión y estado, no responsable), así que `mainResponsibleName` **no tiene consumidor de UI inmediato** en esta pantalla. Se añade al contrato por dos razones: (1) no exponer un UUID crudo; (2) consumidores futuros (vistas/listados de triage) usarán `mainResponsibleName` (nunca `mainResponsibleUserId`). No se presenta como un cambio de UI de esta tarea.

---

## 6. Lista de impactos por archivo

Backend (`apps/api`):
- `prisma/schema.prisma` — `Triage`: quitar `mainResponsible`, añadir `mainResponsibleUserId` + relación `"TriageMainResponsible"` + `@@index`; **nombrar** `decidedBy` como `"TriageDecidedBy"`. `User`: añadir `triagesAsMainResponsible Triage[] @relation("TriageMainResponsible")` y **renombrar** `triages Triage[]` → `triages Triage[] @relation("TriageDecidedBy")`.
- `prisma/migrations/<timestamp>_triage_main_responsible_fk/migration.sql` — **nueva** migración generada (DROP columna vieja, ADD FK + índice; el renombrado de relación no altera SQL).
- `src/generated/prisma/**` — **regenerado** por `prisma generate` (no se edita a mano).
- `src/modules/request/triage/dto/create-triage.dto.ts` — quitar `mainResponsible`, añadir `mainResponsibleUserId` (`@IsOptional`, `@IsUUID`).
- `src/modules/request/triage/dto/triage-response.dto.ts` — quitar `mainResponsible`, añadir `mainResponsibleUserId` y `mainResponsibleName`.
- `src/modules/request/triage/dto/triage-context-response.dto.ts` — **nuevo** (`TriageContextResponseDto` + `EligibleResponsibleDto`).
- `src/modules/request/triage/triage.service.ts` — `eligibleResponsibleIds`, `assertMainResponsibleCandidate` y constante del mensaje; ajustar `create` (validación + `data` + `include`), `snapshot`/`toResponse` (tipo `TriageWithResponsible`), `findForRequest` (devuelve `TriageContextResponseDto`, incluye candidatos).
- `src/modules/request/triage/triage.controller.ts` — `GET` cambia `@ApiResponse` a `TriageContextResponseDto`; sin cambios de autorización (`@Roles(JEFE_AREA, LIDER_PROCESO)`).
- `src/modules/request/triage/triage.service.spec.ts` — actualizar mocks (`grant.findMany`, `user.findMany`) y casos (ver §7).

Contrato:
- `apps/api/openapi/openapi.json` — **regenerado**.
- `packages/api-client/src/generated/schema.d.ts` — **regenerado**.

Frontend (`apps/web`):
- `src/app/demanda/triage/triage-view.tsx` — estado `eligibleResponsibles`, carga por solicitud seleccionada, `Select` en lugar de `Input`, envío de `mainResponsibleUserId`, `EMPTY_FORM`/`TriageFormValues`.
- `src/lib/triage.ts` — `listTriage` ajusta su tipo de retorno a `TriageContext` (o expone `eligibleResponsibles`); `createTriage`/`toTriageError` preferir el `message` del body en 400. Verificar que compila.
- `src/lib/api-client.ts` — añadir alias `TriageContext`/`EligibleResponsible` si se referencian por nombre.

E2E:
- `tests/e2e/**` (Playwright) — si existe un flujo de triage que escribía el campo de texto, actualizarlo para seleccionar del desplegable.

---

## 7. Testabilidad

Unitario (Jest, backend), siguiendo `triage.service.spec.ts` — mejor nivel para las reglas nuevas:

- **Candidato = líder del proceso principal → OK**: `grant.findMany` (líderes) devuelve el `userId` que coincide con `dto.mainResponsibleUserId`; se crea el triage con el campo seteado.
- **Candidato NO elegible con proceso que SÍ tiene líderes → 400** (mensaje específico) sin mutación (`triage.create` no llamado).
- **Proceso sin líderes (respaldo) + persona con grant en el proceso principal → OK**: primer `grant.findMany` (líderes) vacío; segundo `grant.findMany` (equipo del proceso) contiene el id.
- **Proceso sin líderes + persona que NO tiene grant en el proceso principal → 400**.
- **`mainResponsibleUserId` undefined → OK** sin validar candidato.
- **`toResponse` resuelve nombre**: con la relación incluida, `mainResponsibleName = user.name`; con `null`, ambos `null`.
- **`findForRequest` publica `eligibleResponsibles`** = la misma lista que valida `create` (test que comparte el mock de `grant.findMany`/`user.findMany`, demostrando no-divergencia).
- Validación de UUID (`@IsUUID`) → cubierta por `ValidationPipe` a nivel e2e/integración.

Integración/E2E (Playwright): flujo de triage seleccionando responsable del desplegable; verificar que la lista coincide con los líderes del proceso y que un valor inválido (vía API directa) devuelve el mensaje accionable. Comandos reales: `npm run test:unit` (jest en apps/api) y `npm run test:e2e` (playwright).

Observación: aislar la regla en `eligibleResponsibleIds` (una sola función, sin dependencia del actor) la hace trivial de ejercitar con mocks de Prisma y, sobre todo, garantiza por construcción que desplegable y validación no divergen. El `include` en lecturas es la única parte que exige mocks con relación anidada; es manejable con el alias `TriageWithResponsible`.

---

## 8. Secuencia de ejecución (para la fase de implementación)

1. Editar `schema.prisma`: quitar texto; añadir FK + relación `"TriageMainResponsible"` + índice; nombrar `decidedBy` como `"TriageDecidedBy"`; actualizar inversos en `User` (`triages` renombrado + `triagesAsMainResponsible` nuevo).
2. `npm run prisma:migrate:dev --workspace apps/api -- --name triage_main_responsible_fk` (migración + regenera cliente Prisma).
3. Editar DTOs (incl. `TriageContextResponseDto`/`EligibleResponsibleDto`) y `triage.service.ts`/`triage.controller.ts`; actualizar `triage.service.spec.ts`.
4. `npm run typecheck:api` y `npm run test:unit` hasta verde.
5. `npm run contracts:generate` y `npm run build:api-client`.
6. Editar `triage-view.tsx` y `lib/triage.ts`/`lib/api-client.ts`; `npm run typecheck:web`.
7. `npm run build` (api + api-client + web) y `npm run test:e2e` del flujo de triage.

No se rompe ningún comando existente; solo se usan scripts ya declarados en `package.json`.

---

## 9. Decisiones abiertas y su recomendación

- **Origen de candidatos del desplegable** (§2.5/§5.1): **decidido** publicar `eligibleResponsibles` en `GET /requests/:id/triage` y validar el `POST` con la **misma** función `eligibleResponsibleIds`. Sin endpoint nuevo, sin lógica de autorización en el front, sin divergencia posible.
- **Dependencia de módulo** (§2.6): **decidido** Opción A (consulta propia en `TriageService` por `mainProcessId`); la Opción B no solo acopla módulos sino que resolvería la regla equivocada.
- **Mensaje de error del candidato** (§2.3.2): **decidido** 400 con mensaje específico accionable, propagado al front leyendo el `message` del body.

No quedan bloqueos de decisión de negocio.

---

## 10. Respuestas a los hallazgos de la revisión

- **HIGH-1 (respaldo ≠ `peopleWhere`; divergencia front/back) — RESUELTO.** Se corrige el error factual (se confirma que `peopleWhere` usa `leaderProcessIds` + userId propio, **no** `scopedProcessIds`) y se elimina la causa raíz: candidatos y validación comparten una única función `eligibleResponsibleIds(request)` basada en `request.mainProcessId` (no en el actor). El respaldo ya **no** es "personas en alcance del actor" sino "equipo del proceso principal". Ver §2.3, §2.5.
- **HIGH-2 (el desplegable ofrece lo que el backend rechaza) — RESUELTO.** El desplegable se puebla con `eligibleResponsibles` que el backend calcula con la misma función que valida el `POST` (§2.5/§5.1). Además, para clientes de API directos, el 400 lleva **mensaje específico** accionable (§2.3.2), propagado al front (§5.2).
- **HIGH-A (hay que nombrar también `decidedBy`) — RESUELTO.** §1.1 añade `@relation("TriageDecidedBy")` a `decidedBy`, renombra el inverso `User.triages` y añade `triagesAsMainResponsible`, evitando el fallo "ambiguous relation".
- **MEDIUM-3 (tipo del payload con `include`) — RESUELTO.** §2.4 fija el alias `TriageWithResponsible = Prisma.TriageGetPayload<{ include: { mainResponsible: { select: { id; name } } } }>` y lo aplica a `toResponse` y `snapshot`. Sin `any`.
- **MEDIUM-4 (snapshot pierde el nombre / compatibilidad del histórico) — RESUELTO (decisión explícita).** §2.4: el snapshot guarda **solo** `mainResponsibleUserId` por consistencia con `decidedByUserId`; el nombre no se congela (se resuelve por join). Base reseteada ⇒ no hay `AuditEvent` con la clave vieja `mainResponsible`.
- **NIT-5 (comando/conteo de migraciones) — ATENDIDO.** §1.2 confirma el script real `prisma:migrate:dev` y menciona `ON UPDATE CASCADE` (default Prisma). El conteo de migraciones es informativo; se confirmó la última (`20261009200659_add_user_password_hash`).
- **NIT-6 (`mainResponsibleName` sin consumidor de UI) — ATENDIDO.** §5.3 aclara que esta tarea solo cambia la captura; el campo se añade por contrato/no-UUID-crudo y consumidores futuros.
- **NIT-7 (`trimOrUndefined` no queda huérfano) — ATENDIDO.** §5.2 indica dejar de usar `trimOrUndefined` solo para este campo y **no** borrar la función (la usan `dependencies`/`notes`).
