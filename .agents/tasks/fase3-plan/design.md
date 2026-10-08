# Diseño técnico · Fase 3 · Plan y Ejecución (control-phari)

> **Iteración 2 (revisión aplicada).** Existe `design-review.json` (veredicto
> `CHANGES_REQUESTED`: 1 MEDIUM + 2 NIT). Los tres findings se resolvieron en este documento; ver
> §13 "Respuestas a los findings de revisión". Esta fase construye el **plan por
> fases/tareas con dependencias**, la **guía de pendientes que gatea el envío**, la
> **autorización del plan** (enviar/autorizar/devolver) y la **ejecución de tareas respetando
> predecesoras**, sobre lo ya construido en Fase 1 (identidad, roles/grants, autorización por
> rol + alcance, auditoría transversal) y Fase 2 (flujo de demanda, `RequestState`,
> `RequestStateService`, patrón de gates server-side). Cubre el corte `FEATURE-004`
> (SCR-06/09, FNC-008–011, BR-007–011) de `specs/23`, los casos UC-004/005/006 y las historias
> US-005/006, con los AC-007/008/009/010/011/033 de `specs/18`.
>
> **Autoridad y método.** El steering del repo manda: NestJS es dueño de lógica de negocio,
> validaciones, autorización, persistencia, API REST y OpenAPI; Prisma vive **solo** en
> `apps/api`; el frontend consume **exclusivamente** vía `@plantilla-portales/api-client` y nunca
> toca PostgreSQL ni Prisma. Se **extiende tal cual** el patrón probado en Fases 1–2 (controller
> fino → service con lógica y `$transaction` → DTOs `class-validator` → `AuditService.record(tx,…)`
> dentro de la transacción → P2002 → `ConflictException` → política **403 rol / 404 alcance** →
> pantallas con estados loading/vacío/error/éxito y conservación de la entrada ante error).
>
> **Todo lo que el SDD marca `P`** (pendiente de cotejo contra el Site) se concentra en §12
> "DECISIONES de diseño" y se marca en el punto donde aparece. **Ninguna decisión P se presenta
> como hecho del Site**: se adopta la opción mínima, documentada y reversible; no se inventan
> requeridos, estados terminales, fórmulas ni la importación de Excel.

## Visión general

El plan arranca desde una `Request` en estado **`COMPROMETIDA`** (producido por la aprobación de
Fase 2) y la lleva por `COMPROMETIDA → EN_PLANIFICACION → EN_EJECUCION`. El plan se compone de
**fases** (`PlanPhase`) ordenadas, cada una con **tareas** (`Task`) que tienen responsable,
fechas, estimación, hito, criterios de aceptación, estado y progreso, y **dependencias**
(`TaskDependency`) entre tareas de ese plan. Una **guía de pendientes** calculada server-side por
categoría determina si el plan puede **enviarse** a autorización; una autoridad con capacidad
`review` lo **autoriza** (→ `EN_EJECUCION`) o lo **devuelve** con motivo (→ vuelve a edición).
Durante la ejecución, el responsable de una tarea cambia su estado respetando una **máquina de
estados de 5 estados** y el **gate de predecesoras** (una dependiente no entra `EN_CURSO` hasta
que todas sus predecesoras estén `TERMINADA` **y** `aceptada`).

El diseño reutiliza al máximo lo existente: `RequestState` ya incluye `EN_PLANIFICACION` y
`EN_EJECUCION`; `RequestStateService` ya es el **único escritor** de `operationalState` con
`assertTransition`; `MODULE_MATRIX` ya define las claves `plan`/`task`/`assigned`/`project`;
`AuditService.record(tx,…)` ya acepta nuevos `objectType`; el patrón "scope en el `where` del
service → 404" (Plano A) y "`@Roles` → 403" (Plano B) ya está probado. **No se rehace** nada de
Fases 1–2; se construye encima.

### Mapa rápido decisión → fuente

| Decisión | Respaldo |
|---|---|
| Plan 1:1 con Request; arranca desde `COMPROMETIDA` | brief; UC-004; `06` "Plan → ejecución"; §12 D1 |
| Entidades PlanPhase / Task / TaskDependency | SCR-06/09, `07`, `08`, `29`; brief |
| 5 estados de tarea `POR_HACER/EN_CURSO/BLOQUEADA/EN_REVISION/TERMINADA` | `06` "Plan y tarea"; SCR-09; BR-009 |
| Transiciones de tarea = DECISIÓN (P en `06`) | `06` "transiciones P"; §12 D7 |
| Gate predecesoras: TERMINADA **y** aceptada | BR-009, AC-010, AC-033; `06` |
| Detección de ciclos server-side | brief; `19` "dependencia circular" |
| Hito: 1 fecha, 0 horas | BR-010, AC-011; `19` |
| Guía de pendientes server-side, 5 categorías; gate de envío | BR-007, AC-007, SCR-06, UI-05 |
| Capacidad/evidencias/framework = ganchos de fase futura (P) | BR-007/016, `28`; §12 D5 |
| Importar Excel NO aprueba controles → no se implementa (gancho) | BR-008, AC-008/024; §12 D11 |
| Autorización del plan separada del envío (enviar/autorizar/devolver mínimos) | `06`, SCR-20, `12`; §12 D8 |
| Estados exactos de revisión/devolución del plan = P → mínimo documentado | `06` "no determinados"; §12 D8 |
| Fórmula de progreso = DECISIÓN (P) | SCR-06 "fórmula P"; BR-013; §12 D9 |
| Fase inicial protegida con tareas | AC-009, SCR-06; §12 D4 |
| NO sembrar 13 fases de BI como obligatorias; plantilla opcional documentada | BR-011, `11` SCR-06; §12 D3 |
| Extiende `RequestStateService` sin duplicar la máquina | Fase 2 §1.3/§3.2; código existente |
| Permisos: `plan` (jefe/líder), `task`/`assigned` (todos con alcance) | `10` MODULE_MATRIX; BR-020; `11` SCR-02/09 |
| Alcance por `mainProcessId` (404 fuera de alcance) | Fase 1 §2.4, Fase 2 §2.5 |
| Evidencia = campo URL/texto (no módulo documentos) | brief; `11` SCR-09; §12 D10 |

### Supuestos explícitos

1. La `Request` llega a `COMPROMETIDA` por el `POST .../approval` de Fase 2 (verificado en el
   código existente: `ApprovalService` fija `COMPROMETIDA`). Fase 3 añade la transición
   `COMPROMETIDA → EN_PLANIFICACION` al crear el plan (§3.2).
2. El "proceso principal de la Request" (`Request.mainProcessId`) gobierna el alcance del plan y
   es el `scopeProcessId` de toda auditoría de Fase 3 (invariante heredado de Fase 2 §1.7/§6).
3. El `Task.processId` que menciona SCR-06 ("Proceso / contexto de proceso") es **informativo**:
   el alcance real de la tarea es el de su plan→Request→`mainProcessId`. Se persiste el proceso de
   la tarea como referencia (puede diferir del principal en multiproceso) pero **no** amplía
   alcance (coherente con Fase 2 §11 D9: participar no amplía scope). Ver §12 D10.
4. "Capacidad/evidencias/puertas/framework" son categorías de la guía que **existen** (BR-007) pero
   cuyo contenido pertenece a fases posteriores (Capacidad = FEATURE-005; Frameworks =
   FEATURE-008). En Fase 3 son **ganchos evaluables** con implementación mínima/diferida y
   documentada; no se inventa su lógica (§12 D5).

---

## 1. Modelo de datos (Prisma)

### 1.1 Principios heredados (sin cambios)

- Esquema físico en `apps/api/prisma/schema.prisma`. Modelos PascalCase; columnas `snake_case` vía
  `@map`/`@@map`; PK `String @id @default(uuid()) @db.Uuid`; timestamps `created_at`
  (`@default(now())`) / `updated_at` (`@updatedAt`) en toda tabla mutable, igual que `Request`.
- **Robustez ante `findUnique` con `@@unique` de un solo campo (Prisma 7):** por robustez ante el
  comportamiento de `findUnique`/`upsert` con un `@@unique` de **un solo campo** con `name` custom en
  Prisma 7 (no respaldado por un precedente verificado en el repo —las 1:1 de Fase 2 usan
  `@@index([requestId])`, no un `@@unique` de un solo campo consultado por `findUnique`— ni por las
  revisiones de Fase 1/2, pero adoptado como precaución), toda resolución por un único campo con
  `name` custom se hace con **`findFirst`**, no con `findUnique`. Los `@@unique` **compuestos** sí se
  usan como `where` de `findUnique`. En Fase 3 esto afecta `Plan` (clave `request_id` de un solo campo
  → se consulta con `findFirst`; el `@@unique` sigue garantizando el 1:1 a nivel de BD) y, al revés,
  favorece `TaskDependency` (clave **compuesta** `(dependentTaskId, predecessorTaskId)` → sí usable
  como `where` de `findUnique` para idempotencia y detección de duplicados). La solución es correcta
  sea cierto o no el comportamiento: `findFirst` funciona en ambos casos y el `@@unique` cubre la
  integridad; una prueba unit (§6) fija el acceso elegido.
- Solo se modelan entidades/campos confirmados para esta fase. No se crean tablas de Capacidad,
  Bitácora, Novedad, Reunión, Compromiso, Activo, Documento, Framework/control (fases 4+).
- Los estados (de tarea y de plan) se modelan como **enum lógico TypeScript + columna texto**, no
  como `CatalogItem`, por el mismo criterio por el que `RoleCode`/`RequestState` son conjuntos
  cerrados y tipados: **gobiernan la lógica de los gates** y deben ser cerrados, no administrables.
  Esto respeta `06` ("los nombres de catálogo no deben codificar transiciones automáticas"): el
  enum vive en el backend y las transiciones se declaran explícitamente, no se derivan del
  catálogo `TASK_STATUS` sembrado en Fase 1 (que queda para etiquetas de UI, no para lógica).

### 1.2 Entidades nuevas y relaciones

```
Request (1) ──< (0..1) Plan                 [1:1 efectivo; FK única request_id — §12 D1]
Plan    (1) ──< (N)  PlanPhase              [fases ordenadas por `order`]
PlanPhase(1) ──< (N) Task                   [tareas de la fase]
Process (1) ──< (N)  Task                   [proceso de contexto, informativo — supuesto 3]
User    (1) ──< (N)  Task                   [responsable, FK]
Task    (1) ──< (N)  TaskDependency (dependent)    ┐ N:M entre tareas del mismo plan,
Task    (1) ──< (N)  TaskDependency (predecessor)  ┘ vía tabla puente TaskDependency
User    (1) ──< (N)  Plan                   [enviadoPor / autorizadoPor, opcionales]
```

Todas las entidades nuevas añaden su relación inversa en `Request`, `Process` y `User` sin alterar
campos existentes de Fases 1–2.

#### Plan

Plan de trabajo de una Request comprometida (SCR-06; `07`/`08`; brief punto 1).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| requestId | `String @db.Uuid` | `request_id` | FK → Request (`onDelete: Cascade`); **único** (1:1, §12 D1) |
| periodStart | `DateTime?` | `period_start` | inicio del periodo del plan; opcional |
| periodEnd | `DateTime?` | `period_end` | fin del periodo; opcional |
| commitmentDate | `DateTime?` | `commitment_date` | fecha de compromiso del plan; opcional |
| risks | `String?` | `risks` | riesgos; texto; opcional |
| mitigations | `String?` | `mitigations` | mitigaciones; texto; opcional |
| status | `String @default("BORRADOR")` | `status` | enum lógico `PlanStatus` (§1.4); **derivado/read-only**, solo lo escribe el helper |
| submittedAt | `DateTime?` | `submitted_at` | fecha de envío a autorización; null si no enviado |
| submittedByUserId | `String? @db.Uuid` | `submitted_by_user_id` | FK → User; quién envió |
| authorizedAt | `DateTime?` | `authorized_at` | fecha de autorización; null si no autorizado |
| authorizedByUserId | `String? @db.Uuid` | `authorized_by_user_id` | FK → User; quién autorizó |
| returnReason | `String?` | `return_reason` | motivo de la última devolución (si fue devuelto) |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | auditoría técnica |

