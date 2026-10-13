# Revisión de diseño · Fase 6 · Activos y documentos (control-phari)

Revisión del documento `.agents/tasks/fase6-activos/design.md` (iteración 3) contrastado
contra el SDD (`SDD_control-phari/specs/06, 08, 09, 10, 18, 19, 20, 28`), el steering
(`.kiro/steering/`) y el **código real** del worktree (`apps/api/prisma/schema.prisma`,
`audit.service.ts`, `list-audit-events.dto.ts`, `capacity-scope.service.ts`,
`current-actor.ts`, `worklog.service.ts`, `module-matrix.ts`, `navigation.ts`, `seed.ts`).

El diseño llega a su tercera iteración y es inusualmente completo: las decisiones están
trazadas a fuente, los findings previos están cerrados y las afirmaciones sobre el código
existente se verificaron una por una (ver secciones de supuestos). Esta revisión abre
solo los hallazgos **nuevos** que persisten tras esa verificación.

---

## Hallazgos

### 1. [NIT] El puntero `currentVersionId` al editar un documento `VIGENTE` queda descrito de forma ambigua ("solo si así se decide")

En §4.2, nota "Puntero `currentVersionId` al crear versión", el texto dice que al crear una
versión el puntero "se mueve a la versión recién creada", pero la nota previa de la misma
sección introduce la coletilla *"(el contenido vigente queda apuntado por `currentVersionId`
solo si así se decide — ver abajo)"*. Las dos frases juntas dejan al implementador sin una
regla única: ¿`currentVersionId` **siempre** apunta a la última versión creada, o hay un caso
en que no? El resto del diseño (§2.4 paso 3, §9, tabla de testing) afirma sin matices que
crear versión **siempre** mueve `currentVersionId` a la nueva versión. La coletilla "solo si
así se decide" contradice esa regla única y es la única ambigüedad real que queda en el flujo
de versionado.

