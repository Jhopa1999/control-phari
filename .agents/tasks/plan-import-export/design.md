# Importar y exportar plan de proyecto — Requisitos y diseño técnico

Módulo: Planificación (`apps/api/src/modules/plan` + `apps/web/src/app/seguimiento/plan`).
Objetivo de negocio: agilizar el trabajo de los usuarios que arman planes, permitiéndoles
reutilizar un plan existente (exportarlo como documento portable y volver a cargarlo en otra
solicitud) y descargar la lista de tareas a una hoja de cálculo para trabajar fuera de la app.

---

## 1. Resumen

Se añaden tres capacidades sobre el plan de una solicitud:

1. **Exportar el plan completo a JSON** (backend + frontend): un documento autocontenido y
   portable (`kind` + `formatVersion`) que captura cabecera + fases ordenadas + tareas + dependencias
   usando referencias locales al documento (no UUID de BD), de modo que se pueda reimportar en otra
   solicitud. Es una operación de solo lectura.
2. **Importar un plan desde JSON** (backend + frontend): toma el documento exportado, lo valida por
   DTO y, con semántica **REPLACE** (borra fases/tareas/dependencias actuales y las recrea), reconstruye
   el plan dentro de una única transacción, reaplicando TODAS las reglas de negocio (hito, ciclos,
   gate de estado editable, alcance). Solo opera sobre planes editables (BORRADOR/DEVUELTO).
3. **Exportar tareas a Excel/CSV** (solo frontend): descarga la lista de tareas visible como CSV con
   BOM UTF-8 (el stack web no incluye `xlsx`/`exceljs`), legible por Excel, sin tocar el backend.

Todas las reglas de negocio, validación, autorización y persistencia viven en `apps/api`. El
frontend solo consume la API REST y aplica *gating* cosmético de los botones.

---

## 2. Requisitos funcionales

### FR-1 — Exportar plan (JSON)
- FR-1.1 El backend expone `GET /requests/:requestId/plan/export` que devuelve un documento JSON
  autocontenido del plan (cabecera + fases ordenadas + tareas + dependencias).
- FR-1.2 El documento incluye los marcadores `kind: "control-phari-plan"` y `formatVersion: "1.0"`.
- FR-1.3 Las dependencias se expresan como pares `{ dependentRef, predecessorRef }` usando
  referencias locales estables al documento (no UUID de BD), para que el documento sea portable
  entre solicitudes.
- FR-1.4 Cada tarea lleva una referencia local (`ref`) usada por las dependencias.
- FR-1.5 La exportación es de solo lectura: no muta datos ni fuerza registro de auditoría
  (ver §6.1: `AuditService` no admite acciones no mutantes).
- FR-1.6 Disponible para cualquier estado del plan mientras exista un plan cargado.
- FR-1.7 En el frontend, un botón «Exportar plan» en `plan-view.tsx` descarga `plan-<requestId>.json`.

### FR-2 — Importar plan (JSON)
- FR-2.1 El backend expone `POST /requests/:requestId/plan/import` que recibe el documento exportado.
- FR-2.2 Un DTO valida `kind`, `formatVersion` y la estructura anidada; formatos desconocidos o
  versiones no soportadas → `400`.
- FR-2.3 Solo opera si el plan destino es editable (`BORRADOR` o `DEVUELTO`); si no, `409` con mensaje claro.
- FR-2.4 Semántica **REPLACE**: borra fases/tareas/dependencias del plan y las recrea desde el documento,
  todo en una sola `this.prisma.$transaction`. La respuesta deja explícito el carácter destructivo.
- FR-2.5 Recrea fases con `order` 0-based contiguo respetando `@@unique([planId, order])`.
- FR-2.6 Recrea tareas aplicando la regla de hito reutilizando la lógica de `task.service.ts`.
- FR-2.7 Recrea dependencias desde las referencias locales, aplicando la misma validación de
  ciclo/mismo-plan/auto/duplicado de `dependency.service.ts` ANTES de persistir.
- FR-2.8 Audita la importación con `scopeProcessId = request.mainProcessId` dentro de la transacción.
- FR-2.9 Actualiza la cabecera del plan (periodos, riesgos, mitigaciones) desde el documento, pero
  NUNCA importa/sobrescribe campos de flujo (`status`, `submitted*`, `authorized*`, `returnReason`).
- FR-2.10 En el frontend, un botón «Importar plan» habilitado solo con `canEdit`, que abre un selector
  `.json`, muestra un `ConfirmDialog` de reemplazo y, al terminar, re-ejecuta `refreshPlanData()`.

### FR-3 — Exportar tareas a Excel/CSV (frontend)
- FR-3.1 Una acción «Exportar tareas (Excel)» genera una hoja con: fase, título, responsable (nombre),
  inicio, fin, estimación de horas, estado, hito.
- FR-3.2 Se genera CSV en el cliente con BOM UTF-8 (no hay `xlsx`/`exceljs` en `apps/web/package.json`).
- FR-3.3 Descarga `tareas-<requestId>.csv`. Lee datos ya presentes en la vista; sin backend.
- FR-3.4 Accesible: botón real, operable por teclado.

---

## 3. Requisitos no funcionales

