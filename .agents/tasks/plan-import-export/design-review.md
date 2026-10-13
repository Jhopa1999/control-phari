# Revisión de diseño — Importar/Exportar plan (Planificación)

Documento revisado: `.agents/tasks/plan-import-export/design.md`
Revisor: subagente de revisión de diseño (sin contexto previo; verificación contra el código real).
Fecha de revisión: pase posterior al ciclo documentado en §10 del diseño (que ya resolvió 1 HIGH / 3 MEDIUM / 3 NIT).

## Alcance y método

Se verificó cada afirmación material del diseño contra el código fuente real del repo (no contra la
palabra del documento). Archivos leídos y confirmados:

- `apps/api/prisma/schema.prisma` (Task, Plan, PlanPhase, TaskDependency, FKs, uniques, cascades)
- `apps/api/src/app.config.ts` (ValidationPipe global)
- `apps/api/src/modules/plan/plan-state.service.ts` (`requirePlanInScope`)
- `apps/api/src/modules/plan/task/task.service.ts` (`applyMilestoneRule`, mapeo de `create`)
- `apps/api/src/modules/plan/dependency/dependency.service.ts` (`assertNoCycle`)
- `apps/api/src/modules/plan/phase/phase.service.ts` (`reorder` → auditoría `UPDATE PLAN`)
- `apps/api/src/modules/plan/plan.controller.ts` (guards, roles, rutas, ParseUUIDPipe)
- `apps/api/src/modules/plan/dto/create-plan.dto.ts` (validación de cabecera)
- `apps/api/src/modules/audit/audit.service.ts` (`AuditAction`, `record`)
- `apps/web/package.json` (ausencia de `xlsx`/`exceljs`)
- `apps/web/src/lib/api-client.ts` (reexport de tipos del contrato)
- `apps/web/src/lib/plan.ts`, `tasks.ts`, `documents.ts` (patrón `PlanError`, `downloadMarkdown`)
- `apps/web/src/app/seguimiento/plan/plan-view.tsx` (`canEdit`, `busy`, `refreshPlanData`, lookups)
- `apps/web/src/lib/format.ts`, `status-labels.ts` (`formatDateOnly`, `taskStatusLabel`)

El diseño incorporó una ronda previa de revisión (§10). Esa ronda es correcta: todos sus hallazgos
quedan confirmados contra el código. Esta revisión busca problemas residuales en la especificación
tal como queda hoy.

---

## Hallazgos

Los puntos (a)–(g) del encargo quedan satisfechos por el diseño; los hallazgos siguientes son
observaciones de precisión que no bloquean. No se encontró ningún problema HIGH ni MEDIUM.

1. **NIT — El mapeo de cabecera no es explícito sobre campos ausentes (`§5.5(b)`).**
   El paso (b) de la transacción escribe `{ periodStart, periodEnd, commitmentDate, risks, mitigations }`
   pero no dice qué ocurre cuando el documento trae esos campos ausentes vs `null`. El CRUD existente
   (`TaskService.create`, `PhaseService.create`) usa el patrón de spread condicional
   (`...(x !== undefined ? { x } : {})`), que distingue "no tocar" de "poner null". En REPLACE el plan
   es la misma fila preexistente, así que un `undefined` dejaría el valor viejo mientras que `null` lo
   borraría; para una semántica de reemplazo limpia conviene normalizar siempre a `null` cuando el
   campo no viene.
   Fix concreto: en §5.5(b) fijar la regla explícita — "la cabecera se reemplaza completa: todo campo
   ausente u opcional del documento se persiste como `null` (no se conserva el valor previo)", de modo
   que `tx.plan.update` reciba `periodStart: dto.plan.periodStart ?? null`, etc. Es coherente con
   SUP-2 (export/import completo, sin merge) y con el edge case ya listado "fechas ausentes o null → null".

2. **NIT — `commitmentDate` no está listado en la forma del documento de §4.1 pero sí se importa en §5.5(b).**
   §4.1 muestra `plan.commitmentDate` en el ejemplo JSON y §5.6 declara el `PlanDocumentHeaderDto` con
   `periodStart/periodEnd/commitmentDate`, pero el texto de FR-2.9 enumera "periodos, riesgos, mitigaciones"
   sin nombrar `commitmentDate`, lo que podría leerse como que la fecha de compromiso no se importa.
   Verificado: `commitmentDate` es columna nullable de `Plan` y editable por el CRUD (`create-plan.dto.ts`),
   así que importarla es correcto y no choca con los campos de flujo prohibidos.
   Fix concreto: alinear la redacción de FR-2.9 para que diga "periodos (incluida `commitmentDate`), riesgos
   y mitigaciones", y así no haya duda de que `commitmentDate` sí viaja y sí se reemplaza.