**Fix concreto:** eliminar la coletilla "solo si así se decide" y dejar la regla
determinista que ya usa el resto del documento: *"Al crear una versión (`POST
/documents/:id/versions`), `Document.currentVersionId` **siempre** pasa a apuntar la versión
recién creada (es el puntero de 'contenido vigente'); esto es ortogonal al `Document.status`,
que **solo** cambia por `POST /documents/:id/status`."* Así no hay un sub-caso implícito.

### 2. [NIT] Falta especificar el orden de evaluación 400-maestra vs 403-rol en `POST /assets` y `PATCH /assets/:id`

§2.2 fija el orden 404-alcance → 403-rol para la resolución del recurso, y §3.2/§3.4 añaden
las validaciones 400 de FK/código de maestra del body (MEDIUM-1 / D2). Pero no se dice en qué
orden corren el **403 de rol de escritura** (`requireAssetWritable`) y las **400 de body**
(`ownerUserId`/`requestId`/códigos de maestra) dentro de `create`/`update`. Para `PATCH` el
orden está implícito por "resolver → requireAssetWritable → persistir", pero en `create` no hay
recurso que resolver y el diseño describe las dos comprobaciones (rol y FK de body) como si
ambas vivieran "antes de persistir" sin prelación. Esto puede dar respuestas distintas (un
integrante sin permiso que además manda un `ownerUserId` inválido recibiría 403 o 400 según el
orden), lo que afecta la previsibilidad de los tests de §8.

**Fix concreto:** fijar explícitamente el orden en `create` y en `update`: **primero** la
autoría (jefe/líder del `processId`, o integrante con grant ⇒ nace `BORRADOR`) ⇒ 403 si no
alcanza; **después** las validaciones 400 de body (owner/request/códigos). Añadir una línea en
§3.4: *"Orden en `create`/`update`: 1) control de rol/alcance (403); 2) validaciones 400 de FK
y códigos de maestra del body; 3) persistir en `$transaction`."*

---

## Supuestos verificados

Verificados contra el código real; el diseño los representa con fidelidad:

1. **AuditObjectType y OBJECT_TYPES NO incluyen aún `ASSET`/`DOCUMENT`/`DOCUMENT_VERSION`.**
   Confirmado en `apps/api/src/modules/audit/audit.service.ts` (union `AuditObjectType`, 20
   literales, termina en `COMMITMENT`) y en `apps/api/src/modules/audit/dto/list-audit-events.dto.ts`
   (array `OBJECT_TYPES`, mismos 20). La ampliación en **ambos** archivos (§1.6, requisito (c)
   del brief) es necesaria y correcta: el comentario del propio DTO ya advierte que omitir el DTO
   hace que `?objectType=` responda 400. ✔
2. **`CurrentActor` expone `grants[]` (con `roleCode`), `scopedProcessIds: Set<string>` e
   `isJefeArea`.** Confirmado en `current-actor.ts`. El helper `assetScopeWhere` /
   `requireAssetWritable` / `leaderProcessIds` de §2.2 usa exactamente esos campos y compila
   contra la interfaz real. ✔
3. **El patrón "líder = grants con `roleCode === LIDER_PROCESO`, no cualquier grant" es el que
   ya usa el repo.** Confirmado en `capacity-scope.service.ts` (filtra `roleCode ===
   RoleCode.LIDER_PROCESO`, con el comentario "no elevar integrante a líder"). El alcance **por
   rol** del requisito (d) replica ese patrón, no "tener procesos". ✔
4. **Alcance por rol del SDD.** `specs/10`: "Activos/documentos — Integrante: Consultar/proponer
   activos; contribuir docs según grants; Líder: Gestionar proceso; Jefe: Gestionar área" y "No
   elevar automáticamente líder de un proceso a líder de todos los procesos". El diseño (§2.2/§2.3,
   tabla por rol) lo refleja. ✔
5. **AC-020 y AC-032.** `specs/18`: AC-020 "Documento se edita → guarda nueva versión → la versión
   previa se conserva"; AC-032 "Título/documento sin contenido → no guarda hasta cumplir
   requeridos". El modelo `DocumentVersion` append-only + `currentVersionId` (editar = crear
   versión, previa intacta) satisface AC-020 (requisito (a)); las validaciones `@MinLength(1)` de
   `title`/`content` satisfacen AC-032 (requisito (e)). ✔
6. **Límite 200.000 y su carácter P.** `specs/09` Documento: "título, contenido y activo
   requerido; contador observado 200.000"; Pendiente: "límite efectivo, encoding, edición
   vigente". El diseño implementa 200.000 como rechazo 400 **y** anota el carácter `P` del
   "rechazo duro" (NIT-1 cerrado). Requisito (e) cubierto. ✔
7. **`assetRef`/`relatedAssetRef` de Fase 5 son texto y la regla SOPORTE los usa.** Confirmado en
   `schema.prisma` (`DailyLogActivity.assetRef String?`, `Issue.relatedAssetRef String?`) y en
   `worklog.service.ts` (`case 'SOPORTE': if (!notEmpty(fields.assetRef)) throw
   BadRequestException`). El diseño añade un `assetId` FK **opcional nuevo** que convive y no toca
   la regla de Fase 5 (requisito (b), opción menos invasiva justificada). ✔
8. **`RequestParticipant(requestId, processId)` existe y el `mainProcessId` se materializa como
   participante.** Confirmado en `schema.prisma` (modelo `RequestParticipant`, `@@unique([requestId,
   processId])`, y el comentario "El proceso principal siempre se materializa aqui como invariante
   de datos (BR-001, D2)"). La validación MEDIUM-1 `participants: { some: { processId } }` es
   factible y cierra la fuga de referencia cruzada. ✔
9. **`CatalogItem` tiene `catalog`/`code`/`active` y unique compuesto `catalog_code_unique`.**
   Confirmado en `schema.prisma`. La validación D2 ("código existe y está `active` en su familia ⇒
   400") es implementable con `findFirst({ catalog, code, active: true })`. ✔
10. **`workflow-state.service.ts` existe (finding #9).** Confirmado en
    `apps/api/src/modules/coordination/workflow-state.service.ts`. La justificación de no reutilizarlo
    (acoplado al grafo `RECORD_STATE`) es legítima. ✔
11. **`module-matrix.ts` tiene `asset` y `docs` para los tres roles; `navigation.ts` tiene los dos
    items; las páginas son placeholders `UnderConstruction`.** Confirmado en `module-matrix.ts`
    (`asset`/`docs` → los 3 roles), `navigation.ts` (`/activos/catalogo`→`asset`,
    `/activos/documentos`→`docs`) y `activos/catalogo/page.tsx` (`UnderConstruction`). El supuesto 4
    de "Supuestos explícitos" es correcto. ✔
12. **`ASSET_TYPE` (10 valores) y `DOC_STATUS` (Borrador/Vigente/Archivada) ya sembradas;
    TECHNOLOGY/SOURCE/FREQUENCY/DOC_CATEGORY no.** Confirmado en `seed.ts` (upsert por
    `catalog_code_unique`). El plan de §7 (no re-sembrar lo existente, añadir las que faltan como
    seed `P`) es correcto y los valores coinciden con `specs/20`. ✔
13. **Máquinas de estado P sin transiciones inventadas (requisito (f)).** `specs/06`: Documento
    "Borrador, Vigente, Archivada; historial versionado confirmado"; Activos "ciclo de alta, retiro
    y recuperación pendientes"; "los nombres de catálogo no deben codificar transiciones
    automáticas". El diseño: Asset solo `BORRADOR→ACTIVO→RETIRADO→ACTIVO` (3 transiciones que `06`
    nombra, sin la inventada `ACTIVO→BORRADOR`, MEDIUM-2 cerrado); Document reversible solo por
    `/status`, crear versión NO mueve estado (sin transición automática, finding #2). Fiel a `06`. ✔
14. **No se diseña FEATURE-008/010 (requisito (g)).** El diseño las declara fuera de alcance
    explícito, deja BR-016 solo "preparado" y no modela entidades de frameworks/portafolio. ✔
15. **Steering.** Prisma solo en `apps/api`, NestJS dueño de lógica/validación/autorización,
    frontend solo vía `@plantilla-portales/api-client`, TS estricto sin `any`, migración versionada
    (no `db push`). El diseño cumple en §0 (autoridad y método), §1.4, §6. ✔

---

## Supuestos no verificados / incorrectos

1. **(No verificable aquí) Caveat Prisma 7.10 sobre `@@unique` de un solo campo con `name`
   custom.** El diseño lo cita como lección heredada y lo evita (resuelve todo por `id`/PK con
   `findFirst` y usa solo el `@@unique` **compuesto** `[documentId, versionNumber]` como `where`).
   `seed.ts` confirma indirectamente la lección (resuelve roles por `findFirst` + `id` por ese
   motivo). El comportamiento exacto de la versión de Prisma no se re-ejecutó (el brief prohíbe
   correr builds), pero el diseño **no depende** de usar un unique de un solo campo como `where`, de
   modo que el riesgo es nulo aunque el caveat fuese inexacto. Sin impacto.
2. **(P, correctamente marcado) Transiciones de ciclo de vida de Asset y candados de documento.**
   El diseño las trata como `P` pendientes de cotejo con Site, no como regla afirmada. No es un
   supuesto incorrecto: es una decisión conservadora alineada con `specs/06`/`12`/`19`/`28`. Sin
   acción.
3. **(P, correctamente marcado) Valores de `TECHNOLOGY`/`SOURCE`/`FREQUENCY`/`DOC_CATEGORY`.**
   `specs/20` los da "como ejemplos" y "la lista no es exhaustiva"; el diseño los siembra como seed
   `P` ampliable. Sin acción.

No se encontró ningún supuesto **incorrecto** (afirmación sobre el código o el SDD que la
verificación haya desmentido).

---

## Veredicto

Hallazgos HIGH: 0 · MEDIUM: 0 · NIT: 2.

Como el conteo de HIGH+MEDIUM es **0**, el veredicto mecánico es **APPROVED**. Los dos NIT
(regla única del puntero `currentVersionId`; orden explícito 403/400 en create/update) son
mejoras de precisión que conviene aplicar al implementar, pero no bloquean: no introducen
ambigüedad de comportamiento observable que ponga en riesgo los requisitos (a)–(g), todos
verificados contra código y SDD.