- NFR-1 TypeScript estricto; sin `any` sin justificación explícita.
- NFR-2 Toda entrada externa validada en backend vía DTO (class-validator), incluida la estructura del JSON importado.
- NFR-3 Sin lógica de negocio duplicada entre frontend y backend; el frontend solo hace *gating* cosmético.
- NFR-4 Reusar servicios/helpers existentes (`PlanStateService`, `AuditService`, normalización de hito, `assertNoCycle`); refactor mínimo para compartir.
- NFR-5 Anotaciones OpenAPI/Swagger consistentes con el estilo del controller (`@ApiOperation`/`@ApiResponse`/`@ApiParam`/`@ApiBody`, `@ApiTags('plan')`).
- NFR-6 Sin infraestructura nueva ni dependencias pesadas; el import es atómico (una `$transaction`).
- NFR-7 No romper comandos existentes del repo; seguir estructura de módulo y convenciones de `dto/`.

---

## 4. El documento del plan (esquema JSON exacto)

El contrato se define como DTOs de respuesta/entrada en
`apps/api/src/modules/plan/dto/` para que el OpenAPI lo exponga y `packages/api-client` lo genere.
`formatVersion` fija es `"1.0"`; `kind` fijo es `"control-phari-plan"`.

### 4.1 Forma del documento

```jsonc
{
  "kind": "control-phari-plan",
  "formatVersion": "1.0",
  "plan": {
    "periodStart": "2025-01-01T00:00:00.000Z",   // string date-time | null
    "periodEnd": "2025-06-30T00:00:00.000Z",      // string date-time | null
    "commitmentDate": "2025-06-30T00:00:00.000Z", // string date-time | null
    "risks": "…",                                 // string | null
    "mitigations": "…"                            // string | null
  },
  "phases": [
    {
      "order": 0,                        // int 0-based, contiguo
      "name": "Análisis",                // string requerido
      "startDate": "…",                  // string date-time | null
      "endDate": "…",                    // string date-time | null
      "deliverable": "…",                // string | null
      "tasks": [
        {
          "ref": "t1",                   // referencia local ÚNICA en el documento
          "title": "Levantamiento",      // string requerido
          "isMilestone": false,          // bool
          "estimateHours": 8,            // int >= 0 | null
          "startDate": "…",              // string date-time | null
          "endDate": "…",                // string date-time | null
          "description": "…",            // string | null
          "acceptanceCriteria": "…",     // string | null
          "frameworkPhaseRequired": "…", // string | null
          "evidenceUrl": "…"             // string | null
          // NO se exportan: responsibleUserId, processId, status, progress,
          // accepted*, id (ver §5.3 y §4.3)
        }
      ]
    }
  ],
  "dependencies": [
    { "dependentRef": "t2", "predecessorRef": "t1" }
  ]
}
```

### 4.2 Diseño de las referencias locales (clave del round-trip)

Las tareas se exportan agrupadas por fase (anidadas en `phases[].tasks[]`), lo que ya codifica la
pertenencia tarea→fase sin IDs. Cada tarea recibe un `ref` **local al documento** generado de forma
determinista en el export (`"t" + indiceGlobal`, p. ej. `t0, t1, t2…`, en orden de recorrido
fase→tarea). Las dependencias se emiten como pares `{ dependentRef, predecessorRef }` que apuntan a
esos `ref`, nunca a UUID de BD. En el import se construye un mapa `ref → nuevoTaskId` tras crear las
tareas y se resuelven las dependencias contra ese mapa. Esto es lo que hace el documento portable
entre solicitudes: los UUID originales no viajan.

Decisión: `ref` es un **string arbitrario** (no se asume formato) validado solo como no vacío y
único dentro del documento; las dependencias deben referenciar `ref` existentes (si no → `400`). Se
elige string en vez de índice numérico para que un plan editado a mano en una hoja/JSON pueda usar
nombres legibles (`"analisis-1"`) sin romper el import. **Nota (ver §5.6):** editar a mano significa
cambiar valores dentro del esquema de §4.1, no añadir campos nuevos; el pipe estricto
(`forbidNonWhitelisted`) rechaza con `400` cualquier propiedad extra que se cuele en el documento.

### 4.3 Qué NO viaja en el documento y por qué
El documento declara **exactamente** los campos de §4.1; por el pipe estricto (`forbidNonWhitelisted: true`,
§5.6) cualquier campo adicional en un documento importado produce `400`. Lo que explícitamente NO forma parte
del contrato (y por tanto no debe aparecer en el JSON):
- **IDs de BD** (plan/phase/task/dependency): se omiten; romperían la portabilidad y chocarían con
  los `@default(uuid())` del schema.
- **`responsibleUserId` / `processId`**: ver decisión en §5.3.
- **Campos de ejecución/flujo**: `status`, `progress`, `accepted`, `acceptedAt`, `acceptedByUserId`
  de la tarea y `status`/`submitted*`/`authorized*`/`returnReason` del plan. El plan importado nace en
  edición; recrear tareas en estados de ejecución sería incoherente (nacen con el default `POR_HACER`
  del schema). Para la cabecera, el requisito FR-2.9 lo prohíbe explícitamente.

---

## 5. Diseño backend

### 5.1 Stack (fijo tras aprobación)
NestJS 11 + TypeScript estricto, Prisma 7 (solo backend), class-validator/class-transformer para DTOs,
`@nestjs/swagger` para OpenAPI. Sin dependencias nuevas.

### 5.2 Endpoints y controller