3. **NIT — El nombre del tipo reexportado en el frontend conviene fijarlo contra el patrón real.**
   §7.1/§7.4 asumen reexportar `PlanDocumentDto` como `PlanDocument` e `ImportPlanResultDto` como
   `ImportPlanResult` en `api-client.ts`. Verificado que ese archivo efectivamente reexporta
   `components['schemas']['XxxDto']` con alias cortos (p. ej. `PlanResponseDto` → `Plan`,
   `TaskResponseDto` → `Task`), así que el patrón es correcto y existe. Solo es una nota de consistencia:
   el implementador debe añadir las dos líneas de reexport en el mismo bloque "Fase 3 (plan)" para no
   dejar los tipos sin alias (de lo contrario el helper tipado de §7.1 referenciaría un símbolo inexistente).
   Fix concreto: agregar en `api-client.ts`
   `export type PlanDocument = components['schemas']['PlanDocumentDto'];` y
   `export type ImportPlanResult = components['schemas']['ImportPlanResultDto'];` tras regenerar el contrato (§7.4).

---

## Supuestos verificados

- **(a) Esquema JSON portable con `kind`/`formatVersion` y refs locales + pares `{dependentRef, predecessorRef}`.**
  §4.1/§4.2/§5.6 definen un documento autocontenido con `kind: "control-phari-plan"`, `formatVersion: "1.0"`
  (ambos vía `@Equals`), tareas anidadas por fase con `ref` local único y dependencias como pares de `ref`.
  No viajan UUID de BD. El round-trip reconstruye mediante `Map<ref, nuevoTaskId>`. Portabilidad bien resuelta.
  El desempate de orden `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]` es correcto y necesario: verificado
  que las tareas se crean con `@default(now())` dentro de una `$transaction`, por lo que pueden compartir
  timestamp. El `id` como desempate fija un recorrido estable.

- **(b) Semántica REPLACE gateada por estado editable, en una `$transaction` con auditoría.**
  §5.5 valida primero el gate (BORRADOR/DEVUELTO → si no, 409), hace toda la validación semántica antes de
  persistir, y dentro de una sola `this.prisma.$transaction` borra (dependencias → tareas → fases), actualiza
  cabecera, recrea fases/tareas/dependencias y audita. Confirmado contra el schema: `TaskDependency` y `Task`
  tienen `onDelete: Cascade`, así que el borrado explícito hijo→padre es seguro y redundante por claridad.
  El gate de estado replica el patrón de `canEdit` del frontend pero el control real vive en backend (correcto).

- **(c) Decisión responsibleUserId/processId (NULL-OUT) fundamentada en el schema.**
  Verificado en `schema.prisma`: `Task.responsibleUserId String? @db.Uuid` y `Task.processId String? @db.Uuid`,
  ambas con FK `onDelete: Restrict`. La decisión de no exportarlos ni importarlos (quedan `null`) evita
  violaciones de FK y reasignaciones erróneas por colisión de UUID entre entornos. Además, por el pipe estricto
  (ver abajo), incluirlos en el JSON daría 400, no un silencioso descarte — el DTO correctamente NO los declara.
  Confirmado que la vista ya muestra "Sin asignar" cuando `responsibleUserId === null`, así que el estado nulo
  es coherente con el flujo existente. Decisión bien justificada.

- **(d) Reuso (no duplicación) de helpers con plan mínimo de extracción.**
  - `PlanStateService.requirePlanInScope`: existe y se reutiliza tal cual (verificado). ✔
  - Regla de hito: `applyMilestoneRule` es hoy método **privado** de `TaskService` (verificado línea a línea);
    §6.3 propone extraer la función pura a `plan/task/milestone.ts` conservando firma y los mismos
    `BadRequestException` ("Un hito debe tener estimacion 0.", "Un hito usa una sola fecha."). Extracción mínima y correcta.
  - Ciclos: verificado que `assertNoCycle` real es alcanzabilidad por **una** arista candidata (DFS desde
    `predecessorTaskId` buscando `dependentTaskId`), apto para `add()`. §6.2 distingue correctamente ese caso
    (`reaches`) del chequeo de grafo completo del import (`hasCycle`), extrayendo ambos a un helper puro
    `plan/dependency/cycle.ts` sin colapsar algoritmos. Diseño correcto y bien delimitado.

