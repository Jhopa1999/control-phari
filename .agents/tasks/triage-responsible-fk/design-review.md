# Revisión de diseño · Responsable principal del Triage como FK (`mainResponsibleUserId`)

Documento revisado: `.agents/tasks/triage-responsible-fk/design.md` (revisión 2).
Esta revisión se hizo en frío, leyendo el código referenciado para validar cada
suposición. El diseño es la revisión 2 y responde a una revisión previa; el foco
aquí es confirmar que las correcciones son correctas y que no quedan huecos
HIGH/MEDIUM nuevos.

## Veredicto

**APPROVED.** No hay hallazgos HIGH ni MEDIUM. Los 3 hallazgos son NIT
(precisiones de redacción/implementación que no cambian el enfoque ni bloquean).

---

## Hallazgos

### 1. NIT — `listTriage` cambia la **forma del cuerpo**, no solo el tipo de retorno (§5.2, §6, §4)

**Dónde:** §5.2 ("se ajusta su tipo de retorno"), §6 ("`listTriage` ajusta su
tipo de retorno a `TriageContext` (o expone `eligibleResponsibles`)").

**Problema:** Hoy `apps/web/src/lib/triage.ts::listTriage` hace `return data`
tipado como `Triage[]` (verificado). Al cambiar el `GET /requests/:id/triage` de
`TriageResponseDto[]` a `TriageContextResponseDto` (`{ triages, eligibleResponsibles }`),
`data` deja de ser un array y `return data` ya no satisface `Promise<Triage[]>`:
hay que **reescribir el cuerpo**, no solo la firma. Además la redacción deja
abierta una micro-ambigüedad: "(o expone `eligibleResponsibles`)" admite dos
lecturas (¿`listTriage` devuelve el contexto completo, o se añade una función
nueva?). No bloquea porque §5.2 ya fija el comportamiento observable (cargar
`eligibleResponsibles` al seleccionar la solicitud, tolerante a fallo con
`.catch(() => [])`), y `listTriage` no tiene hoy ningún consumidor en el front
(verificado: solo se define en `lib/triage.ts`, no se importa en ningún `.tsx`).

**Fix concreto (elegir y fijar):** repurponer `listTriage` para devolver el
contexto tipado y que el front lea `.triages`/`.eligibleResponsibles`:

```ts
export async function listTriage(requestId: string): Promise<TriageContext> {
  const { data, error, response } = await api.GET('/requests/{id}/triage', {
    params: { path: { id: requestId } },
  });
  if (error || !data) throw toTriageError(response.status);
  return data; // { triages, eligibleResponsibles }
}
```

con `type TriageContext = components['schemas']['TriageContextResponseDto']` en
`lib/api-client.ts`. En `triage-view.tsx`, `selectRequest`/efecto de selección:
`listTriage(id).then((c) => setEligibleResponsibles(c.eligibleResponsibles)).catch(() => setEligibleResponsibles([]))`.

### 2. NIT — El estado DB "un solo ejercicio de prueba" es afirmado como confirmado pero no es verificable desde el repo (§Overview, §1.2)

**Dónde:** §1.2 ("el único Request de prueba (`FIBI`, REGISTRADA) no tiene
triage"), Overview ("la base de desarrollo fue reseteada").

**Problema:** El diseño apoya el `DROP COLUMN` sin backfill en que no hay filas
en `triages`. Eso es un hecho de **runtime** (estado de la base de desarrollo),
no comprobable leyendo el repo. Lo que sí se verifica en el seed
(`apps/api/prisma/seed.ts`) es que existe un grant `LIDER_PROCESO` para `FIBI`
(`lider.bi@demo.local`), de modo que el desplegable de una Request de FIBI sí
tendría candidatos. El riesgo del `DROP` es nulo si de verdad no hay filas; si
las hubiera, el `ADD COLUMN` nullable igualmente no rompe (quedarían `NULL`), lo
cual el propio diseño ya contempla.

**Fix concreto:** antes de aplicar la migración, confirmar en runtime
`SELECT count(*) FROM triages;` = 0 (o aceptar explícitamente que las filas
existentes pierden `main_responsible`, lo cual el diseño ya autoriza por ser
dato de prueba). No requiere cambio de diseño; es una verificación operativa.

### 3. NIT — Patrón de `<Select>` del responsable: el campo hoy usa la forma de elemento de `<Field>`, no la de render-prop (§5.2)

**Dónde:** §5.2 ("Reemplazar el `<Field id="triage-responsible"><Input/></Field>`
por un `<Select>` … con el mismo patrón de `renderCatalogSelect`").

**Problema:** `renderCatalogSelect` usa la forma **render-prop** de `<Field>`
(`children: (control) => <Select><SelectTrigger {...control}>…`), verificada en
`field.tsx` (`FieldControlProps`). El responsable hoy usa la forma de
**elemento** (`<Field ...><Input/></Field>`). La migración es trivial y el
diseño apunta al patrón correcto, pero conviene que el implementador use la
variante render-prop para que `SelectTrigger` reciba `aria-*` como en los
catálogos (si no, pierde el `aria-describedby`/accesibilidad del `Field`).

**Fix concreto:** reutilizar literalmente la estructura de `renderCatalogSelect`
(opción `NONE` → "Sin especificar" + `SelectItem value={c.id}` con `c.name`),
cambiando la fuente de items a `eligibleResponsibles` y el estado a
`form.mainResponsibleUserId`.

---

## Suposiciones verificadas (correctas)

1. **`peopleWhere` usa `leaderProcessIds` + `userId` propio, NO `scopedProcessIds`**
   (§2.3.1, §10/HIGH-1). Verificado en `coordination-scope.service.ts`:
   `peopleWhere` (no-jefe) construye un `Set` con `actor.userId` + grants activos
   en `leaderProcessIds(actor)`. La corrección factual de la revisión 2 es
   exacta.
2. **`requireInScope` devuelve `RequestModel`** con `mainProcessId` (string no
   nulo). Verificado en `request-state.service.ts` y `schema.prisma`
   (`Request.mainProcessId String @db.Uuid`, requerido). `request.mainProcessId`
   es usable como fuente de candidatos.
3. **`decidedBy` es hoy la ÚNICA FK de `Triage` a `User`**, con inverso
   `triages Triage[]` sin `name`. Verificado en `schema.prisma` (modelos
   `Triage` y `User`). Por tanto, al añadir una segunda FK a `User`, Prisma
   exigirá nombrar **ambas** relaciones; la decisión de §1.1 (nombrar
   `TriageDecidedBy` + `TriageMainResponsible` y actualizar inversos en `User`)
   es correcta y necesaria.
4. **Patrón `onDelete: Restrict` + `@db.Uuid` + `@@index` para toda FK a `User`**.
   Verificado: `Grant.user`, `Task.responsible`, `Task.acceptedBy`,
   `Plan.submittedBy/authorizedBy`, `Request.blockedBy`, `AuditEvent.actor`,
   todas `onDelete: Restrict`. La decisión del diseño es consistente con el
   esquema.
5. **`Triage.mainResponsible` es hoy `String? @map("main_responsible")`**; el
   DTO (`CreateTriageDto.mainResponsible?` con `@IsOptional/@IsString/@MaxLength(255)`),
   la respuesta (`TriageResponseDto.mainResponsible: string | null`) y el front
   (`<Input>` en `triage-view.tsx`, `TriageFormValues.mainResponsible: string`,
   envío con `trimOrUndefined`) coinciden exactamente con lo descrito. Verificado.
6. **`Grant.role` es relación válida y `Role.code` es campo**; `where: { role: { code: 'LIDER_PROCESO' } }`
   es un filtro válido. Verificado en `Grant.ts` generado (`role?: RoleScalarRelationFilter`)
   y `schema.prisma` (`Role.code` con `@@unique([code])`). `RoleCode.LIDER_PROCESO`
   existe en `auth/role-code.ts`.
7. **`Prisma.TriageGetPayload` existe** en
   `apps/api/src/generated/prisma/models/Triage.ts` (línea 1116). El alias
   `TriageWithResponsible = Prisma.TriageGetPayload<{ include: { mainResponsible: { select: { id; name } } } }>`
   es construible. Verificado.
8. **Scripts npm referenciados existen todos**: `prisma:migrate:dev`
   (apps/api), `openapi:generate`, `api-client:generate`, `contracts:generate`,
   `build:api-client`, `typecheck:api`, `typecheck:web`, `test:unit`,
   `test:e2e`, `build`. Verificado en `package.json` raíz, `apps/api` y
   `packages/api-client`. La secuencia de §8 no rompe comandos existentes.
9. **`triage-view.tsx` NO llama a `listTriage` hoy** (solo importa `createTriage`
   y `TriageError`). `listTriage` no tiene ningún consumidor en el front.
   Verificado por búsqueda. El cambio de contrato del GET es seguro para la UI
   actual.
10. **No hay flujo E2E que escriba el campo de texto del responsable.** Búsqueda
    de `mainResponsible`/`triage-responsible`/`Responsable principal` en
    `tests/e2e/**` sin coincidencias. La cláusula condicional de §6/§7 ("si
    existe un flujo…") se resuelve en "no hay nada que actualizar".
11. **El spec `triage.service.spec.ts` tiene un fixture `mainResponsible: null`**
    que deberá actualizarse (coherente con §6/§7). Verificado.
12. **Autorización del controller intacta**: `@Roles(JEFE_AREA, LIDER_PROCESO)`
    + `requireInScope` en el service. Verificado en `triage.controller.ts` y
    `triage.service.ts`. La nueva validación de candidato es ortogonal y vive en
    el service (§2.3.2), coherente con la regla "negocio/autorización en el
    backend".
13. **El alias `TriageContext`/`EligibleResponsible` en `lib/api-client.ts`** es
    coherente con el patrón existente (todos los tipos derivan de
    `components['schemas'][...]`). Verificado el patrón.
14. **`BadRequestException` vs genérico**: `assertCatalogCode` ya lanza 400 con
    mensaje genérico; la decisión de §2.3.2 de usar un `BadRequestException` con
    mensaje propio para candidato no elegible es consistente con el estilo del
    módulo y con la regla de no exponer internals.

## Suposiciones no verificadas o incorrectas

- **No verificable desde el repo (runtime):** que la base contenga exactamente
  "un solo ejercicio" y cero filas en `triages`. Es un hecho de estado de la
  base de desarrollo, no del código. Ver NIT-2. No invalida el diseño porque el
  camino es seguro con o sin filas (DROP sin datos de valor; o `NULL` si las
  hubiera), según el propio diseño.
- **Comportamiento de regeneración OpenAPI/api-client:** el diseño describe el
  *resultado esperado* de `openapi:generate` + `api-client:generate`. Los
  scripts existen (verificado), pero el contenido concreto generado (nombres de
  schema, forma del `TriageContextResponseDto`) solo se confirma ejecutándolos
  en implementación. No es una suposición incorrecta; es verificación diferida
  esperable para artefactos generados.
- **No se encontró ninguna suposición factual incorrecta.** La única corrección
  factual pendiente de la revisión 1 (sobre `peopleWhere`) está correctamente
  resuelta en la revisión 2 (ver Verificada #1).

---

## Conteo

- HIGH: 0
- MEDIUM: 0
- NIT: 3

Como no hay HIGH ni MEDIUM, el veredicto es **APPROVED**.