Ambas rutas se añaden a `PlanController` (`@Controller('requests')`, guards
`CurrentUserGuard` + `RolesGuard`, `@Roles(JEFE_AREA, LIDER_PROCESO)` ya a nivel de clase), bajo el
prefijo `:requestId/plan`, con el mismo estilo de anotaciones del resto del controller.

```
GET  /requests/:requestId/plan/export   -> PlanDocumentDto           (200)
POST /requests/:requestId/plan/import    (body: PlanDocumentDto)      -> ImportPlanResultDto (200)
```

- `requestId` se valida con `ParseUUIDPipe`, igual que las rutas existentes.
- Export: `@ApiOperation`/`@ApiParam`/`@ApiResponse(200, type: PlanDocumentDto)` + `403`/`404`.
- Import: añade `@ApiBody({ type: PlanDocumentDto })` + respuestas `400`/`403`/`404`/`409`.

Nota de routing: las rutas estáticas `export`/`import` cuelgan de `:requestId/plan/...`, mismo patrón
que `plan/submit`, `plan/authorize`, `plan/guide`, por lo que no hay colisión con la ruta paramétrica
`:requestId/plan`.

### 5.3 Decisión sobre `responsibleUserId` y `processId` (NULL-OUT)

Contra el schema real (confirmado en `apps/api/prisma/schema.prisma`):
- `Task.responsibleUserId String? @db.Uuid` → **nullable**, FK `onDelete: Restrict`.
- `Task.processId String? @db.Uuid` → **nullable**, FK `onDelete: Restrict`.

Decisión: **no exportar ni importar** `responsibleUserId` ni `processId`; en el import se dejan en
`null`. Justificación:
1. Ambas columnas son nullable, así que `null` es un estado válido y no viola el `NOT NULL`.
2. Son UUID de otra entidad (`User`/`Process`) que puede no existir en el entorno destino; importarlos
   crudos arriesga violación de FK (`Restrict`) o, peor, asignar la tarea a una persona equivocada que
   casualmente comparta UUID. Nular es la opción portable y segura. Además, como el pipe es estricto
(`forbidNonWhitelisted`, §5.6), incluir `responsibleUserId`/`processId` en el JSON ni siquiera se
«ignoraría»: provocaría `400`. Por eso el DTO del documento NO los declara (§4.1).
3. El usuario reasigna responsables/procesos tras importar; de hecho la vista ya marca
   «Sin asignar» cuando `responsibleUserId === null`, y la guía de pendientes empuja a completarlos
   antes de enviar a autorización. El flujo existente absorbe el nulo sin trabajo extra.

Se descarta *validate-and-skip-with-report* por complejidad desproporcionada (requeriría resolver
usuarios/procesos por algún identificador estable que hoy NO viaja en el documento) y porque nular ya
deja el plan en un estado coherente y editable. El documento, por tanto, **no incluye** estos campos
(§4.3): es la forma más honesta de comunicar que no se transfieren.

### 5.4 Lógica de exportación (`PlanService.exportPlan`)

```
exportPlan(actor, requestId): Promise<PlanDocumentDto>
```
1. `requirePlanInScope(actor, requestId)` → `{ plan }` (404 si fuera de alcance / sin plan). Reusa el helper.
2. Carga fases (`orderBy: { order: 'asc' }`) con sus tareas y todas las dependencias del plan
   (`taskDependency.findMany({ where: { dependent: { phase: { planId } } } })`, mismo filtro que
   `assertNoCycle`).
   - **Orden determinista de tareas (desempate):** las tareas se cargan con
     `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`. El `createdAt` por sí solo NO basta: un plan recién
     importado crea todas sus tareas dentro de la misma `$transaction` y pueden compartir timestamp
     (`@default(now())`), lo que haría no determinista el orden de recorrido y la numeración `t0, t1, …` entre
     dos exports del mismo plan. El desempate por `id` fija un orden estable y reproducible. Esto no afecta la
     corrección de las dependencias (que se resuelven por el `Map<taskId, ref>`), pero hace estables las
     aserciones de round-trip de §8. Las fases no necesitan desempate porque `@@unique([planId, order])`
     garantiza `order` único.
3. Asigna `ref` determinista por tarea recorriendo fases en orden y tareas en el orden estable anterior
   (`t0, t1, …`), construyendo un `Map<taskId, ref>`.
4. Serializa a `PlanDocumentDto`: cabecera, `phases[]` con `tasks[]` (sin IDs/responsable/proceso/flujo),
   y `dependencies[]` resolviendo cada par de UUID a `{ dependentRef, predecessorRef }` vía el mapa.
5. Devuelve el documento. **No** abre transacción ni audita (§6.1).

El controller devuelve el DTO como JSON normal (200); el navegador lo descarga como archivo desde el
frontend (§7.1), siguiendo el patrón de `downloadMarkdown` de `lib/documents.ts`.

### 5.5 Lógica de importación (`PlanService.importPlan`)

```
importPlan(actor, requestId, dto: PlanDocumentDto): Promise<ImportPlanResultDto>
```
Pasos (validación antes de persistir, persistencia en una sola `$transaction`):

1. **Alcance + plan**: `requirePlanInScope(actor, requestId)` → `{ plan, mainProcessId }`.
2. **Gate de estado editable**: si `plan.status` no es `BORRADOR` ni `DEVUELTO` →
   `ConflictException` (409) «Solo se puede importar sobre un plan en borrador o devuelto.».
   (El DTO ya garantizó `kind`/`formatVersion`/estructura; ver §5.6.)