- **(e) Campos de flujo NUNCA importados.**
  §4.3, §5.5(b), §5.8 y FR-2.9 prohíben explícitamente importar/sobrescribir `status`, `submittedAt/By`,
  `authorizedAt/By`, `returnReason` del plan y `status/progress/accepted*` de la tarea. `tx.plan.update` solo
  escribe periodos/risks/mitigations. Verificado que esos campos existen en el schema como columnas de flujo.
  El pipe estricto además rechaza con 400 si tales campos aparecen en el documento.

- **(f) Gates de afordance en frontend y ausencia de Prisma en apps/web.**
  §7.3: exportar JSON siempre que haya plan (solo lectura); exportar CSV con ≥1 tarea; importar solo con
  `canEdit`. Verificado `canEdit = plan?.status === 'BORRADOR' || plan?.status === 'DEVUELTO'`, y existen
  `busy`, `refreshPlanData`, `ConfirmDialog`, `toast`. El frontend consume solo la API tipada
  (`@plantilla-portales/api-client`) y los helpers de `lib/`, nunca Prisma. El gating es cosmético con control
  real en backend (409). Cumple la regla arquitectónica.

- **(g) Decisión CSV vs xlsx atada al package.json real.**
  Verificado: `apps/web/package.json` NO incluye `xlsx` ni `exceljs`. La decisión de generar CSV con BOM
  UTF-8 en cliente (sin dependencia pesada, sin backend) es coherente con NFR-6. `downloadMarkdown` en
  `documents.ts` confirma el patrón Blob + `<a download>` + `revokeObjectURL` que §7.1/§7.2 reutilizan.
  `formatDateOnly`, `taskStatusLabel`, `personNameById`/`phaseNameById` y `CoordinationPerson.name` existen.

- **ValidationPipe estricto.** Verificado en `app.config.ts`: `whitelist: true`, `forbidNonWhitelisted: true`,
  `transform: true`. La afirmación central de §5.6 (campos extra → 400) es exacta.

- **Auditoría.** Verificado que `AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE'` (sin verbo no mutante),
  lo que justifica que export NO audite. El precedente de `PhaseService.reorder` auditando una operación masiva
  como un único `UPDATE PLAN` también se confirma línea a línea; importar como un solo `UPDATE PLAN` es coherente.

- **Routing.** Verificado que `PlanController` usa `@Controller('requests')` con subrutas estáticas
  (`plan/submit`, `plan/authorize`, `plan/guide`) conviviendo con `:requestId/plan`; `export`/`import` siguen
  el mismo patrón sin colisión. `ParseUUIDPipe` en `requestId` es el patrón vigente.

## Supuestos no verificados / incorrectos

- Ninguna afirmación material del diseño resultó incorrecta tras la verificación contra el código.
- No verificado (fuera del alcance de archivos leídos, sin impacto en el veredicto): el harness E2E/controller
  concreto mencionado en §8 ("harness existente") — no se abrió el archivo de pruebas, pero el patrón de pruebas
  del módulo es consistente con lo descrito y no condiciona la corrección del diseño.
- No verificado: existencia de `listCoordinationPeople` devolviendo `CoordinationPerson[]` con `.name` — sí se
  confirmó su import y uso en `plan-view.tsx` (`setPeople`, `personNameById`), suficiente para (f)/(g).

---

## Veredicto

Conteo de hallazgos: **HIGH = 0, MEDIUM = 0, NIT = 3.**

Por la regla mecánica (cero HIGH y cero MEDIUM), el veredicto es **APPROVED**. Los tres NIT son mejoras de
precisión en la redacción/implementación (normalización de cabecera a null, mención explícita de
`commitmentDate` en FR-2.9, y añadir los dos reexports de tipo) que conviene aplicar durante la implementación
pero no bloquean el inicio del trabajo.