Relaciones:
`request Request @relation(fields:[requestId], references:[id], onDelete: Cascade)`,
`phases PlanPhase[]`,
`submittedBy User? @relation("PlanSubmittedBy", fields:[submittedByUserId], references:[id], onDelete: Restrict)`,
`authorizedBy User? @relation("PlanAuthorizedBy", fields:[authorizedByUserId], references:[id], onDelete: Restrict)`.
Índices: `@@unique([requestId], name: "plan_request_unique")`, `@@index([status])`, `@@map("plans")`.

> **Resolución de `plan_request_unique` (Prisma 7, precaución).** Es un `@@unique` de **un solo
> campo**. Por robustez ante el comportamiento de `findUnique`/`upsert` con un `@@unique` de un solo
> campo con `name` custom en Prisma 7 (premisa de precaución, no verificada en el repo; §1.1), para
> resolver un plan por `requestId` el service usa **`findFirst({ where: { requestId } })`**, nunca
> `findUnique({ where: { requestId } })`. La restricción `@@unique([requestId])` **garantiza igual a
> nivel de BD** que no haya dos planes por Request (sí se aplica como constraint); solo cambia cómo se
> consulta, y la elección es correcta se cumpla o no la premisa. El `status` por defecto `BORRADOR` vive **únicamente** en el schema; el service no lo
> repite al crear (misma política que `Request.operationalState`, Fase 2 MEDIUM-3). La columna
> `status` solo la escribe el helper de `PlanStateService` (§3.2), nunca un `update`/DTO libre.

**DECISIÓN §12 D1 (Plan 1:1 con Request).** Se elige **1:1** (una Request tiene a lo sumo un plan)
frente a 1:N (histórico de planes), con `request_id` único. Razones: (a) UC-004 y SCR-06 describen
"el plan de la solicitud" en singular; (b) el brief dice "1:1 o 1:N si lo justificas" y no hay
evidencia en el SDD de múltiples planes por iniciativa; (c) 1:1 hace trivial y determinista la
resolución "plan de esta Request" y el gate de envío. El histórico de **decisiones** del plan
(enviar/autorizar/devolver) no se pierde: queda en `AuditEvent` (append-only) y en los campos
`submittedAt`/`authorizedAt`/`returnReason`. Si una fase futura confirma versiones de plan, se
reabre introduciendo un `PlanVersion` sin romper lo existente (punto exacto a reabrir).

#### PlanPhase (Fase)

Fase del plan (SCR-06 "Fases"; `08`; AC-009).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| planId | `String @db.Uuid` | `plan_id` | FK → Plan (`onDelete: Cascade`) |
| name | `String` | `name` | **requerido** (SCR-06 "nombre requerido"); `MaxLength(255)` |
| startDate | `DateTime?` | `start_date` | fecha inicio; opcional en modelo, exigida por la guía |
| endDate | `DateTime?` | `end_date` | fecha fin; opcional en modelo, exigida por la guía |
| deliverable | `String?` | `deliverable` | entregable; texto; opcional |
| order | `Int` | `order` | **requerido**; posición 0-based dentro del plan; reordenable |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Relaciones: `plan Plan @relation(...)`, `tasks Task[]`.
Índices: `@@unique([planId, order], name: "plan_phase_order_unique")` (compuesto → usable como
`where`), `@@index([planId])`, `@@map("plan_phases")`.

**Fase inicial protegida (AC-009, §12 D4).** La "fase inicial" es la de **menor `order`** del plan.
No existe un flag `isInitial` en el modelo: ser inicial es una propiedad **derivada** del `order`
mínimo, para que reordenar no requiera migrar un flag. La protección (no borrar/no mover la fase
inicial **cuando tiene tareas**) la enforcea el service (§2.5), no la BD. Las fechas de fase son
opcionales en el schema porque el modelo no las impone, pero la **guía de pendientes** (§2.1) exige
que toda fase tenga `startDate` y `endDate` antes del envío (BR-007). El `@@unique([planId, order])`
mantiene el orden consistente; el reordenamiento recomputa `order` dentro de una transacción (§2.5).

**NO se siembran las 13 fases de BI (§12 D3, BR-011).** `11` SCR-06 observa una plantilla de 13
fases en BI, pero BR-011 prohíbe asumir que aplica a Integraciones/IA. Fase 3 crea planes **sin
fases predefinidas**: el usuario crea las fases que necesite. Se documenta una **plantilla opcional**
(§2.6) que el usuario puede aplicar explícitamente para BI, pero **nunca** se siembra como
obligatoria ni se asume para otros procesos. No se persiste como datos; es una constante de ayuda
en el frontend, marcada provisional.

#### Task (Tarea)

Tarea del plan (SCR-06 "Tarea del plan" / SCR-09; `08`; BR-009/010/013; AC-010/011/033).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| phaseId | `String @db.Uuid` | `phase_id` | FK → PlanPhase (`onDelete: Cascade`) |
| processId | `String? @db.Uuid` | `process_id` | FK → Process; contexto de proceso (informativo, supuesto 3); opcional |
| title | `String` | `title` | **requerido** (SCR-06 "obligatorio"); `MaxLength(255)` |
| responsibleUserId | `String? @db.Uuid` | `responsible_user_id` | FK → User; responsable; opcional en modelo, exigido por la guía |
| startDate | `DateTime?` | `start_date` | fecha inicio planificada; opcional en modelo, exigida por la guía |
| endDate | `DateTime?` | `end_date` | fecha fin/vencimiento; opcional en modelo, exigida por la guía |
| estimateHours | `Int?` | `estimate_hours` | estimación en horas; `Min(0)`; **hito ⇒ 0** (BR-010) |
| isMilestone | `Boolean @default(false)` | `is_milestone` | hito (BR-010/AC-011) |
| description | `String?` | `description` | descripción/alcance; texto; opcional |
| acceptanceCriteria | `String?` | `acceptance_criteria` | criterios de aceptación; texto; opcional |
| status | `String @default("POR_HACER")` | `status` | enum lógico `TaskStatus` (§1.3); solo lo escribe el helper |
| progress | `Int @default(0)` | `progress` | porcentaje 0–100 (§12 D9); derivado del estado por defecto |
| frameworkPhaseRequired | `String?` | `framework_phase_required` | "fase de framework requerida" (SCR-06); **texto opcional**; NO implementa framework (§12 D5) |
| accepted | `Boolean @default(false)` | `accepted` | aceptación de la tarea (gate de dependientes, BR-009/AC-033) |
| acceptedAt | `DateTime?` | `accepted_at` | fecha de aceptación; null si no aceptada |
| acceptedByUserId | `String? @db.Uuid` | `accepted_by_user_id` | FK → User; quién aceptó |
| evidenceUrl | `String?` | `evidence_url` | evidencia como URL/texto (NO módulo documentos, §12 D10); `MaxLength(2048)` |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Relaciones: `phase PlanPhase @relation(...)`,
`process Process? @relation(fields:[processId], references:[id], onDelete: Restrict)`,
`responsible User? @relation("TaskResponsible", fields:[responsibleUserId], references:[id], onDelete: Restrict)`,
`acceptedBy User? @relation("TaskAcceptedBy", fields:[acceptedByUserId], references:[id], onDelete: Restrict)`,
`dependenciesAsDependent TaskDependency[] @relation("DependencyDependent")`,
`dependenciesAsPredecessor TaskDependency[] @relation("DependencyPredecessor")`.
Índices: `@@index([phaseId])`, `@@index([responsibleUserId])`, `@@index([status])`, `@@map("tasks")`.

Notas de modelado:
- `responsibleUserId`/`startDate`/`endDate` son **opcionales en el schema** (una tarea se puede
  crear como borrador incompleto) pero la **guía de pendientes** los exige para enviar (§2.1). Esto
  separa "modelo permisivo" de "gate de envío", igual que Fase 2 separó datos de precondición.
- `estimateHours` nullable con `Min(0)`. **Invariante hito (BR-010/AC-011):** si `isMilestone=true`
  entonces `estimateHours` debe ser `0` (null se normaliza a 0) y las fechas presentes deben
  reducirse a **una sola fecha efectiva** (`startDate = endDate` o solo una informada). El
  enforcement es del service (§2.4), no de la BD (Prisma no modela esa condicional).
- `frameworkPhaseRequired` es **texto libre opcional**: captura el campo observado "fase de
  framework requerida" (SCR-06) **sin** implementar el framework completo (matriz de controles es
  `P` en `28`, §12 D5). Es solo un dato; no gatea nada en Fase 3.
- `progress` entero 0–100; su relación con el estado y por qué no deriva de bitácora (BR-013) está
  en §12 D9. `evidenceUrl` es un campo URL/texto, **no** un vínculo a un módulo de documentos
  (FEATURE-007, §12 D10).
- `accepted`/`acceptedAt`/`acceptedByUserId` materializan la **aceptación** que el gate de
  dependientes necesita (BR-009/AC-033): "terminada **y** aceptada" son dos condiciones distintas;
  `status=TERMINADA` **no** implica `accepted=true`.

#### TaskDependency (N:M predecesoras)

Dependencia entre dos tareas del mismo plan (SCR-06 "Predecesoras"; BR-009; AC-010/033).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| dependentTaskId | `String @db.Uuid` | `dependent_task_id` | FK → Task (`onDelete: Cascade`); la tarea que depende |
| predecessorTaskId | `String @db.Uuid` | `predecessor_task_id` | FK → Task (`onDelete: Cascade`); la predecesora |
| createdAt | `DateTime @default(now())` | `created_at` | append-only (sin updatedAt) |

Relaciones:
`dependent Task @relation("DependencyDependent", fields:[dependentTaskId], references:[id], onDelete: Cascade)`,
`predecessor Task @relation("DependencyPredecessor", fields:[predecessorTaskId], references:[id], onDelete: Cascade)`.
Índices: `@@unique([dependentTaskId, predecessorTaskId], name: "task_dependency_unique")`
(**compuesto → usable como `where` de `findUnique`**, hallazgo Prisma 7), `@@index([predecessorTaskId])`,
`@@map("task_dependencies")`.

> **Cascade al borrar tareas (ver §2.5/§12 D15).** Ambas FK son `onDelete: Cascade`, pero el service
> **no** se apoya en el cascade para la rama "predecesora": rechaza (409) borrar una tarea que es
> predecesora de otra, para no eliminar aristas de dependencia silenciosamente. El cascade solo opera
> para las aristas donde la tarea borrada es *dependiente* (ya sin impacto sobre terceras tareas).

Reglas de integridad (enforce en service, §2.3):
- **No auto-dependencia:** `dependentTaskId ≠ predecessorTaskId` → 400.
- **Mismo plan:** ambas tareas deben pertenecer a fases del **mismo** `planId` → si no, 400 (no se
  cruzan planes). El service resuelve `phase→plan` de ambas y compara.
- **No duplicado:** el `@@unique` compuesto evita la misma arista dos veces; un `POST` repetido →
  409 (idempotencia por constraint; se consulta con `findUnique` por la clave compuesta).