3. **Validación semántica del documento (pre-persistencia)**, toda traducida a `400`:
   - `ref` de tareas no vacíos y únicos en el documento.
   - cada `dependentRef`/`predecessorRef` referencia un `ref` existente.
   - sin auto-dependencia (`dependentRef === predecessorRef`) ni pares duplicados.
   - **ciclos (grafo completo)**: se construyen las aristas `{ dependentRef, predecessorRef }` del documento y
     se llama `hasCycle(edges)` (helper puro de §6.2) para detectar cualquier ciclo del grafo completo; si lo
     hay → `400` «El plan importado contiene dependencias cíclicas.». Como todas las tareas pertenecen al mismo
     plan por construcción, el chequeo de «mismo plan» de `dependency.service.ts` se satisface trivialmente.
   - **regla de hito** por tarea: se reutiliza la normalización de hito extraída (§6.3) — `applyMilestoneRule`;
     si una tarea hito trae `estimateHours > 0` o dos fechas distintas → `400`, exactamente como en
     `task.service.ts`. El **resultado normalizado** (que puede forzar `estimateHours = 0` y copiar una fecha a
     la otra) es lo que se persiste en el paso (d), no los valores crudos del documento.
   - **coherencia de fechas**: NO se valida `startDate ≤ endDate` en tareas/fases ni `periodStart ≤ periodEnd`
     en la cabecera, porque el CRUD actual (`create-task.dto`, `create-phase.dto`, `create-plan.dto`) tampoco lo
     valida (solo `@IsDateString`); se mantiene **paridad** con el comportamiento existente. Si en el futuro se
     añade esa regla, deberá aplicarse por igual al CRUD, al import y a `applyMilestoneRule`.
   - `order` de fases: se **ignora** el `order` entrante como fuente de verdad y se recalcula 0-based
     contiguo según el orden del array `phases[]` (robustez ante documentos editados a mano), tal como
     hace `phase.service.reorder`.
4. **Transacción REPLACE**:
   ```
   this.prisma.$transaction(async (tx) => {
     // a) Borrado: elimina dependencias, luego tareas, luego fases del plan.
     //    (orden explícito para no depender solo del cascade; TaskDependency y Task
     //     tienen onDelete:Cascade, pero se borra en orden hijo→padre por claridad.)
     await tx.taskDependency.deleteMany({ where: { dependent: { phase: { planId: plan.id } } } });
     await tx.task.deleteMany({ where: { phase: { planId: plan.id } } });
     await tx.planPhase.deleteMany({ where: { planId: plan.id } });

     // b) Cabecera: periodos/risks/mitigations desde el doc. NUNCA status/submitted*/authorized*/returnReason.
     await tx.plan.update({ where: { id: plan.id }, data: { periodStart, periodEnd, commitmentDate, risks, mitigations } });

     // c) Fases: order 0-based contiguo; devuelve ids nuevos.
     // d) Tareas: por fase. Para cada tarea del documento se llama applyMilestoneRule (§6.3) y se
     //    crea con los campos NORMALIZADOS, no los crudos del documento:
     //      const normalized = applyMilestoneRule({ isMilestone, estimateHours, startDate, endDate });
     //      await tx.task.create({ data: {
     //        phaseId: nuevoPhaseId,
     //        title,                              // requerido
     //        isMilestone,                        // bool del documento
     //        description, acceptanceCriteria,    // textos opcionales (null si ausentes)
     //        frameworkPhaseRequired, evidenceUrl,
     //        estimateHours: normalized.estimateHours, // puede forzarse a 0 por la regla de hito
     //        startDate: normalized.startDate,         // la regla puede copiar una fecha a la otra
     //        endDate: normalized.endDate,
     //        // responsibleUserId / processId: NO se escriben -> quedan null (§5.3)
     //        // status/progress/accepted/acceptedAt/acceptedByUserId: default del schema
     //      }});
     //    (mismo mapeo que TaskService.create, usando normalized.*). Llena Map<ref, nuevoTaskId>.
     // e) Dependencias: crea cada par resolviendo ref→nuevoTaskId.

     // f) Auditoría (§6.1): registros dentro de la tx con scopeProcessId = mainProcessId.
   });
   ```
5. Devuelve `ImportPlanResultDto` (§5.7) con el conteo de lo recreado y el aviso de reemplazo.

Edge cases y su manejo:
- Documento con 0 fases: válido; el REPLACE deja el plan sin fases/tareas/dependencias (coherente con un
  plan recién creado). La guía de pendientes volverá a exigir contenido antes de enviar.
- `periodStart/End`, `commitmentDate`, fechas de fase/tarea ausentes o `null`: se persisten como `null`
  (todas las columnas son nullable en el schema).
- Fase sin `name`: `400` por DTO (requerido).
- Dependencia que referencia un `ref` inexistente: `400` (validación §5.3 pre-persistencia).
- Colisión de `@@unique([planId, order])`: imposible porque el borrado precede a la recreación dentro
  de la misma transacción y el `order` se recalcula contiguo.
- Fallo en cualquier paso de la transacción: *rollback* total; el plan queda intacto (atomicidad).

### 5.6 DTOs de entrada/validación (class-validator)

Nuevos archivos en `apps/api/src/modules/plan/dto/`:

- `plan-document.dto.ts` — `PlanDocumentDto` (sirve de entrada en import y de respuesta tipada en export):
  - `kind`: `@Equals('control-phari-plan')` → cualquier otro valor `400`.
  - `formatVersion`: `@Equals('1.0')` → versiones viejas/desconocidas `400`.
  - `plan`: `@ValidateNested()` + `@Type(() => PlanDocumentHeaderDto)`.
  - `phases`: `@IsArray()` + `@ValidateNested({ each: true })` + `@Type(() => PlanDocumentPhaseDto)`.
  - `dependencies`: `@IsArray()` + `@ValidateNested({ each: true })` + `@Type(() => PlanDocumentDependencyDto)`.
- `PlanDocumentHeaderDto`: `periodStart/periodEnd/commitmentDate` `@IsOptional() @IsDateString()`;
  `risks/mitigations` `@IsOptional() @IsString() @MaxLength(4000)` con `@Transform(trim)` (mismo patrón que `create-plan.dto.ts`).
- `PlanDocumentPhaseDto`: `name` requerido (`@IsString() @MaxLength(255)` + `trim`); `startDate/endDate`
  `@IsOptional() @IsDateString()`; `deliverable` opcional; `tasks` `@ValidateNested({ each: true })` + `@Type(() => PlanDocumentTaskDto)`.
- `PlanDocumentTaskDto`: `ref` requerido (`@IsString()` no vacío, `@MaxLength(128)`); `title` requerido;
  `isMilestone` `@IsBoolean()`; `estimateHours` `@IsOptional() @IsInt() @Min(0)`; fechas `@IsDateString()`;
  textos opcionales con `MaxLength` igual a `create-task.dto.ts`.
- `PlanDocumentDependencyDto`: `dependentRef` y `predecessorRef` requeridos (`@IsString() @MaxLength(128)`).

**Comportamiento del `ValidationPipe` global (verificado en `apps/api/src/app.config.ts`): `whitelist: true`
Y `forbidNonWhitelisted: true`.** Es decir, **cualquier propiedad no declarada en el DTO provoca `400`**, NO
se descarta en silencio. Decisión (opción (a), estricta): **se mantiene el pipe estricto del proyecto para el
import** por coherencia con el resto del backend; el documento declara exactamente los campos de §4.1 y
**cualquier campo adicional** (`id`, `responsibleUserId`, `processId`, `status`, comentarios, etc.) hace que el
import responda `400`. No se aplica un `ValidationPipe` local relajado (se descarta la opción (b): tolerar
extras invita a documentos ambiguos y rompería la coherencia con `forbidNonWhitelisted` adoptado en todo el
proyecto). Consecuencia para documentos editados a mano (§4.2/SUP-5): el editor debe ceñirse al esquema de
§4.1; añadir campos sobrantes es un error legítimo (`400`) con mensaje de class-validator, no un dato ignorado.

Las reglas semánticas (unicidad de `ref`, referencias colgantes, ciclos, hito) se validan en el service porque
dependen de relaciones cruzadas entre elementos del documento, no de un solo campo (NFR-3: viven en backend).

### 5.7 DTO de respuesta del import

`import-plan-result.dto.ts` — `ImportPlanResultDto` con `@ApiProperty`:
- `requestId: string`, `planId: string`
- `replaced: boolean` (siempre `true`; deja explícito el carácter destructivo — FR-2.4)
- `phasesCreated: number`, `tasksCreated: number`, `dependenciesCreated: number`
- `message: string` (p. ej. «Se reemplazó el contenido del plan: N fases, M tareas, K dependencias.»).
  **Es la fuente única del texto de éxito:** el frontend lo muestra tal cual en el toast (§7.3) y no
  recompone el resumen desde los conteos, para no duplicar el formato en dos capas.

### 5.8 Autorización e invariantes — qué capa los posee
- **Autorización/alcance**: `RolesGuard` (rol) + `requirePlanInScope` (alcance por `mainProcessId`),
  idéntico al resto del módulo. Backend.
- **Estado editable** (BORRADOR/DEVUELTO): backend en `importPlan` (409). El frontend solo lo refleja
  cosméticamente con `canEdit`.
- **Regla de hito**: backend, lógica compartida (§6.3).
- **Aciclicidad / mismo-plan / auto / duplicado**: backend, lógica compartida (§6.2).
- **Inmutabilidad de los campos de flujo del plan**: backend (`importPlan` solo escribe
  periodos/risks/mitigations).
- **`order` 0-based contiguo**: backend (recalculado), respeta `@@unique([planId, order])`.

---

## 6. Reuso y refactor mínimo de helpers

### 6.1 Auditoría (reuso de `AuditService`)
`AuditService.record` admite acciones `'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE'` (confirmado en
`audit.service.ts`) — **no existe** una acción no mutante. Por tanto:
- **Export NO audita** (FR-1.5): no hay acción apropiada y es solo lectura; se respeta la indicación de
  no forzar un registro.
- **Import audita** dentro de la `$transaction`, consistente con los patrones del módulo. Granularidad
  elegida: **un `UPDATE PLAN`** con `before`/`after` que resuma el reemplazo (p. ej.
  `before: { phases: n0, tasks: m0 }`, `after: { phases: n1, tasks: m1, imported: true }`), siguiendo el
  mismo criterio que `phase.service.reorder`, que audita un reorden masivo como **un** `UPDATE PLAN` para
  «no inflar la auditoría». Se descartan registros por entidad (serían decenas por import) porque el
  reorden ya sentó el precedente de agrupar operaciones masivas en un único evento de plan.
  `scopeProcessId = request.mainProcessId`, `actorUserId = actor.userId`.