- **No ciclos:** antes de crear la arista `dependent ← predecessor`, el service hace **detección de
  ciclos server-side** (§2.3): si añadir la arista crearía un ciclo en el grafo dirigido de
  dependencias del plan → 400 con mensaje de la arista que lo provocaría (`19` "dependencia
  circular").

### 1.3 Enum de estados de tarea y transiciones (máquina de estados)

Enum lógico `TaskStatus` en `apps/api/src/modules/plan/task-status.ts`, espejo del catálogo
confirmado en `06`/SCR-09:

```
POR_HACER, EN_CURSO, BLOQUEADA, EN_REVISION, TERMINADA
```

Los 5 estados están **confirmados** (`06`; SCR-09). Las **transiciones concretas son `P`** en `06`
("transiciones por estado P"); por eso se adopta una máquina **razonable y documentada**
(DECISIÓN §12 D7), no afirmada como la del Site. Transiciones permitidas (enforce en helper, §3.2):

| Desde \ Hacia | POR_HACER | EN_CURSO | BLOQUEADA | EN_REVISION | TERMINADA |
|---|---|---|---|---|---|
| **POR_HACER**   | — | ✓ (gate predecesoras) | ✓ | — | — |
| **EN_CURSO**    | ✓ | — | ✓ | ✓ | — |
| **BLOQUEADA**   | ✓ | ✓ (gate predecesoras) | — | — | — |
| **EN_REVISION** | — | ✓ | ✓ | — | ✓ |
| **TERMINADA**   | — | ✓ (reabrir) | — | — | — |

Racional de cada arista (DECISIÓN §12 D7, revisable cuando el Site confirme):
- `POR_HACER → EN_CURSO`: iniciar; **gate de predecesoras** (§2.7) — bloquea si alguna predecesora
  no está `TERMINADA` **y** `aceptada` (BR-009/AC-010/033).
- `POR_HACER → BLOQUEADA` y `EN_CURSO → BLOQUEADA`: marcar bloqueo (sin gate; `06` "Ejecución ↔
  bloqueada").
- `BLOQUEADA → POR_HACER` / `BLOQUEADA → EN_CURSO`: desbloquear (ir a curso **re-aplica** el gate).
- `EN_CURSO → EN_REVISION`: enviar a revisión antes de terminar.
- `EN_REVISION → EN_CURSO` / `EN_REVISION → BLOQUEADA`: devolver de revisión / bloquear.
- `EN_REVISION → TERMINADA`: completar tras revisión. **Terminar NO acepta**: `accepted` se fija por
  una acción separada (§2.7), coherente con BR-009/AC-033.
- `TERMINADA → EN_CURSO`: **reabrir** para corrección (`19` "tarea que se completa pero no acepta").
- `EN_CURSO → POR_HACER`: revertir a pendiente (corrección temprana).

Las transiciones **no listadas** (p. ej. `POR_HACER → TERMINADA`, `BLOQUEADA → TERMINADA`) **no se
permiten** → el helper lanza `ConflictException` (precondición no cumplida). El helper
`isTaskTransitionAllowed(from,to)` vive junto al enum y es 100% unit-testeable.

### 1.4 Enum de estados del plan (implementado vs. solo modelado)

Enum lógico `PlanStatus` en `apps/api/src/modules/plan/plan-status.ts`:

```
BORRADOR, EN_AUTORIZACION, AUTORIZADO, DEVUELTO
```

`06` marca los **estados exactos de revisión/devolución/autorización del plan como "no
determinados"** (`P`). Se implementa el **mínimo** para el flujo del brief, documentado como
DECISIÓN §12 D8 (no afirmado como del Site):

| Estado | Significado | Request asociada |
|---|---|---|
| `BORRADOR` | plan en edición (default al crear) | `EN_PLANIFICACION` |
| `EN_AUTORIZACION` | enviado, esperando autorización (guía sin pendientes) | `EN_PLANIFICACION` |
| `AUTORIZADO` | autorizado por `review` | **`EN_EJECUCION`** |
| `DEVUELTO` | devuelto con motivo; vuelve a edición | `EN_PLANIFICACION` |

Transiciones del plan **implementadas** (helper `assertPlanTransition`, §3.2):

| Transición | Disparador | Efecto en Request |
|---|---|---|
| (alta) → `BORRADOR` | crear plan desde Request `COMPROMETIDA` | `COMPROMETIDA → EN_PLANIFICACION` |
| `BORRADOR → EN_AUTORIZACION` | enviar plan (guía con **cero** pendientes) | sin cambio (`EN_PLANIFICACION`) |
| `DEVUELTO → EN_AUTORIZACION` | reenviar tras corregir (guía sin pendientes) | sin cambio |
| `EN_AUTORIZACION → AUTORIZADO` | autorizar (rol `review`) | `EN_PLANIFICACION → EN_EJECUCION` |
| `EN_AUTORIZACION → DEVUELTO` | devolver con motivo (rol `review`) | sin cambio (vuelve a edición) |

Transiciones **NO implementadas** (los estados de Request existen pero ninguna acción de Fase 3 los
produce; Validación/cierre, fases 5+): `EN_EJECUCION → EN_VALIDACION`, reapertura/retiro, y
`BLOQUEADA` a nivel Request. `06` las marca `P`: se **modela el estado** pero **no** se codifica la
transición. (La `BLOQUEADA` de Fase 3 es a nivel **Task**, no Request: bloquear una tarea no cambia
el `operationalState` de la Request.)

### 1.5 Cómo se extiende RequestState / RequestStateService (sin duplicar la máquina)

`RequestState` ya contiene `COMPROMETIDA`, `EN_PLANIFICACION`, `EN_EJECUCION` (verificado en
`request-state.ts`). Fase 3 **no añade estados** a `RequestState`: solo **habilita dos
transiciones** hoy "solo modeladas", ampliando `IMPLEMENTED_TRANSITIONS` en `request-state.ts`:

```ts
// Fase 3: el plan arranca desde una Request COMPROMETIDA.
[RequestState.COMPROMETIDA, RequestState.EN_PLANIFICACION],
// Fase 3: plan autorizado -> ejecucion.
[RequestState.EN_PLANIFICACION, RequestState.EN_EJECUCION],
```

El **único escritor** de `operationalState` sigue siendo `RequestStateService.assertTransition`
(existente): los services de Fase 3 lo invocan dentro de su `$transaction`, exactamente como
`TriageService`/`ApprovalService`. **No se duplica** la máquina de Request: las máquinas de **tarea**
y **plan** son propias de Fase 3 (helpers nuevos en `plan/`), separadas de la de Request; la de
Request solo gana dos aristas en su lista existente. Los helpers de tarea/plan **no** tocan
`operationalState`; solo los dos cruces "plan creado" / "plan autorizado" disparan una transición de
Request vía el helper existente.

**DECISIÓN §12 D13 (dónde vive la máquina de tarea/plan).** Se crea un **`PlanStateService` propio**
del módulo `plan/` para las máquinas de tarea y plan, en vez de inflar `RequestStateService`.
Razón: la máquina de tarea/plan es responsabilidad del dominio plan; `RequestStateService` se reusa
**solo** para la transición de `operationalState` (que importa el `PlanModule`). Mantiene cohesión y
respeta "monolito modular".

### 1.6 Auditoría: nuevos objectType

`AuditService.record(tx,…)` se usa **tal cual**. Se amplía `AuditObjectType` en `audit.service.ts`
para incluir `PLAN`, `PLAN_PHASE`, `TASK`, `TASK_DEPENDENCY` (hoy incluye
`PROCESS|USER|GRANT|CATALOG_ITEM|REQUEST|TRIAGE|PRIORITY_EVALUATION|APPROVAL`). El set de `action`
(`CREATE|UPDATE|DELETE|REVOKE`) **no cambia**:
- crear plan/fase/tarea/dependencia → `CREATE`;
- editar plan/fase/tarea, reordenar fases, cambiar estado/progreso/aceptación de tarea,
  enviar/autorizar/devolver plan → `UPDATE` (el cambio de estado va en before/after);
- quitar fase/tarea/dependencia → `DELETE`.

**Invariante (hereda Fase 2 §6):** toda mutación de dominio de Fase 3 escribe su `AuditEvent`
**dentro de la misma `$transaction`**, con `scopeProcessId = Request.mainProcessId` (el proceso
principal de la Request del plan). `objectId` = id del objeto mutado. before/after capturan el
cambio (p. ej. `{status}` antes/después de una transición de tarea). Cuando autorizar el plan
cambia también el estado de la Request, se registran **dos** eventos en la misma transacción:
`UPDATE PLAN` y `UPDATE REQUEST` (patrón idéntico a `TriageService`).

### 1.7 Estrategia de migración

Una única migración versionada nueva, con el comando real del repo (nunca `db push`), desde
`apps/api`:

```
npm run prisma:migrate:dev -- --name fase3_plan
```

Produce `apps/api/prisma/migrations/<timestamp>_fase3_plan/migration.sql` con las tablas `plans`,
`plan_phases`, `tasks`, `task_dependencies`, sus FKs, uniques e índices, en el formato de las
migraciones existentes. Luego `npm run prisma:generate` regenera el client tipado en
`src/generated/prisma`. Las tablas de Fases 1–2 **no se tocan**. No se añaden filas de seed
obligatorias de fases (BR-011/§12 D3); el seed existente se mantiene idempotente sin cambios.

---

## 2. Lógica de negocio y gates (server-side)

Todos los gates se evalúan **siempre en el service** (NestJS dueño de las reglas). Ocultar un botón
no es control (BR-019); el backend **rechaza** la operación aunque la UI lo permita. Cada gate no
cumplido produce un error de dominio tipado (`BadRequestException` 400 / `ConflictException` 409)
**sin** mutar nada. Separación 400/409 heredada de Fase 2: **409** = precondición de fase (el objeto
existe, falta una condición del flujo); **400** = validación de dato de entrada; **403/404** =
permiso/alcance.

### 2.1 Guía de pendientes y gate de envío (NÚCLEO — BR-007/AC-007)

La guía "Resuelve el siguiente paso" se calcula **server-side** y devuelve, por **categoría**, la
lista de pendientes. El plan **solo puede enviarse** (`BORRADOR|DEVUELTO → EN_AUTORIZACION`) cuando
**todas** las categorías implementadas tienen cero pendientes. El backend **rechaza el envío** si
hay pendientes (409), sin confiar en la UI.

**Las 5 categorías confirmadas** (BR-007; SCR-06; `11` UI-05) y su implementación en Fase 3:

| Categoría | Clave | Implementación Fase 3 | Pendientes que calcula |
|---|---|---|---|
| Fechas/fases | `datesPhases` | **completa** | fase sin `startDate` o `endDate`; `startDate > endDate`; cero fases |
| Tareas/responsables | `tasksResponsibles` | **completa** | cero tareas en el plan; tarea sin `responsibleUserId`; tarea sin `startDate`/`endDate`; (hito) estimación ≠ 0 |
| Capacidad | `capacity` | **gancho (diferida)** | §2.2 — siempre 0 pendientes en Fase 3, documentado como gate futuro |
| Evidencias/puertas | `evidenceGates` | **gancho (diferida)** | §2.2 — siempre 0 pendientes en Fase 3 |
| Controles de framework | `frameworkControls` | **gancho (diferida)** | §2.2 — siempre 0 pendientes en Fase 3 |

**Mínimo verificable para enviar (DECISIÓN §12 D5, derivado de BR-007/AC-007):**
1. El plan tiene **al menos una fase**.
2. **Toda fase** tiene `startDate` y `endDate`, con `startDate ≤ endDate`.
3. El plan tiene **al menos una tarea**.
4. **Toda tarea** tiene `responsibleUserId`, `startDate` y `endDate` (`startDate ≤ endDate`); si es
   hito, cumple la regla hito (una fecha, 0 horas).

Estas cuatro reglas cubren las dos categorías **confirmadas e implementables** con el modelo de
Fase 3 (`datesPhases`, `tasksResponsibles`). Son exactamente los pendientes que AC-007 enumera
("fase/tarea/responsable/fecha pendiente"). El cálculo lo hace `PlanGuideService.compute(planId)`
(§3.2), que devuelve un `PlanGuideDto`:

```ts
interface PlanGuidePendingDto { category: string; code: string; message: string; targetId?: string; }
interface PlanGuideDto {
  planId: string;
  canSubmit: boolean;                 // true solo si pendings.length === 0 en categorias implementadas
  pendings: PlanGuidePendingDto[];    // por categoria, con mensaje legible y id del objeto afectado
  futureCategories: string[];         // ['capacity','evidenceGates','frameworkControls'] — ganchos
}
```

`canSubmit` es la **única** fuente de verdad del gate: `submit()` recomputa la guía dentro de su
`$transaction` y, si `canSubmit=false`, lanza 409 enumerando los pendientes (no confía en que la UI
haya deshabilitado el botón). La UI muestra `pendings` por categoría y deshabilita el botón mientras
`canSubmit=false` (AC-007), pero es cosmético.

### 2.2 Categorías gancho de fases futuras (Capacidad / Evidencias / Framework)

BR-007 confirma que la guía **incluye** las categorías capacidad, evidencias/puertas y controles de
framework, pero su contenido pertenece a fases posteriores (Capacidad = FEATURE-005; Frameworks =
FEATURE-008) y la matriz de controles es `P` en `28`. **DECISIÓN §12 D5 (gancho explícito, no
invención):** en Fase 3 estas tres categorías existen en el contrato (`futureCategories`) pero
**no aportan pendientes** (siempre 0), por lo que **no bloquean** el envío todavía. Se documenta
que son **gates futuros**: cuando se construyan Capacidad y Frameworks, `PlanGuideService` sumará
sus pendientes a `pendings` y el gate de envío los exigirá, **sin** cambiar el contrato ni el
mecanismo (solo se "encienden" las categorías). No se inventa su lógica (no se calcula capacidad,
ni se evalúan controles) porque sería afirmar reglas `P`. La UI muestra estas categorías como
"se evaluarán en una fase posterior" para no sugerir que ya gatean.

**Gancho de importación de Excel (BR-008/AC-008/AC-024, §12 D11):** el brief es explícito —
**NO se implementa importación de Excel** (es `P` en `28`), y "importar Excel NO aprueba controles".
Se deja **solo un gancho documentado**: si en el futuro se añade importación, deberá entrar por un
endpoint propio que **nunca** cambie el estado de controles/gates ni el `status` del plan; importar
sería crear/actualizar fases/tareas como borrador, sometidas igualmente a la guía de pendientes.
En Fase 3 no hay endpoint ni botón de importación; si la UI muestra el gancho, el texto deja claro
que "importar no aprueba controles".

### 2.3 Dependencias y detección de ciclos

Añadir una predecesora (`POST .../dependencies`) con `{ predecessorTaskId }` para una tarea
`dependentTaskId`:
1. Resolver ambas tareas dentro del alcance (plan de la Request en scope, §2.8) → 404 si fuera de
   alcance.
2. `dependentTaskId ≠ predecessorTaskId` → si no, **400** (no auto-dependencia, `19`).
3. Ambas pertenecen al **mismo plan** (resolviendo `task→phase→plan`) → si no, **400**.
4. **Detección de ciclos (server-side):** se construye el grafo dirigido de dependencias del plan
   (aristas `dependent → predecessor` existentes) y se verifica si añadir `dependent → predecessor`
   crea un ciclo. Algoritmo: **DFS/BFS desde `predecessorTaskId` siguiendo las aristas
   `dependent→predecessor` ya existentes**; si se alcanza `dependentTaskId`, la nueva arista
   cerraría un ciclo → **400** con mensaje que nombra las dos tareas implicadas. (Equivale a:
   "¿`dependentTaskId` ya es, directa o transitivamente, predecesora de `predecessorTaskId`?"). El
   grafo se arma con una sola consulta de todas las `TaskDependency` del plan (acotado al plan, no
   global), por lo que es O(V+E) sobre un plan.
5. Si no hay ciclo ni duplicado → crear la arista + `AuditEvent CREATE TASK_DEPENDENCY` en una
   `$transaction`. Duplicado (clave compuesta ya existe) → **409**.

Quitar una predecesora (`DELETE .../dependencies/:predecessorTaskId` o por id) → borra la arista +
`AuditEvent DELETE`. No hay gate para quitar (quitar nunca crea ciclos).

**Dónde se enforce el invariante "sin ciclos":** en el **service** (único con acceso a Prisma y al
grafo completo del plan), al crear la arista, **antes** de persistir. No se delega a la BD (Postgres
no detecta ciclos de grafo declarativamente) ni a la UI. Es unit-testeable con el grafo en memoria.

### 2.4 Regla del hito (BR-010/AC-011)

Al crear/editar una tarea con `isMilestone=true`, el service valida (si no, **400**):
- `estimateHours` debe ser `0` (si llega null, se **normaliza** a 0; si llega > 0 → 400).
- La tarea debe reducirse a **una sola fecha**: se admite `startDate` y `endDate` **iguales**, o
  solo una de las dos informada; si llegan dos fechas distintas → 400 ("un hito usa una sola
  fecha"). El service, si recibe una sola fecha, copia ese valor en ambas columnas para dejar la
  tarea consistente (una fecha efectiva), o deja ambas iguales.

Marcar `isMilestone=true` sobre una tarea existente con horas > 0 o dos fechas distintas también
dispara la validación (400) hasta que el cliente ajuste. (`19`: "hito con más de una fecha o
esfuerzo distinto de cero" es el caso a rechazar.)

### 2.5 Gestión de fases: crear, editar, reordenar, proteger la inicial

- **Crear fase:** `order` se asigna al final (max(order)+1) si no se especifica; el nombre es
  requerido. `AuditEvent CREATE PLAN_PHASE`.
- **Editar fase:** nombre/fechas/entregable; `AuditEvent UPDATE`.
- **Reordenar:** `PATCH .../phases/reorder` recibe la lista ordenada de ids (o un move arriba/abajo);
  el service recomputa `order` 0-based de todas las fases del plan **dentro de una `$transaction`**
  para respetar `@@unique([planId, order])` (se escribe un orden temporal/offset o se borra-reescribe
  el bloque en la transacción para evitar colisión de unique durante el swap). `AuditEvent UPDATE`
  por fase afectada (o un único UPDATE PLAN con before/after del orden; se elige **UPDATE PLAN** con
  snapshot del orden para no inflar la auditoría, documentado).
- **Fase inicial protegida (AC-009, §12 D4):** la fase de `order` mínimo. El service **rechaza**
  (409 "no se puede retirar/mover la fase inicial con tareas"):
  - **borrar** la fase inicial si tiene ≥1 tarea;
  - **reordenar** de forma que la fase inicial actual (con tareas) deje de ser la de `order` mínimo.
  Si la fase inicial no tiene tareas, se puede borrar/mover (la protección es "con tareas", AC-009).
  Borrar una fase con tareas en general (no solo la inicial) — **DECISIÓN §12 D12:** se rechaza
  borrar **cualquier** fase con tareas (409), para no perder tareas por cascade silenciosamente;
  el usuario debe mover/borrar las tareas primero. `19` lista "fase primera con/sin tareas" como
  caso a cuidar; se es conservador.
- **Borrar una tarea que es predecesora de otras (DECISIÓN §12 D15, coherente con D12):** aunque las
  FK de `TaskDependency` son `onDelete: Cascade`, el service **rechaza (409)** borrar una tarea que es
  predecesora de alguna otra, para no romper aristas de dependencia por cascade silencioso (la misma
  clase de "pérdida por cascade" que D12 evita al borrar fases, y la integridad de predecesoras que
  roza `19`). El usuario debe quitar primero esas dependencias (`DELETE .../dependencies/...`, que se
  auditan) y luego borrar la tarea. Borrar una tarea que **no** es predecesora de ninguna otra sí se
  permite: sus aristas como *dependiente* se eliminan por cascade y el `DELETE TASK` se audita (y, si
  se desea, los `DELETE TASK_DEPENDENCY` afectados). Así el borrado nunca deja a otra tarea con una
  predecesora inexistente sin aviso.

### 2.6 Plantilla opcional de fases (NO obligatoria — BR-011/§12 D3)

Para BI existe una plantilla observada de 13 fases (`11` SCR-06). Fase 3 **no** la siembra ni la
asume. Se ofrece como **ayuda opcional del frontend**: un botón "Aplicar plantilla BI (13 fases)"
que, si el usuario lo elige explícitamente, crea esas 13 fases vía los endpoints normales de fase
(`POST .../phases` repetido). La lista de nombres es una **constante del frontend** marcada
provisional (los nombres exactos de `11` SCR-06). **No** aplica a Integraciones/IA (no se ofrece el
botón para esos procesos, o se ofrece neutro sin nombres). No hay datos sembrados ni lógica
server-side de plantilla: el backend solo ve `POST .../phases` normales. Esto respeta BR-011
("no asumir que la plantilla aplica a Integraciones/IA") y `28` (plantillas por proceso `P`).

### 2.7 Ejecución de tareas: transición de estado y gate de predecesoras (BR-009/BL-010/FLOW-003)

Cambiar el estado de una tarea (`PATCH .../tasks/:id/status` con `{ status, progress?, evidenceUrl? }`):
1. Resolver la tarea dentro del alcance (§2.8) → 404.
2. **Permiso de ejecución (DECISIÓN §12 D6):** la acción exige módulo `task` (los 3 roles) **y**
   —para integrante— que sea el **responsable** de la tarea (`responsibleUserId = actor.userId`).
   Jefe/líder dentro del alcance de proceso pueden cambiar el estado de cualquier tarea de su
   proceso (gestión del plan). Un integrante que no es el responsable → **403**. Esto refleja
   SCR-02/SCR-23 ("integrante: ejecución de **sus** tareas") y BR-019/BR-020 sin inventar: el
   responsable ejecuta su tarea; líder/jefe gestionan. (Punto a reabrir si el Site confirma que el
   integrante puede tocar tareas ajenas de su proceso.)
3. **Transición válida:** `PlanStateService.assertTaskTransition(from, to)` (§1.3) → 409 si no
   permitida.
4. **Gate de predecesoras (AC-010/AC-033):** si `to = EN_CURSO` (desde `POR_HACER` o `BLOQUEADA`),
   el service verifica que **todas** las predecesoras directas estén `status=TERMINADA` **y**
   `accepted=true`. Si alguna no cumple → **409** con un mensaje que **nombra la(s) dependencia(s)
   que bloquea(n)** (título + estado + aceptación de cada predecesora incumplida), para que la UI
   lo muestre (SCR-09 "muestra la dependencia que bloquea"). Terminada sin aceptar **no** desbloquea
   (AC-033).
5. **Progreso:** si el DTO trae `progress`, se valida 0–100 y se guarda; además, por defecto, ciertas
   transiciones ajustan el progreso (§12 D9). `evidenceUrl` opcional se guarda como texto.
6. Mutación (`status` [+ `progress`/`evidenceUrl`]) + `AuditEvent UPDATE TASK`
   (`before/after` del estado/progreso) en una `$transaction`.

**Aceptación (separada de terminar, BR-009/AC-033):** `PATCH .../tasks/:id/accept`
(`{ accepted: true/false }`). Fija `accepted`, `acceptedAt`, `acceptedByUserId`. **DECISIÓN §12 D6b:**
aceptar es acción de **gestión del plan** → requiere módulo `plan` (jefe/líder) + alcance; el
responsable integrante **no** se auto-acepta (quien acepta valida el criterio, coherente con "líder
revisa/gestiona"). Precondición: la tarea debe estar `TERMINADA` para poder aceptarse (409 si no).
Aceptar una tarea puede **desbloquear** dependientes (su gate se recalcula en el próximo intento de
`EN_CURSO`; no se cambian estados en cascada automáticamente — se mantiene explícito). `AuditEvent
UPDATE TASK`.

**Horas de bitácora NO actualizan progreso (BR-013, §12 D9):** la Bitácora es FEATURE-006 (fase
posterior) y **no** se implementa aquí. Se documenta que el `progress` de la tarea es un valor
propio de la ejecución del plan y **no** se deriva de horas de bitácora; cuando exista bitácora, sus
horas serán dedicación, no avance (BR-013). En Fase 3 no hay mezcla posible porque no hay bitácora;
solo se deja la frontera conceptual explícita para no cablear nada que la viole después.

### 2.8 Permisos por módulo y alcance de proceso

Reutiliza **exactamente** el mecanismo de Fases 1–2 (`@Roles` + `RolesGuard`; alcance en el `where`
del service; política **403 rol / 404 alcance**). **No** se crea `ProcessScopeGuard` (Fase 1 §8 lo
dejó como gancho futuro); el alcance de un recurso por `:id` se resuelve en el service subiendo
`task→phase→plan→request.mainProcessId` (o `plan→request.mainProcessId`) y comparando con
`actor.scopedProcessIds` (jefe: todos los suyos).

| Operación | Rol requerido (`@Roles`) | Alcance |
|---|---|---|
| Crear/ver/editar plan; CRUD fases; CRUD tareas; dependencias; guía; enviar; autorizar/devolver | `JEFE_AREA, LIDER_PROCESO` (`plan`/`review` para autorizar) | sí: `request.mainProcessId ∈ scopedProcessIds` |
| Cambiar estado de tarea; ver tareas; "mi trabajo" | los 3 roles (`task`/`assigned`) | sí; integrante además debe ser responsable para mutar (§2.7) |
| Aceptar tarea | `JEFE_AREA, LIDER_PROCESO` (`plan`) | sí |

- **Autorizar/devolver el plan** exige capacidad `review` (`MODULE_MATRIX.review = [JEFE_AREA,
  LIDER_PROCESO]`), separada de `plan` para alinear con SCR-20 (la autorización es un acto de
  revisión). **Enviar** el plan exige `plan` (jefe/líder, el líder del proceso prepara y envía).
  **DECISIÓN §12 D8b:** el mismo líder puede enviar y, teniendo `review`, autorizar; el SDD no
  confirma segregación de persona (es `P`), así que no se impone que autorizador ≠ emisor; se
  documenta como punto a reabrir si el Site exige separación de personas.
- **Alcance:** el plan pertenece al `mainProcessId` de su Request. Un líder del proceso A que pide
  el plan de una Request del proceso B → **404** (Plano A, "denegar sin filtrar datos", AC-026/025).
  Rol insuficiente (integrante intentando gestionar plan/fases/tareas de gestión, o aceptar) →
  **403** (BR-020: integrante no gestiona el plan).
- **Listados filtrados por alcance:** `GET` de planes/tareas y la cola de "mi trabajo" filtran en el
  `where` por `scopedProcessIds` (jefe sin filtro). "Mi trabajo" filtra además por
  `responsibleUserId = actor.userId` (SCR-02).

---

## 3. API REST + OpenAPI

### 3.1 Convenciones (heredadas, sin cambios)

Controllers finos con `@UseGuards(CurrentUserGuard, RolesGuard)`; `@Roles(...)` por endpoint;
`@CurrentActor()` inyecta el actor; DTOs `class-validator` con `ValidationPipe` global
(whitelist + forbidNonWhitelisted + transform); **DTOs request y response separados**; `@nestjs/swagger`
en todos los endpoints (`@ApiTags/@ApiOperation/@ApiResponse/@ApiBody/@ApiParam/@ApiQuery`); P2002 →
`ConflictException`; `findFirst` fuera de alcance → `NotFoundException` (404); ningún error de Prisma
se expone. Cada cambio de contrato → `npm run contracts:generate` y committear `openapi.json` +
`packages/api-client/src/generated/*`.

### 3.2 Estructura de módulos NestJS

**DECISIÓN §12 D13 (un módulo raíz `plan/` con submódulos).** Igual que `request/` agrupa
triage/priority/approval, se crea `plan/` con submódulos `phase/`, `task/`, `dependency/`. Razón:
fases, tareas y dependencias **no existen sin su plan** y comparten el invariante de alcance
(`request.mainProcessId`) y las máquinas de estado; un módulo raíz con submódulos mantiene cohesión y
no duplica la resolución de alcance. Importa `PrismaModule`, `AuthModule`, `AuditModule` y
`RequestModule` (para reusar `RequestStateService`, exportado).

```
apps/api/src/modules/plan/
  plan.module.ts            ← agrupa submódulos; imports: Prisma, Auth, Audit, RequestModule
  plan.controller.ts        ← crear/ver/editar plan de una Request; guía; enviar; autorizar/devolver
  plan.service.ts           ← CRUD plan + scope + transiciones de Request (vía RequestStateService)
  plan-status.ts            ← enum PlanStatus + transiciones del plan
  task-status.ts            ← enum TaskStatus + isTaskTransitionAllowed
  plan-state.service.ts     ← PlanStateService: máquinas de tarea y plan; resuelve scope task→plan→request
  plan-guide.service.ts     ← PlanGuideService.compute(planId): pendientes por categoría (§2.1/§2.2)
  dto/ (create/update/response del plan, guide, submit, authorize)
  phase/   (controller, service, dto, spec)  ← CRUD + reorder + protección inicial
  task/    (controller, service, dto, spec)  ← CRUD + estado + aceptación + "mi trabajo"
  dependency/ (controller, service, dto, spec) ← añadir/quitar predecesora + ciclos
```

Se registra `PlanModule` en `app.module.ts` junto a los existentes, sin tocarlos.

**Orden de controllers (hallazgo heredado de Fase 2):** las rutas estáticas se registran **antes**
que las paramétricas que comparten prefijo. En Fase 3 el riesgo está en `GET /tasks/my-work`
(estática) vs `GET /tasks/:id` (paramétrica con `ParseUUIDPipe`): el `TaskController` debe declarar
`my-work` antes de `:id`, o montar "mi trabajo" en una ruta propia `GET /my-work` (ver §3.3). Se
elige **ruta propia `GET /my-work`** para evitar la colisión por diseño (no comparte prefijo con
`:id`), y se añade un test de módulo que fija el contrato, como `request.module.spec.ts`.

### 3.3 Endpoints

Todos pasan por `CurrentUserGuard`. Alcance por `request.mainProcessId` en el service.

**Plan** (`requests/:requestId/plan` + acciones) — rol `plan` (jefe/líder); autorizar/devolver `review`
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| POST | `/requests/:requestId/plan` | jefe/líder (`plan`) | crea el plan (solo si Request `COMPROMETIDA` y sin plan previo); `COMPROMETIDA → EN_PLANIFICACION`; audita |
| GET | `/requests/:requestId/plan` | jefe/líder | devuelve el plan con fases/tareas (o 404 si no existe/fuera de alcance) |
| PATCH | `/requests/:requestId/plan` | jefe/líder | edita periodo/fechas/compromiso/riesgos/mitigaciones (no `status`); audita |
| GET | `/requests/:requestId/plan/guide` | jefe/líder | guía de pendientes (§2.1): `canSubmit` + `pendings` + `futureCategories` |
| POST | `/requests/:requestId/plan/submit` | jefe/líder (`plan`) | enviar: recomputa guía; si pendientes → 409; si no → `BORRADOR/DEVUELTO → EN_AUTORIZACION`; audita |
| POST | `/requests/:requestId/plan/authorize` | jefe/líder (`review`) | autorizar: `EN_AUTORIZACION → AUTORIZADO`; Request `EN_PLANIFICACION → EN_EJECUCION`; audita (UPDATE PLAN + UPDATE REQUEST) |
| POST | `/requests/:requestId/plan/return` | jefe/líder (`review`) | devolver con `reason` (req.→400 si falta); `EN_AUTORIZACION → DEVUELTO`; audita |

**Fases** (`plans/:planId/phases`) — rol `plan`
| Método | Ruta | Notas |
|---|---|---|
| GET | `/plans/:planId/phases` | lista fases ordenadas por `order` |
| POST | `/plans/:planId/phases` | crea fase (nombre req.); `order` al final; audita CREATE |
| PATCH | `/plans/:planId/phases/:phaseId` | edita nombre/fechas/entregable; audita UPDATE |
| PATCH | `/plans/:planId/phases/reorder` | reordena (lista de ids); protege fase inicial con tareas (409); audita |
| DELETE | `/plans/:planId/phases/:phaseId` | borra; 409 si tiene tareas (§2.5/§12 D12); audita DELETE |

**Tareas** (`phases/:phaseId/tasks` + `/tasks/:id` + `/my-work`) — crear/editar `plan`; estado `task`
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/plans/:planId/tasks` | los 3 (`task`) | lista tareas del plan; filtros `status?`, `phaseId?`, `mine?`, `q?` (búsqueda) |
| POST | `/phases/:phaseId/tasks` | jefe/líder (`plan`) | crea tarea (título req.; regla hito); audita CREATE |
| GET | `/tasks/:id` | los 3 (`task`) | detalle con predecesoras y su estado/aceptación |
| PATCH | `/tasks/:id` | jefe/líder (`plan`) | edita campos de la tarea (no estado/aceptación); regla hito; audita UPDATE |
| DELETE | `/tasks/:id` | jefe/líder (`plan`) | borra tarea; **409 si es predecesora de otra** (§2.5/§12 D15); si no, cascade de sus dependencias como dependiente; audita DELETE |
| PATCH | `/tasks/:id/status` | los 3 (`task`) | cambia estado (gate predecesoras + transición válida + permiso §2.7); progreso/evidencia opc.; audita |
| PATCH | `/tasks/:id/accept` | jefe/líder (`plan`) | acepta/retira aceptación (precondición TERMINADA); audita |
| GET | `/my-work` | los 3 (`assigned`) | tareas donde `responsibleUserId = actor` dentro de alcance, con contexto de plan (SCR-02) |

**Dependencias** (`tasks/:id/dependencies`) — rol `plan`
| Método | Ruta | Notas |
|---|---|---|
| GET | `/tasks/:id/dependencies` | lista predecesoras de la tarea (con estado/aceptación) |
| POST | `/tasks/:id/dependencies` | añade predecesora `{ predecessorTaskId }`; valida auto/mismo-plan/ciclo/duplicado (§2.3); audita CREATE |
| DELETE | `/tasks/:id/dependencies/:predecessorTaskId` | quita predecesora; audita DELETE |

No se expone endpoint para editar `operationalState` de la Request ni `status` del plan/tarea
directamente (solo las acciones de arriba los cambian, vía helpers).

### 3.4 DTOs (validación por entrada externa)

Toda entrada externa se valida con DTO (requerido/opcional, tipo, límites, fallo → 400):

- **CreatePlanDto:** todos opcionales — `periodStart?`/`periodEnd?`/`commitmentDate?`
  `@IsDateString`; `risks?`/`mitigations?` string `MaxLength`. (El plan puede nacer vacío; la guía
  exige el contenido para enviar.) El service exige que la Request esté `COMPROMETIDA` y sin plan
  (409 si ya existe / estado inválido).
- **UpdatePlanDto:** mismos campos de `CreatePlanDto`; **no** incluye `status`, `submitted*`,
  `authorized*` (los fija el flujo).
- **CreatePhaseDto:** `name` string req. trim `MaxLength(255)`; `startDate?`/`endDate?`
  `@IsDateString`; `deliverable?` string; `order?` int `Min(0)` (si falta, al final).
- **UpdatePhaseDto:** `name?`/`startDate?`/`endDate?`/`deliverable?`.
- **ReorderPhasesDto:** `phaseIds` array `@IsUUID('all',{each:true})` **requerido**, no vacío (debe
  contener exactamente los ids de las fases del plan; el service valida que el conjunto coincida →
  400 si falta/sobra alguno).
- **CreateTaskDto:** `title` string req. `MaxLength(255)`; `responsibleUserId?` `@IsUUID`;
  `processId?` `@IsUUID`; `startDate?`/`endDate?` `@IsDateString`; `estimateHours?` int `Min(0)`;
  `isMilestone?` bool (default false); `description?`/`acceptanceCriteria?` string;
  `frameworkPhaseRequired?` string; `evidenceUrl?` string `MaxLength(2048)`. Reglas cruzadas (hito,
  responsable/process existentes y en alcance) en el service → 400/404.
- **UpdateTaskDto:** mismos campos de ficha **excepto** `status`, `progress`, `accepted*`
  (se cambian por acciones propias). `isMilestone` editable (dispara regla hito).
- **UpdateTaskStatusDto:** `status` `@IsEnum(TaskStatus)` req.; `progress?` int `@Min(0)@Max(100)`;
  `evidenceUrl?` string `MaxLength(2048)`.
- **AcceptTaskDto:** `accepted` bool req.
- **AddDependencyDto:** `predecessorTaskId` `@IsUUID` req.
- **SubmitPlanDto / AuthorizePlanDto:** sin cuerpo (o vacío). **ReturnPlanDto:** `reason?` string;
  requerido-si-devolver validado en el service → **400** si falta (patrón `ApprovalService`).
- **List DTOs:** `ListPlanTasksDto` (`status?` `@IsEnum(TaskStatus)`, `phaseId?` `@IsUUID`,
  `mine?` `@IsBooleanString`, `q?` string), todos `@IsOptional`.
- **Response DTOs** separados, todos con `@ApiProperty` (fechas `date-time`):
  `PlanResponseDto` (incluye `status`, `submittedAt/By`, `authorizedAt/By`, `returnReason`, y
  opcionalmente `phases` embebidas), `PlanPhaseResponseDto`, `TaskResponseDto` (incluye `status`,
  `progress`, `accepted`, `isMilestone`, `predecessors: {id,title,status,accepted}[]`),
  `TaskDependencyResponseDto`, `PlanGuideDto` (§2.1), `MyWorkItemDto` (tarea + `planId` +
  `requestId` + `requestTitle` + `phaseName`).

### 3.5 Códigos de estado y manejo de errores

Cada operación que puede fallar, su condición, recuperable/fatal, qué recibe el caller y si se
loguea (patrón Fase 1 §4.4 / Fase 2 §3.5; ningún detalle Prisma se expone):

| Situación | Código | Recuperable | Log |
|---|---|---|---|
| Lectura / PATCH ok | 200 | — | no |
| POST ok (plan/fase/tarea/dependencia) | 201 | — | no |
| Acción ok (submit/authorize/return/status/accept/reorder) | 200 | — | no |
| Validación DTO (título vacío, estado inválido, progreso fuera de 0–100, fecha mal formada) | 400 | sí | no |
| Hito con horas>0 o dos fechas distintas | 400 | sí | no |
| Auto-dependencia / dependencia entre planes distintos | 400 | sí | no |
| **Dependencia circular** (crearía ciclo) | 400 | sí | no |
| `return` sin `reason` | 400 | sí | no |
| responsable/process/predecesora referida inexistente o inactiva | 400/404 | sí | no |
| Sin actor / usuario inválido | 401 | sí | warn (dev) |
| Rol insuficiente (integrante gestiona plan/fase/tarea; integrante no responsable muta tarea; sin `review` autoriza) | 403 | sí | no (esperado) |
| Plan/fase/tarea inexistente o fuera de alcance | 404 | sí | no (AC-025/026) |
| Crear plan sobre Request ≠ `COMPROMETIDA` o con plan ya existente | 409 | sí | no |
| **Enviar con guía con pendientes** (AC-007) | 409 (enumera pendientes) | sí | no |
| Transición de plan/tarea no permitida; autorizar/devolver fuera de `EN_AUTORIZACION`; aceptar tarea no `TERMINADA` | 409 | sí | no |
| **Gate de predecesoras** (dependiente a `EN_CURSO` con predecesora no TERMINADA+aceptada) | 409 (nombra la dependencia) | sí | no (AC-010/033) |
| Borrar fase con tareas / mover fase inicial con tareas | 409 | sí | no (AC-009) |
| Borrar tarea que es predecesora de otra (§12 D15) | 409 | sí | no |
| Dependencia duplicada | 409 | sí | no |
| Fallo al escribir AuditEvent dentro de la tx | 500 | fatal (rollback total) | error |
| Error Prisma no previsto / BD caída | 500 genérico sin stack | fatal | error |

- **Gate vs permiso:** gate no cumplido = **409** ("precondición de fase"); permiso = **403** (rol) /
  **404** (alcance). Esta separación evita confundir "no puedes aún" con "no puedes nunca" (UI-04).
- **Atomicidad:** cada acción (crear/editar/estado/aceptar/enviar/autorizar/devolver/reordenar) hace
  mutación + (cambio de estado) + `AuditEvent` en **una** `$transaction`; si algo falla, rollback
  total (invariante §1.6, igual que Fases 1–2).

### 3.6 Regeneración de contrato

Tras definir endpoints/DTOs: `npm run contracts:generate` (ya existe), committear
`apps/api/openapi/openapi.json` y `packages/api-client/src/generated/*`. El frontend consume solo vía
`@plantilla-portales/api-client` (`apps/web/src/lib/api-client.ts`), que inyecta `X-Actor-Id` por
middleware (Fase 1) — **sin cambios** en ese mecanismo.

---

## 4. Frontend (apps/web, solo vía api-client)

Convierte los **placeholders existentes** en pantallas reales, manteniendo Fases 1–2 operativas. Las
rutas ya existen en `src/lib/navigation.ts` (`/seguimiento/plan` → `plan`, `/seguimiento/tareas` →
`task`, `/mi-trabajo` → `assigned`, `/administracion/revision` → `review`) y como páginas
`UnderConstruction`; se reemplaza su contenido por vistas funcionales (patrón
`catalogs-view.tsx`/`requests`). Nuevos wrappers tipados en `src/lib/`: `plan.ts`, `plan-phases.ts`,
`tasks.ts`, `task-dependencies.ts`, `my-work.ts` (patrón `requests.ts`: clase `*Error`,
`messageForStatus` que traduce 400/403/404/409 a mensajes legibles, sin exponer JSON/Prisma).

### 4.1 Pantallas

- **SCR-06 Planificación (`/seguimiento/plan`):**
  - **Selector solicitud/plan:** lista de Requests `COMPROMETIDA`/`EN_PLANIFICACION`/`EN_EJECUCION`
    en alcance (vía `GET /requests?state=...` ya existente). Al elegir una, carga/crea su plan
    (`GET`/`POST /requests/:id/plan`).
  - **Gestión de fases:** crear/editar/reordenar (arriba/abajo), con la **fase inicial protegida**
    (deshabilitar borrar/mover si tiene tareas, mostrando la precondición — AC-009/UI-04).
  - **Crear/editar tareas:** título, fase, responsable (Select de usuarios en alcance), fechas,
    estimación, **hito** (al marcarlo, la UI fuerza una sola fecha y 0 horas — AC-011), criterios de
    aceptación, descripción, predecesoras (multi-select de tareas del mismo plan; la UI evita ofrecer
    la propia tarea; el ciclo se valida server-side y el error 400 se muestra).
  - **Vista Lista de tareas** (mínima requerida): columnas tarea, responsable, inicio, vencimiento,
    esfuerzo, predecesoras, estado/progreso; con **búsqueda** (`q`), **solo mis tareas** (`mine`) y
    **filtros por estado/fase**. Las vistas **Tablero/Cronograma/Carga/Plan-aprobado** se **difieren**
    (DECISIÓN §12 D14): se muestra la Lista como vista principal y las otras como pestañas
    "disponibles en una fase posterior" (Carga depende de Capacidad = FEATURE-005; Plan-aprobado es
    una vista de solo lectura cuando `status=AUTORIZADO`, que sí se puede ofrecer mínima: lista en
    modo lectura). Se documenta por qué se difieren (no inventar métricas/cronograma `P`).
  - **Guía "Resuelve el siguiente paso":** consume `GET .../plan/guide`; enumera `pendings` por
    categoría; las `futureCategories` (capacidad/evidencias/framework) se muestran con nota "se
    evaluarán en una fase posterior". El **botón Enviar** se deshabilita mientras `canSubmit=false`
    (AC-007); al enviar, si el backend devuelve 409, se muestran los pendientes.
  - **Gancho Excel (si se muestra):** texto explícito "Importar Excel no aprueba controles" (BR-008);
    en Fase 3 **no** hay botón de importación funcional (§2.2/§12 D11).
- **SCR-09 Tareas del plan (`/seguimiento/tareas`):** detalle/edición de una tarea; **cambio de
  estado** respetando dependencias — la UI muestra la **dependencia que bloquea** cuando el backend
  devuelve 409 en `EN_CURSO` (AC-010); criterios de aceptación, progreso, evidencia (URL/texto). Los
  controles de estado reflejan las transiciones permitidas (§1.3). La aceptación aparece solo para
  jefe/líder (acción separada).
- **SCR-02 Mi trabajo (`/mi-trabajo`):** tareas asignadas al usuario actual (`GET /my-work`) con
  contexto de plan (Request, fase, estado/progreso); enlace a la tarea en SCR-09.
- **Autorización del plan (jefe/líder, `/administracion/revision` ya existente):** la cola de
  revisión de Fase 2 (aprobaciones de compromiso) se **amplía** con una sección/pestaña de **planes
  en `EN_AUTORIZACION`** dentro del alcance; cada uno con acciones **Autorizar** y **Devolver**
  (motivo requerido; si falta → 400, el formulario conserva valores). Separada del envío
  (SCR-20/BR-006 análogo). Un usuario sin `review` no ve la sección y, si fuerza la llamada, recibe
  403.

### 4.2 Estados UI y accesibilidad (obligatorios)

Toda vista con datos implementa **loading / vacío / error / éxito** (UI-02/06, AC-030), patrón
`catalogs-view.tsx`: `Skeleton` en carga, bloque de error con "Reintentar", estado vacío con acción
de crear si el rol lo permite, `toast` (sonner) en éxito/error. **Fases bloqueadas / precondiciones**
se muestran como **candado con explicación** (UI-04), no como error: p. ej. "Esta tarea no puede
iniciar hasta terminar y aceptar: <predecesora>", "No puedes retirar la fase inicial con tareas",
"Faltan pendientes para enviar: …".

**AC-031 (conservar la entrada ante error):** en todos los formularios (plan, fase, tarea, estado,
devolución) el `reset` solo ocurre en el camino de **éxito** (200/201). Ante fallo
(400/403/404/409/500) el formulario **no se limpia ni se cierra**: conserva valores, mantiene el foco
accesible y muestra el error (toast + mensaje en línea cuando aplica).

**Accesibilidad:** HTML semántico, `<Label htmlFor>` en cada control, `aria-live` en regiones de
carga, `aria-current` en navegación activa, estados de foco de shadcn. (La validación plena con
tecnología asistiva requiere pruebas manuales con lectores de pantalla y revisión experta; no se
afirma conformidad WCAG completa.)

### 4.3 Mantener Fases 1–2

El sidebar, el selector de usuario dev, `/catalogs`, `/catalog-items`, `/gobierno/*`,
`/administracion/maestras` y las pantallas de demanda (solicitudes/triage/priorización/revisión de
compromiso) siguen operativas sin cambios. El `moduleKey` de cada pantalla ya coincide con
`MODULE_MATRIX`; el gating de menú es cosmético y el control real es server-side (§2.8). La ampliación
de `/administracion/revision` con planes **no** rompe la cola de aprobaciones de Fase 2 (se añade una
sección, no se reemplaza).

---

## 5. AuditEvent: forma e invariante en Fase 3

**Invariante:** ninguna mutación de dominio de Fase 3 sin su `AuditEvent`, dentro de la misma
`$transaction`. **Dueño:** la capa de service (único con Prisma y actor), igual que Fases 1–2.

Forma de los nuevos `AuditEvent`:

| Mutación | action | objectType | objectId | scopeProcessId | before / after |
|---|---|---|---|---|---|
| crear plan | CREATE | PLAN | plan.id | request.mainProcessId | null / snapshot plan |
| editar plan | UPDATE | PLAN | plan.id | request.mainProcessId | snapshot antes / después |
| enviar plan | UPDATE | PLAN | plan.id | request.mainProcessId | `{status}` antes / después |
| autorizar plan | UPDATE | PLAN + UPDATE REQUEST | plan.id / request.id | request.mainProcessId | `{status}` y `{operationalState}` antes/después |
| devolver plan | UPDATE | PLAN | plan.id | request.mainProcessId | `{status,returnReason}` antes/después |
| crear plan (transición Request) | UPDATE | REQUEST | request.id | request.mainProcessId | `{operationalState}` antes/después |
| crear/editar/borrar fase | CREATE/UPDATE/DELETE | PLAN_PHASE | phase.id | request.mainProcessId | snapshots |
| reordenar fases | UPDATE | PLAN | plan.id | request.mainProcessId | `{order[]}` antes/después |
| crear/editar/borrar tarea | CREATE/UPDATE/DELETE | TASK | task.id | request.mainProcessId | snapshots |
| cambiar estado/aceptar tarea | UPDATE | TASK | task.id | request.mainProcessId | `{status,progress,accepted}` antes/después |
| añadir/quitar predecesora | CREATE/DELETE | TASK_DEPENDENCY | dependency.id | request.mainProcessId | snapshot arista |

Como `scopeProcessId = request.mainProcessId`, la **auditoría de Fase 3 queda visible** para
líder/jefe del proceso según el `findMany` ya existente de `AuditService` (filtra
`scopeProcessId ∈ scopedProcessIds`): un líder del proceso A ve los eventos de planes/tareas de
Requests con `mainProcessId = A` y no los de B (consistente con AC-025/026).

---

## 6. Testabilidad (estrategia por capa)

**Unit (Jest, `apps/api`)** — prioridad: máquinas de estado, gates, ciclos, permisos, auditoría
(patrón `*.service.spec.ts` con `PrismaService` mockeado):
- `task-status`/`isTaskTransitionAllowed`: cada arista permitida y una muestra de prohibidas
  (`POR_HACER→TERMINADA` → 409).
- `plan-status`/`assertPlanTransition`: `BORRADOR→EN_AUTORIZACION`, `EN_AUTORIZACION→AUTORIZADO`
  (+ Request `EN_PLANIFICACION→EN_EJECUCION`), `EN_AUTORIZACION→DEVUELTO`, `DEVUELTO→EN_AUTORIZACION`;
  transiciones no implementadas no se disparan.
- `RequestStateService.assertTransition`: las dos nuevas aristas (`COMPROMETIDA→EN_PLANIFICACION`,
  `EN_PLANIFICACION→EN_EJECUCION`) se aceptan; crear plan sobre Request ≠ `COMPROMETIDA` → 409.
- **Guía de pendientes (AC-007):** plan sin fases/tareas → pendientes; fase sin fechas, tarea sin
  responsable/fechas → pendientes con mensaje y `targetId`; `canSubmit=false`; `submit()` → 409
  enumerando; con todo completo → `canSubmit=true` y `submit()` → `EN_AUTORIZACION`. Categorías
  futuras no aportan pendientes (siempre 0), de modo que un plan con un `frameworkPhaseRequired`
  informado y sin evidencia **sí** puede enviarse en Fase 3 (rama de "control pendiente" de AC-007
  diferida, no verificada — §7/§9).
- **Dependencias y ciclos (AC-010/033, `19`):** auto-dependencia → 400; cruzar planes → 400;
  duplicado → 409; **ciclo** (A→B existente, intentar B→A) → 400 nombrando las tareas; cadena
  transitiva (A→B→C, intentar C→A) → 400.
- **Gate de predecesoras (AC-010/033):** `POR_HACER→EN_CURSO` con predecesora `TERMINADA` pero
  `accepted=false` → 409 con la dependencia nombrada; con predecesora `TERMINADA`+`accepted=true` →
  200; sin predecesoras → 200.
- **Regla hito (BR-010/AC-011):** crear/editar hito con horas>0 → 400; con dos fechas distintas →
  400; hito válido (una fecha, 0 horas) → 201/200.
- **Fase inicial protegida (AC-009):** borrar/mover fase inicial con tareas → 409; sin tareas →
  permitido; borrar cualquier fase con tareas → 409 (§12 D12).
- **Borrado de tarea predecesora (§12 D15):** borrar una tarea que es predecesora de otra → 409;
  tras quitar sus dependencias (o si no es predecesora de ninguna) → permitido y auditado.
- **Autorización (§12 D8):** `authorize` fuera de `EN_AUTORIZACION` → 409; `return` sin `reason` →
  400; autorizar sin `review` → 403; autorizar lleva Request a `EN_EJECUCION`.
- **Permisos/alcance:** integrante gestiona plan/fase/tarea o acepta → 403; integrante muta estado de
  tarea ajena → 403, de la propia → 200; plan/tarea de otro proceso → 404 (`where` por
  `mainProcessId`).
- **Auditoría:** cada mutación invoca `AuditService.record` con el `objectType` correcto
  (PLAN/PLAN_PHASE/TASK/TASK_DEPENDENCY), `scopeProcessId = mainProcessId` y before/after; autorizar
  genera UPDATE PLAN + UPDATE REQUEST.
- **Acceso Prisma (precaución Prisma 7):** test que fija que el service resuelve el plan por
  `findFirst({where:{requestId}})` (no `findUnique`) y que `TaskDependency` sí usa `findUnique` por la
  clave compuesta.
- **"Mi trabajo":** filtra por `responsibleUserId = actor` y alcance.

**E2E (Playwright, `/e2e`)** — flujo FLOW-002/003 y controles negativos:
- UC-004/US-005: desde una Request `COMPROMETIDA`, crear plan → `EN_PLANIFICACION`; crear fases y
  tareas; ver guía con pendientes; completar; **Enviar deshabilitado** mientras hay pendientes
  (AC-007); con cero pendientes, enviar → `EN_AUTORIZACION`. **Alcance del E2E de AC-007:** solo
  afirma las dos categorías implementadas (*fechas/fases* y *tareas/responsables*); la rama "control
  pendiente" de AC-007 **no** se prueba en Fase 3 (categoría `frameworkControls` diferida, §2.2/§12
  D5/§7) — se verificará al construir Frameworks (FEATURE-008).
- Autorización: jefe/líder con `review` autoriza → Request `EN_EJECUCION`; devolver con motivo →
  vuelve a edición; devolver sin motivo → error (400), formulario conserva valores (AC-031).
- UC-005/006/US-006/FLOW-003: responsable inicia tarea; dependiente **bloqueada** hasta que la
  predecesora esté terminada **y** aceptada, mostrando la dependencia que bloquea (AC-010/033); hito
  con una fecha y 0 horas (AC-011); fase inicial protegida (AC-009).
- Controles negativos: integrante intenta gestionar el plan → 403; líder A abre plan de proceso B →
  404 (AC-025/026); dependencia circular rechazada con explicación.
- AC-030: listado de tareas vacío → estado vacío con acción de crear si el rol permite.
- AC-028: cada mutación aparece en auditoría (reusa la vista de Fase 1).
- Fases 1–2 siguen operativas (`/catalogs`, demanda, revisión de compromiso).

Verificación de cierre (steering): `npm run typecheck`, `npm run build`, `npm run test:unit`,
`npm run test:e2e` pasan; `npm run contracts:generate` con artefactos committeados; migración
`fase3_plan` aplicada; Fases 1–2 y `/catalogs`/`/catalog-items` intactas.

---

## 7. Fuera de alcance (explícito)

Respetando `specs/28` (todo lo marcado `P`) y el brief:

- **Importación/exportación de Excel** (BR-008/AC-008/024/034; `28`): solo gancho documentado
  (§2.2/§12 D11); sin endpoint ni botón funcional.
- **Capacidad / carga** (FEATURE-005, SCR-17, BR-012): categoría gancho de la guía (§2.2/§12 D5); sin
  cálculo. La vista "Carga y revisión" de SCR-06 se difiere (§12 D14).
- **Bitácora / registro diario-semanal** (FEATURE-006, SCR-10/11, BR-013/015): no se implementa; solo
  se deja explícita la frontera "horas de bitácora ≠ progreso" (§12 D9).
- **Activos y documentos** (FEATURE-007, SCR-15/16): la evidencia de tarea es un **campo URL/texto**,
  no un módulo de documentos (§12 D10).
- **Frameworks / controles / gates GA** (FEATURE-008, SCR-19, BR-016; matriz `P` en `28`): categoría
  gancho de la guía (§2.2); `frameworkPhaseRequired` es solo texto; sin matriz ni evaluación.
  **Consecuencia sobre AC-007:** como `frameworkControls` (y `capacity`/`evidenceGates`) no aportan
  pendientes en Fase 3, la **rama "control pendiente" de AC-007 (`18`) queda explícitamente diferida**
  y NO se verifica en Fase 3; se afirma paridad de AC-007 **solo** para las categorías *fechas/fases*
  y *tareas/responsables* (ver §9 y §6). Inventar la lógica de controles para calcular ese pendiente
  sería afirmar reglas `P` (`28` p.7; BR-016/AC-008/AC-024), por lo que se difiere deliberadamente.
- **Vistas Tablero / Cronograma / Carga** de SCR-06 (métricas/cronograma `P`): diferidas (§12 D14);
  Lista es la vista principal; Plan-aprobado = Lista en modo lectura cuando `status=AUTORIZADO`.
- **13 fases de BI como obligatorias** (BR-011): solo plantilla **opcional** de ayuda (§2.6); no
  sembrada ni asumida para Integraciones/IA.
- **Fórmula exacta de progreso ponderado por esfuerzo** (SCR-06 `P`): se adopta una decisión simple
  (§12 D9); no se afirma la del Site.
- **Estados exactos de revisión/devolución/autorización del plan** (`06` "no determinados"): mínimo
  implementado (`BORRADOR/EN_AUTORIZACION/AUTORIZADO/DEVUELTO`, §12 D8); doble decisión, reenvío con
  motivos múltiples, segregación emisor≠autorizador → `P`, documentados a reabrir.
- **Transiciones terminales de la Request** (`EN_EJECUCION → EN_VALIDACION/…`, retiro, reapertura;
  `06` `P`): modeladas en el enum, **no** implementadas.
- **Versiones de plan / múltiples planes por Request** (§12 D1): 1:1 en Fase 3; punto a reabrir.
- **Segregación de quién puede cerrar/reabrir/eliminar** (`05` "no por intuición"): aceptar/estado
  siguen la política mínima §2.7/§12 D6; cierre no se implementa.

---

## 8. Resumen de archivos a crear/modificar

**apps/api**
- `prisma/schema.prisma` — + `Plan`, `PlanPhase`, `Task`, `TaskDependency`; relaciones inversas en
  `Request`/`Process`/`User`.
- `prisma/migrations/<ts>_fase3_plan/migration.sql` — vía `prisma migrate dev`.
- `src/modules/request/request-state.ts` — + 2 aristas en `IMPLEMENTED_TRANSITIONS`
  (`COMPROMETIDA→EN_PLANIFICACION`, `EN_PLANIFICACION→EN_EJECUCION`).
- `src/modules/audit/audit.service.ts` — + `PLAN|PLAN_PHASE|TASK|TASK_DEPENDENCY` en `AuditObjectType`.
- `src/modules/plan/` — módulo raíz + submódulos `phase/`, `task/`, `dependency/`:
  `plan.module.ts`, `plan.controller.ts`, `plan.service.ts`, `plan-status.ts`, `task-status.ts`,
  `plan-state.service.ts`, `plan-guide.service.ts`, DTOs, specs; `plan.module.spec.ts` (orden de
  controllers / ruta `/my-work`).
- `src/app.module.ts` — registrar `PlanModule`.

**packages/api-client** — regenerado con `npm run contracts:generate` (committear artefactos).

**apps/web**
- `src/app/seguimiento/plan/page.tsx` — SCR-06 (fases, tareas, dependencias, guía, enviar).
- `src/app/seguimiento/tareas/page.tsx` — SCR-09 (detalle/estado/aceptación/evidencia).
- `src/app/mi-trabajo/page.tsx` — SCR-02 (mis tareas).
- `src/app/administracion/revision/page.tsx` — ampliar con autorización de planes (sin romper la cola
  de compromiso de Fase 2).
- `src/lib/plan.ts`, `plan-phases.ts`, `tasks.ts`, `task-dependencies.ts`, `my-work.ts` — wrappers
  tipados (patrón `requests.ts`).
- componentes shadcn ya presentes; añadir solo los que falten.

Verificación de cierre (steering): `npm run typecheck`, `npm run build`, `npm run test:unit`,
`npm run test:e2e` pasan; `npm run contracts:generate` con artefactos committeados; Fases 1–2,
`/catalogs` y `/catalog-items` siguen operativas.

---

## 9. Trazabilidad de criterios de aceptación

| AC | Cómo se cubre |
|---|---|
| AC-007 (parcial) | **Cubierto para las categorías *fechas/fases* y *tareas/responsables* (implementadas):** guía server-side por categoría; `submit()` recomputa y rechaza con 409 si hay pendientes; botón deshabilitado en UI (§2.1/§3.3/§4.1). Las categorías *capacidad*, *evidencias/puertas* y *controles de framework* **existen en el contrato** (`futureCategories`) **pero NO aportan pendientes en Fase 3** (ganchos, §2.2/§12 D5): su contenido es `P` (`28` p.7; matriz de controles no inventable, BR-016/AC-008/AC-024) y se encenderán en FEATURE-005 (Capacidad) / FEATURE-008 (Frameworks). Por tanto la **rama "control pendiente" del escenario de AC-007 (`18`) queda EXPLÍCITAMENTE DIFERIDA, no verificada en Fase 3**: un plan con un control de framework pendiente sí pasa el gate de envío en Fase 3 por diseño (diferir, no inventar). Cuando se construya Frameworks, `PlanGuideService` sumará esos pendientes sin cambiar el contrato ni el mecanismo |
| AC-008 / AC-024 | Importar Excel no se implementa; gancho documentado que nunca aprueba controles (§2.2/§12 D11) |
| AC-009 | Fase inicial = `order` mínimo; no borrar/mover con tareas → 409 (§2.5/§12 D4) |
| AC-010 | Gate de predecesoras al pasar a `EN_CURSO`: 409 nombrando la dependencia (§2.7) |
| AC-011 | Regla hito: una fecha, 0 horas → 400 si no (§2.4) |
| AC-033 | "Terminada **y** aceptada": `accepted` separado de `TERMINADA`; dependiente no desbloquea sin aceptación (§1.2/§2.7) |
| AC-025/026 | 403 por rol, 404 por alcance (`mainProcessId`) (§2.8/§3.5) |
| AC-028 | Toda mutación → `AuditEvent` en la misma tx (§1.6/§5) |
| AC-030 | Estados vacíos con acción si el rol permite (§4.2) |
| AC-031 | Formularios conservan valores ante error; reset solo en éxito (§4.2) |

---

## 10. Mapa de casos borde (`specs/19`) → tratamiento

| Caso borde | Tratamiento Fase 3 |
|---|---|
| Dependencia circular | Detección server-side antes de crear la arista → 400 (§2.3) |
| Tarea completa pero no aceptada | `TERMINADA` sin `accepted`; dependiente sigue bloqueada (§2.7) |
| Hito con >1 fecha o esfuerzo ≠ 0 | 400 (§2.4) |
| Fechas invertidas (fase/tarea) | `startDate > endDate` = pendiente de guía (no envía) / 400 en validación de hito; (§2.1) |
| Fase primera con/sin tareas | Protegida solo con tareas (§2.5) |
| Responsable sin acceso | Se permite asignar (el responsable puede no tener grant aún); su ejecución la gobierna el permiso §2.7. Punto a reabrir si el Site exige grant del responsable |
| Secuencia de fases alterada | Reordenamiento transaccional; protección de inicial (§2.5) |
| Borrar tarea que rompe predecesoras de otras | Rechazado (409); quitar dependencias primero (§2.5/§12 D15) |
| Actor pierde permiso en medio del flujo | Cada operación revalida rol+alcance server-side (§2.8); no hay sesión persistente |
| Listado vacío / error / doble envío | Estados UI (§4.2); doble crear plan → 409 (plan único) |
| Capacidad/sobrecarga | Fase futura; categoría gancho (§2.2) |

> Estos casos se **registran** y se tratan con la opción mínima documentada; los marcados `P` en el
> SDD no se completan por intuición (`19`/`28`).

---

## 11. Casos de uso / historias cubiertos

- **UC-004 (planificar):** crear plan desde `COMPROMETIDA`, fases/tareas/dependencias, guía y envío.
- **UC-005 (autorizar plan):** autorizar/devolver separado del envío → `EN_EJECUCION`.
- **UC-006 (ejecutar tareas):** cambio de estado con gate de predecesoras y hito.
- **US-005 (líder planifica y envía):** SCR-06 + guía + envío.
- **US-006 (responsable ejecuta su tarea):** SCR-09/SCR-02 + gate de dependencias.
- **FLOW-002 (planificación):** `COMPROMETIDA → EN_PLANIFICACION → EN_EJECUCION`.
- **FLOW-003 (ejecución):** máquina de estados de tarea + predecesoras.
- **FEATURE-004 (Plan y ejecución):** SCR-06/09, FNC-008–011, BR-007–011.

---

## 12. DECISIONES de diseño (todo lo marcado `P`)

Cada decisión adopta la opción **mínima, documentada y reversible**; **ninguna** se presenta como
hecho del Site.

| # | Tema (marca SDD) | Decisión | Punto a reabrir |
|---|---|---|---|
| D1 | Cardinalidad Plan↔Request (brief "1:1 o 1:N") | **1:1** con `request_id` único; se consulta con `findFirst` por robustez ante `findUnique` sobre `@@unique` de un solo campo en Prisma 7 (precaución, no verificada; §1.1), correcto en ambos casos. Histórico de decisiones en AuditEvent | Si el Site confirma versiones → introducir `PlanVersion` |
| D3 | 13 fases de BI (BR-011 `P`) | **No** se siembran ni asumen; plantilla **opcional** de ayuda en frontend, provisional; no aplica a Integraciones/IA | Confirmar plantillas por proceso |
| D4 | Fase inicial protegida (AC-009) | Inicial = `order` mínimo (derivado, sin flag); no borrar/mover **con tareas** → 409 | — |
| D5 | Categorías de la guía (BR-007; capacidad/evidencias/framework `P`) | Mínimo verificable = fases con fechas + tareas con responsable y fechas + ≥1 tarea. Las 3 categorías futuras existen en el contrato pero no aportan pendientes (ganchos) | Encender categorías al construir Capacidad/Frameworks |
| D6 | Quién ejecuta/acepta tareas (`05` "no por intuición"; BR-019/20) | Cambiar estado: `task` (3 roles); integrante solo su tarea. **Aceptar**: `plan` (jefe/líder), tarea `TERMINADA` | Confirmar si integrante toca tareas ajenas de su proceso |
| D7 | Transiciones de tarea (`06` `P`) | Máquina de 5 estados con las aristas de §1.3 (incluye reabrir `TERMINADA→EN_CURSO`) | Ajustar aristas cuando el Site las confirme |
| D8 | Estados/flujo de autorización del plan (`06` "no determinados") | `BORRADOR/EN_AUTORIZACION/AUTORIZADO/DEVUELTO`; enviar≠autorizar; devolver con motivo | Doble decisión, reenvío, nombres exactos |
| D8b | Segregación emisor≠autorizador (`P`) | No se impone; el mismo líder con `review` puede enviar y autorizar | Imponer separación si el Site lo exige |
| D9 | Fórmula de progreso (SCR-06 "ponderado por esfuerzo", `P`; BR-013) | `progress` es un **entero 0–100 propio** de la tarea, editable en el cambio de estado; por defecto `POR_HACER=0`, `EN_REVISION/TERMINADA` sugiere 100 (editable); **no** se deriva de horas de bitácora (BR-013). No se implementa el ponderado por esfuerzo del plan (sería afirmar la fórmula `P`); si se requiere un % de plan, se computa como promedio simple de `progress` de tareas en la UI, marcado provisional | Fórmula exacta ponderada por esfuerzo |
| D10 | Evidencia / `Task.processId` | Evidencia = campo `evidenceUrl` (URL/texto), **no** módulo documentos. `processId` de tarea es informativo; el alcance lo da `mainProcessId` | Vincular a Documentos (FEATURE-007); multiproceso real |
| D11 | Importación Excel (BR-008 `P`) | **No** se implementa; gancho documentado que nunca aprueba controles | Diseñar import como borrador sometido a la guía |
| D12 | Borrar fase con tareas (`19`) | Rechazado (409) para cualquier fase con tareas, no solo la inicial (no perder tareas por cascade silencioso) | — |
| D15 | Borrar tarea que es predecesora de otra (`19`; FK `Cascade`) | **Rechazado (409)**: aunque la FK es `Cascade`, el service no deja romper aristas de dependencia por cascade silencioso (coherente con D12). El usuario quita las dependencias primero (se auditan). Borrar una tarea que no es predecesora de nadie sí se permite (sus aristas como *dependiente* caen por cascade; se audita el DELETE) | — |
| D13 | Estructura de módulos y dónde vive la máquina de tarea/plan | Módulo raíz `plan/` + submódulos; `PlanStateService` propio; `RequestStateService` solo para `operationalState` | — |
| D14 | Vistas Tablero/Cronograma/Carga/Plan-aprobado (SCR-06; métricas `P`) | Lista = vista principal; Plan-aprobado = Lista en lectura cuando `AUTORIZADO`; Tablero/Cronograma/Carga **diferidas** (dependen de datos/metricas `P` o de Capacidad) | Construir al confirmar métricas/Capacidad |

---

> **Resolución de ambigüedades primero (requerido por el brief):** las decisiones de modelado del
> plan (D1, 1:1), de tareas (D7 máquina de estados; D9 progreso; D6 permisos de ejecución/aceptación)
> y de dependencias (§2.3 ciclos; §1.2 integridad), y la de la guía de pendientes (D5 categorías +
> mínimo verificable + ganchos futuros) quedan **resueltas y documentadas** arriba, con sus puntos a
> reabrir. Las suposiciones están explícitas en la §Visión general (supuestos 1–4). El diseño es
> implementable sin tomar decisiones de arquitectura adicionales.

---

## 13. Respuestas a los findings de revisión (iteración 2)

Revisión: `design-review.json` / `design-review.md` (veredicto `CHANGES_REQUESTED`: 1 MEDIUM, 2 NIT).

**Finding 1 — [MEDIUM] AC-007 declarado "cubierto" sin el matiz de la rama "control pendiente". →
RESUELTO (fix A, documental).** Se corrigió la fila AC-007 de §9 para marcarla **parcial**: cubierta
solo para las categorías *fechas/fases* y *tareas/responsables* (implementadas), con las categorías
*capacidad*/*evidencias-puertas*/*controles de framework* presentes en el contrato (`futureCategories`)
pero **sin aportar pendientes en Fase 3** (ganchos, contenido `P` en `28` p.7; se encienden en
FEATURE-005/008). La **rama "control pendiente" de AC-007 queda explícitamente diferida y no
verificada en Fase 3**. La misma nota se replicó en §7 (fuera de alcance, viñeta Frameworks), en §6
(el E2E de AC-007 solo afirma las dos categorías implementadas) y en el bullet unit de la guía (§6).
Se adoptó el fix A y no el B porque B empezaría a inventar semántica de control marcada `P`
(BR-016/AC-008/AC-024), lo que el brief prohíbe.

**Finding 2 — [NIT] "Hallazgo Prisma 7" presentado como hallazgo crítico verificado. → RESUELTO.**
Se suavizó la redacción en §1.1, en la nota de `plan_request_unique` (§1.2) y en §12 D1: ahora se
presenta como **precaución ante el comportamiento de `findUnique` sobre un `@@unique` de un solo campo
con `name` custom en Prisma 7**, explícitamente **no verificada en el repo** (las 1:1 de Fase 2 usan
`@@index([requestId])`), y se señala que la solución (`findFirst` + `@@unique` como constraint de BD)
es correcta se cumpla o no la premisa. La prueba unit que fija el acceso elegido se mantiene (§6).

**Finding 3 — [NIT] `onDelete: Cascade` en `TaskDependency` podía perder aristas al borrar una tarea
predecesora. → RESUELTO (postura explícita elegida).** Se eligió la alternativa **conservadora**,
coherente con §12 D12: nueva **DECISIÓN §12 D15** — el service **rechaza (409)** borrar una tarea que
es predecesora de alguna otra (el usuario quita antes las dependencias, que se auditan); solo se
permite borrar una tarea que no es predecesora de nadie, donde el cascade afecta únicamente sus
aristas como *dependiente* y el `DELETE TASK` se audita. Documentado en §1.2 (nota de cascade), §2.5,
§3.3 (fila `DELETE /tasks/:id`), §3.5 (tabla de errores) y §10 (casos borde).