### 6.2 Detección de ciclos — dos algoritmos DISTINTOS, un helper puro compartido

Hecho verificado (`dependency/dependency.service.ts`): el `assertNoCycle` actual es un chequeo de
**alcanzabilidad de UNA sola arista candidata**: lee las aristas existentes del plan, construye el grafo
`dependent → [predecesoras]` y hace **DFS desde `predecessorTaskId`** comprobando si alcanza `dependentTaskId`.
Es correcto para `add()`, que agrega **una** arista a la vez. El import, en cambio, construye **todo** el grafo
del documento de golpe y necesita verificar que **el grafo completo sea acíclico**. Son dos problemas distintos;
no se deben confundir en una sola firma intercambiable.

Diseño del refactor (se extrae **la parte pura** del DFS a `plan/dependency/cycle.ts`, parametrizada por el
nodo genérico `string` para servir tanto a UUID de BD como a `ref` del documento):

```ts
// plan/dependency/cycle.ts
type Edge = { dependentRef: string; predecessorRef: string };

/** Construye adjacency dependent -> [predecesoras] y hace DFS desde `from`
 *  comprobando si alcanza `to`. Es el núcleo del chequeo incremental de add(). */
export function reaches(edges: Edge[], from: string, to: string): boolean;

/** true si el grafo dirigido (dependent -> predecessor) contiene ALGÚN ciclo.
 *  DFS con colores (blanco/gris/negro) sobre todos los nodos. Es el chequeo que
 *  usa el import sobre el grafo completo del documento. */
export function hasCycle(edges: Edge[]): boolean;
```

- **`DependencyService.assertNoCycle`** (caso `add()`): sigue leyendo las aristas del plan de BD
  (`taskDependency.findMany({ where: { dependent: { phase: { planId } } } })`) y delega en
  `reaches(edges, predecessorTaskId, dependentTaskId)`; si devuelve `true`, lanza el **mismo**
  `BadRequestException` con el mismo mensaje de hoy. Comportamiento idéntico (reachability por arista).
- **`PlanService.importPlan`** (caso import): construye las aristas del documento sobre los `ref`
  (`{ dependentRef, predecessorRef }`) tras validar que no haya auto-dependencias ni duplicados, y llama
  `hasCycle(edges)`. Si devuelve `true` → `BadRequestException` (400) «El plan importado contiene dependencias
  cíclicas.». Esto detecta ciclos que solo se cierran al considerar TODAS las aristas juntas (lo que
  `reaches`/arista no garantiza por sí solo sobre un grafo construido de golpe).

Así se reutiliza una sola fuente del DFS sin colapsar dos algoritmos: `reaches` para la arista candidata de
`add()`, `hasCycle` para el grafo completo del import. Ambos son funciones puras (sin BD) → fácilmente
testeables (§8). `cycle.ts` no es provider; vive en el módulo sin inyección ni dependencia circular.

### 6.3 Normalización de la regla de hito — extraer a función pura compartida
`applyMilestoneRule` es hoy privado de `TaskService`. Refactor mínimo: extraer la función pura a
`plan/task/milestone.ts`:
`function applyMilestoneRule(input): { estimateHours, startDate, endDate }` (misma firma y mismos
`BadRequestException`), y que `TaskService` la importe en lugar de tener el método inline. `PlanService.importPlan`
la reutiliza por tarea. Cero cambios de comportamiento; una sola fuente de la regla (NFR-3/NFR-4).

### 6.4 Resolución de alcance
Se reutiliza `PlanStateService.requirePlanInScope` tal cual en export e import (sin cambios).

### 6.5 Registro en el módulo
`PlanService` ya está en `PlanModule`. El import necesita el helper puro de ciclos (sin provider) y, si se
optara por el método público (§6.2 alternativa), inyectar `DependencyService` — ambos ya en el mismo módulo.
No se añaden módulos ni providers nuevos salvo que se elija la alternativa.

---

## 7. Diseño frontend

Stack: Next.js (App Router) + TypeScript estricto + Tailwind + shadcn/ui, cliente tipado
`@plantilla-portales/api-client` generado desde OpenAPI (`npm run generate` en `packages/api-client`
tras `openapi:generate` en la API). `sonner` para toasts, `ConfirmDialog` existente. Sin dependencias nuevas.

### 7.1 Helpers en `apps/web/src/lib/plan.ts`

Siguiendo el patrón `getPlan`/`createPlan` (manejo de `{ data, error, response }`, `PlanError`,
`messageForStatus`):

- `exportPlan(requestId): Promise<Plan…Document>`: `api.GET('/requests/{requestId}/plan/export', …)`;
  devuelve el documento tipado (`components['schemas']['PlanDocumentDto']`, reexportado como
  `PlanDocument` en `api-client.ts`).
- `importPlan(requestId, doc): Promise<ImportPlanResult>`: `api.POST('/requests/{requestId}/plan/import',
  { params, body: doc })`; traduce `409` (plan no editable) y `400` (documento inválido) a mensajes de
  `PlanError` entendibles.
- `downloadPlanDocument(requestId, doc): void`: construye un `Blob('application/json')` y dispara la
  descarga `plan-<requestId>.json`, exactamente igual que `downloadMarkdown` en `lib/documents.ts`
  (`URL.createObjectURL` + `<a download>` + `revokeObjectURL`).
- `parsePlanDocumentFile(file: File): Promise<unknown>`: lee el `.json` elegido (`file.text()` + `JSON.parse`),
  lanza `PlanError` con mensaje claro si no es JSON válido. La validación real (estructura/kind/version) la
  hace el backend; aquí solo se evita enviar basura y se da feedback inmediato.

### 7.2 Export de tareas a CSV — `apps/web/src/lib/tasks.ts`

Añadir `downloadTasksCsv(requestId, rows, lookups)`:
- Decisión **CSV con BOM UTF-8** (no `xlsx`): confirmado que `apps/web/package.json` **no** incluye
  `xlsx` ni `exceljs`; añadir una dependencia pesada contradice NFR-6. Un CSV con BOM `\uFEFF` lo abre
  Excel con acentos correctos.
**Nota de propósito (no alinear con el JSON):** el CSV es una **foto de la vista** para trabajo humano e
**incluye el responsable** (nombre resuelto en el frontend); el documento JSON de import/export es una
**plantilla portable** que **NO** transfiere `responsibleUserId` (§5.3). Son dos exportaciones de propósito
distinto; no deben «alinearse» (nadie debe quitar el responsable del CSV ni añadirlo al JSON por parecerse).

- Columnas (FR-3.1): Fase, Título, Responsable (nombre vía `personNameById`, «Sin asignar»/«—» si falta),
  Inicio, Fin, Estimación (h), Estado (etiqueta `taskStatusLabel`), Hito (Sí/No). Formateo de fechas con
  `formatDateOnly` (coherente con la tabla).
- Escapado CSV: entrecomillar y duplicar comillas en campos con `,`, `"` o salto de línea.
- Reutiliza datos ya en la vista (`tasks` filtradas, `phaseNameById`, `personNameById`); **sin backend**.
- Dispara descarga `tareas-<requestId>.csv` con el mismo patrón Blob + `<a download>`.

### 7.3 Afordances y gates de visibilidad en `plan-view.tsx`

Los botones se colocan junto al encabezado del plan (dentro de `renderPlan`, cuando `plan` existe y
`planState === 'success'`). Se agrupan en una pequeña barra de acciones del plan:

| Acción | Visible cuando | Habilitada cuando | Gate real |
|---|---|---|---|
| Exportar plan (JSON) | hay plan cargado (cualquier estado) | siempre (salvo `busy`) | ninguno (solo lectura) |
| Exportar tareas (Excel/CSV) | hay plan cargado | hay ≥1 tarea; `disabledReason` si 0 | ninguno (cliente) |
| Importar plan (JSON) | hay plan cargado | solo `canEdit` (BORRADOR/DEVUELTO) y no `busy` | backend 409 si no editable |

El *gating* del botón Importar es **cosmético**: aunque un usuario forzara la llamada, el backend
rechaza con 409 si el plan no es editable (NFR-3). El botón Importar usa un `<input type="file"
accept="application/json,.json">` oculto disparado por el botón real (accesible, operable por teclado).

Flujo de importación en la vista:
1. El usuario elige archivo → `parsePlanDocumentFile`.
2. Se abre un `ConfirmDialog` (tono `danger`) advirtiendo: «Esto reemplazará las fases, tareas y
   dependencias actuales de este plan. Esta acción no se puede deshacer.» Confirmar = `importPlan`.
3. Éxito → `toast.success(result.message)` (fuente única del texto, armado en backend §5.7; el frontend NO
   recompone el resumen desde los conteos para evitar divergencia) y `await refreshPlanData()`.
4. Error → `toast.error(messageOf(err))` (mapea `PlanError`/mensaje de backend). El input se limpia para
   permitir reintentar el mismo archivo.

Estados obligatorios (regla de UI): `busy` deshabilita las acciones durante la operación; el toast cubre
éxito/error; la vista ya maneja loading/empty/error del plan.

### 7.4 Regeneración del contrato
Tras añadir los endpoints/DTOs en la API: `npm run openapi:generate` (API) → `npm run generate`
(`packages/api-client`) para que `PlanDocumentDto`/`ImportPlanResultDto` existan en `components['schemas']`
y se reexporten en `apps/web/src/lib/api-client.ts` como `PlanDocument` / `ImportPlanResult`. Sin este paso
el helper tipado no compila (es parte del «verificar typecheck/build» del flujo de trabajo).

---

## 8. Pruebas (testabilidad)

Backend (Jest, patrón existente del módulo):
- **Unit (funciones puras extraídas)**: `applyMilestoneRule` (hito con horas/fechas inválidas → error; copia de
  fecha única; fuerza `estimateHours = 0`); `hasCycle(edges)` (detecta ciclo directo y transitivo del grafo
  completo; acepta DAG) y `reaches(edges, from, to)` (alcanzabilidad por arista, caso `add()`). Son puras → fáciles de testear.
- **Service `exportPlan`**: dado un plan con fases/tareas/dependencias, el documento tiene `kind`/`formatVersion`,
  `refs` únicos y dependencias resueltas a pares de `ref`; no abre transacción ni audita.
- **Service `importPlan`**: round-trip export→import reconstruye la estructura; REPLACE borra lo previo;
  409 si estado no editable; 400 si `kind`/`formatVersion`/estructura inválidos, **campo extra no declarado**
  (pipe estricto `forbidNonWhitelisted`), `ref` duplicado/colgante, ciclo (grafo completo) o hito inválido;
  `responsible/process` quedan `null`; campos de flujo no cambian; **no se valida `start ≤ end`** (paridad con
  el CRUD); auditoría `UPDATE PLAN` dentro de la tx; rollback ante fallo.
- **E2E/controller**: 200 export, 200 import, códigos de error, alcance/rol (403/404) con el harness existente.

Frontend (si hay suite): `downloadTasksCsv` (encabezados, escapado, BOM) y `parsePlanDocumentFile` (JSON
inválido → `PlanError`) son unitarios; el resto es integración manual de UI.

Nada en este diseño es difícil de testear: la lógica pesada (ciclos, hito) se aísla en funciones puras y
el import es una transacción determinista.

---

## 9. Supuestos

- SUP-1 Un único `formatVersion` soportado («1.0»); cualquier otro → 400. No se diseña migración de versiones
  (YAGNI; se añadirá cuando exista una v2 real).
- SUP-2 El documento se exporta/importa **completo**; no hay merge parcial. REPLACE es la semántica pedida.
- SUP-3 El tamaño de un plan es moderado (una pantalla de tabla, sin paginación según `plan-view.tsx`), así
  que leer todo en memoria para export/import y una sola transacción es adecuado; no se necesita *streaming*
  ni *bulk* especial.
- SUP-4 La exportación de tareas a CSV refleja las tareas **actualmente filtradas** en la vista (lo que el
  usuario ve), coherente con «exporta la lista de tareas que se muestra». Si se prefiere exportar siempre
  todas las tareas del plan, es un ajuste menor de qué arreglo se pasa a `downloadTasksCsv`.
- SUP-5 `ref` como string libre y único; el export genera `t0, t1, …`, pero el import acepta cualquier string
  válido para soportar documentos editados a mano. «Editar a mano» = cambiar valores dentro del esquema de §4.1;
  el pipe estricto (`forbidNonWhitelisted`, §5.6) rechaza con `400` cualquier campo extra, así que un documento
  editado debe respetar el conjunto exacto de propiedades declaradas.
- SUP-6 El import no transfiere responsable/proceso (§5.3); el usuario los reasigna tras importar, apoyado por
  la guía de pendientes existente.

---

## 10. Respuestas a la revisión de diseño (`design-review.json`)

Pase de revisión: `CHANGES_REQUESTED` — 1 HIGH, 3 MEDIUM, 3 NIT. Verificado cada hallazgo contra el código real
(`app.config.ts`, `dependency.service.ts`, `task.service.ts`) antes de editar. Todos resueltos:

- **#1 HIGH — ValidationPipe (`forbidNonWhitelisted`).** Resuelto. Verificado en `app.config.ts`: el pipe global
  tiene `whitelist: true` **y** `forbidNonWhitelisted: true`. Se corrige §5.6 (se elimina la afirmación de que
  los extras «se ignoran»; se adopta la opción (a) estricta: cualquier campo no declarado → `400`) y se ajustan
  §4.2, §4.3, §5.3 y SUP-5 para dejar explícito que el documento declara exactamente los campos de §4.1 y que
  editar a mano significa cambiar valores, no añadir propiedades.

- **#2 MEDIUM — Algoritmo de ciclos.** Resuelto. Verificado que `assertNoCycle` real es un chequeo de
  alcanzabilidad por arista (DFS desde `predecessorTaskId`). §6.2 ahora define **dos** funciones puras separadas
  en `plan/dependency/cycle.ts`: `reaches(edges, from, to)` para el caso `add()` y `hasCycle(edges)` para el
  grafo completo del import, fijando qué caller usa cuál. §5.5 paso 3 y §8 referencian `hasCycle`/`reaches`.

- **#3 MEDIUM — Coherencia de fechas.** Resuelto. §5.5 paso 3 declara explícitamente que NO se valida
  `start ≤ end` ni `periodStart ≤ periodEnd`, por paridad con el CRUD actual (solo `@IsDateString`), con nota de
  que una futura regla aplicaría por igual a CRUD/import/`applyMilestoneRule`. Reflejado también en §8.

- **#4 MEDIUM — Orden determinista de refs.** Resuelto. §5.4 fija `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`
  para tareas (desempate estable ante timestamps iguales creados en lote por el import) y explica por qué las
  fases no lo necesitan (`@@unique([planId, order])`).

- **#5 NIT — Mapeo campo a campo del `tx.task.create`.** Resuelto. §5.5(d) ahora enumera el objeto `data`
  completo usando `normalized.estimateHours/startDate/endDate` (resultado de `applyMilestoneRule`, no los crudos),
  igual que `TaskService.create`.

- **#6 NIT — Fuente única del mensaje.** Resuelto. §7.3 muestra `result.message` directamente en el toast;
  §5.7 marca `message` como fuente única y el frontend no recompone el resumen desde los conteos.

- **#7 NIT — CSV vs JSON.** Resuelto. §7.2 añade una nota de propósito: el CSV es foto de la vista con
  responsables; el JSON es plantilla portable sin responsables (§5.3); no deben alinearse.
