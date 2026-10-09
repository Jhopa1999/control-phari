# Diseño técnico · Fase 5 · Trabajo y coordinación (control-phari)

> **Tercera iteración (segunda revisión aplicada).** La revisión vigente (`design-review.json`,
> `CHANGES_REQUESTED`: 2 HIGH + 3 MEDIUM + 3 NIT) ataca el bloque "`where` de alcance de cada FK" que la
> iteración previa añadió. Respuestas punto por punto en §14. Cambios clave de esta iteración:
> (HIGH-1) la FK `taskId` se valida por **traversal `Task → phase.planId → Plan.requestId → Request`**
> replicando `requireTaskInScope`, porque `Task` **no tiene relación `request`** (un `where` nested
> `request` sobre `task` no compila); (HIGH-2) la FK `projectRequestId` se valida con la **visibilidad
> real de Request** (`{ mainProcessId: { in: scopedProcessIds } }`, TODOS los grants, igual que Fase 2),
> **no** con el plano líder-only de §2.2, y se **elimina** la cláusula inventada "donde participa";
> (MEDIUM-1) `relatedIssueId` se valida por el **proceso del diario**, no por persona; (MEDIUM-2) se fija
> la regla de prefijos/orden de controllers del módulo `coordination`; (MEDIUM-3) `evidenceUrl` =
> `@IsString`≤2000 **sin** `@IsUrl`; (NIT-1) `targetDate` con nota de mapeo a 'vencimiento'/'fecha meta';
> (NIT-2) códigos de `ISSUE_TYPE` salvo `BLOQUEO` marcados seed `P`; (NIT-3) sin endpoint
> `/consolidation` separado. La iteración anterior (1 HIGH + 4 MEDIUM + 2 NIT) sigue respondida en §13.
> Esta

> fase construye la **bitácora de trabajo** (registro diario + consolidado semanal), las **novedades**
> (incidentes/bloqueos/apoyo), las **reuniones/acuerdos** y los **compromisos**, sobre lo ya construido
> en Fase 1 (identidad, roles/grants, autorización por rol + alcance, auditoría transversal), Fase 2
> (flujo de demanda, `Request`, política 403/404, `scopeWhere`), Fase 3 (plan y ejecución, `Task`,
> patrón módulo raíz + submódulos, máquinas de estado con helper) y Fase 4 (capacidad, helper de
> alcance por persona, formato de mes). Cubre el corte **FEATURE-006** (SCR-10–14, FNC-013–017,
> BR-013/014/015/023) de `specs/23`, los casos **UC-007/008/009**, las historias **US-008/009**, el
> flujo **FLOW-004/005** y los criterios **AC-014/015/016/017/018/019** de `specs/18`, respetando
> `specs/28` puntos 3 y 9 (todo lo marcado `P` se adopta como mínimo reversible, nunca como hecho).
>
> **Autoridad y método.** El steering manda: NestJS es dueño de la lógica de negocio, validaciones,
> autorización, persistencia, API REST y OpenAPI; Prisma vive **solo** en `apps/api`; el frontend
> consume **exclusivamente** vía `@plantilla-portales/api-client` y nunca toca PostgreSQL ni Prisma. Se
> **extiende tal cual** el patrón probado en Fases 1–4 (controller fino → service con lógica y
> `$transaction` → DTOs `class-validator` request/response separados → `AuditService.record(tx,…)`
> dentro de la transacción → P2002 → `ConflictException` → `findFirst` fuera de alcance →
> `NotFoundException` → política **403 rol / 404 alcance** → pantallas con estados
> loading/vacío/error/éxito y conservación de la entrada ante error, AC-031). No se introduce
> microservicio, Kubernetes, Kafka, Redis ni infra nueva; se mantiene el monolito modular.
>
> **Todo lo marcado `P`** (pendiente de cotejo contra el Site, `specs/28` p.3 y 9) se concentra en §11
> "DECISIONES de diseño" y se marca donde aparece. Ninguna decisión P se presenta como hecho del Site:
> se adopta la opción **mínima, documentada y reversible**. En particular, el brief prohíbe inventar
> transiciones exactas de revisión/devolución de bitácora, cierre/reapertura de novedades, publicación
> de acta, creación automática de compromisos, el catálogo/transiciones exactos de compromiso y la zona
> horaria/cortes de semana: todo eso queda como **máquina mínima reversible**, no como regla afirmada.

## Visión general

Fase 5 agrega **seis entidades** y **ningún cálculo persistido** nuevo. El eje es la **separación de
conceptos de BR-013/015/023**: las horas de bitácora son **dedicación**, no tocan
`Task.estimateHours`, ni el `progress`, ni la aprobación; enviar bitácora/semanal es **revisión**, no
autoriza prioridad ni compromisos; el semanal **consolida solo diarios enviados/revisados** y sus
propuestas son texto que **no muta nada**.

- **`DailyLog` (Registro diario)** — cabecera por **proceso + fecha + autor**; estado `BORRADOR` →
  `ENVIADO`. Agrupa N **`DailyLogActivity`** (relación 1:N, decidida en §11 D1).
- **`DailyLogActivity` (Actividad del diario)** — cada actividad lleva **clasificación** (maestra
  `ACTIVITY_CLASS`: planificada/soporte/interna/extraordinaria), **referencias** condicionadas a la
  clasificación (proyecto/tarea/activo), descripción, resultado, estado, **horas (dedicación)**,
  evidencia, novedad relacionada opcional y siguiente paso/fecha. Las reglas de clasificación
  (BR-014/AC-014/015/016) se validan **server-side** por actividad.
- **`WeeklyReport` (Registro semanal)** — ancla al **lunes** de la semana, proceso, secciones de texto.
  Consolida (lectura, no copia) **solo** los `DailyLog` `ENVIADO`/`REVISADO` del proceso en esa semana
  (BR-015/AC-017). Las propuestas son **solo texto** y no mutan prioridad/compromisos (AC-018).
- **`Issue` (Novedad)** — proceso, fecha, **tipo** (maestra `ISSUE_TYPE`, por defecto `BLOQUEO`),
  relación opcional (solicitud/tarea/activo-texto), título/detalle/impacto/responsable/fecha
  objetivo/resolución. **Un registro por incidente** se mantiene hasta resolver (AC-019). Estado vía
  maestra `RECORD_STATE` con **máquina mínima reversible** (abierto → en seguimiento →
  resuelto/cerrado); cierre/reapertura exactos son `P`.
- **`Meeting` (Reunión)** — título requerido, proceso, **estado inicial `BORRADOR`**, solicitud
  opcional, responsable, fecha requerida, hora, **participantes N:M con `User`**, proyecto opcional,
  agenda, decisiones, observaciones. Acta/notificaciones/asistencia/compromisos automáticos son `P`
  (no se implementan).
- **`Commitment` (Compromiso)** — título requerido, proceso, estado, solicitud opcional, responsable,
  **asignado**, **vencimiento requerido**, proyecto opcional, **reunión fuente opcional**, resultado
  esperado/evidencia, bloqueos. **No** se crean compromisos automáticamente desde reuniones (`P`);
  catálogo/transiciones exactos son `P` (máquina mínima reversible documentada).

Toda mutación audita vía `AuditService` dentro de la `$transaction` con `objectType` nuevos
(`DAILY_LOG`, `DAILY_LOG_ACTIVITY`, `WEEKLY_REPORT`, `ISSUE`, `MEETING`, `COMMITMENT`);
`scopeProcessId = proceso del registro` (siempre existe en Fase 5, §1.6). Se **amplía
`AuditObjectType`** en `audit.service.ts` **y** el `OBJECT_TYPES` del filtro en
`list-audit-events.dto.ts` (lección 2: ambos, o el filtro da 400).

### Organización del módulo (DECISIÓN §11 D0)

Un **único módulo raíz `coordination`** en `apps/api/src/modules/coordination/` con **cuatro
submódulos de servicio** (no cuatro módulos Nest): `worklog` (DailyLog + DailyLogActivity +
WeeklyReport), `issue`, `meeting`, `commitment`. Justificación: las cuatro áreas comparten el **mismo
helper de alcance por proceso/persona** (§2.6), los mismos `objectType` de auditoría, el mismo formato
de fecha y las mismas políticas 403/404; agruparlas evita duplicar el `scope` cuatro veces (lección
1). Es un submódulo-por-service análogo al patrón plan de Fase 3 (módulo raíz + servicios). Cada área
expone su **controller fino** propio con su `@ApiTags` para que OpenAPI quede legible:
`WorklogController` (rutas `/worklog/*` + `/weekly-reports/*`), `IssueController` (`/issues/*`),
`MeetingController` (`/meetings/*`), `CommitmentController` (`/commitments/*`). Alternativa descartada:
cuatro módulos independientes (más boilerplate y `CoordinationScopeService` duplicado o importado
cuatro veces); un solo service gigante (viola "controller fino + service" y mezcla responsabilidades).

> **Orden de controllers y colisión de rutas (resuelve MEDIUM-2).** `plan.module.ts` documenta que el
> orden de registro importa cuando una ruta **estática** comparte prefijo con una **paramétrica** (allí
> `TaskController` va primero por `GET /my-work` vs `GET /tasks/:id`). En `coordination` se evita el
> problema **por diseño de prefijos**, no solo por orden: cada ruta estática usa un prefijo que **no**
> es consumido por ningún `:param` de otro endpoint. En concreto, `GET /coordination/people` vive bajo
> el prefijo `coordination/` que **ningún** controller usa como paramétrico; y dentro de `WorklogController`
> las estáticas (`/worklog/daily`, `/weekly-reports`) y las paramétricas (`/worklog/daily/:id`,
> `/worklog/daily/:id/submit`, `/worklog/daily/:id/activities`, `/worklog/activities/:id`) **no colisionan**
> porque los segmentos literales (`daily`, `activities`, `submit`) preceden siempre a cualquier `:id` y
> `activities` es un recurso hermano con su propio prefijo (`/worklog/activities/:id`), no un hijo de
> `/worklog/daily/:id`. Regla de implementación: (a) **ninguna** ruta estática comparte el nivel de un
> `:param` del mismo controller; (b) si en el futuro algún prefijo llegara a solaparse, se registra el
> controller de rutas estáticas **antes** en `coordination.module.ts`, replicando la precaución de
> `plan.module.ts`. El `coordination.module.spec.ts` compila el módulo y afirma que los cuatro
> controllers y sus services se inyectan (y, de añadirse rutas solapables, el orden de registro).

### Mapa rápido decisión → fuente

| Decisión | Respaldo |
|---|---|
| Módulo raíz `coordination` + 4 controllers/services | patrón plan Fase 3; lección 1; §11 D0 |
| `DailyLog` 1:N `DailyLogActivity` (no plano) | SCR-10 "varias actividades por día"; `08` Diario "actividades N"; §11 D1 |
| Diario `@@unique([authorUserId, processId, date])` compuesto | SCR-10 cabecera proceso+fecha; §11 D2 (reversible) |
| Clasificación = maestra `ACTIVITY_CLASS`; reglas en service | BR-014; AC-014/015/016; SCR-10; §2.3 |
| Activo = **texto requerido** `assetRef` para soporte (sin Asset) | brief; FEATURE-007 fuera de alcance; §11 D3 (gancho a FK) |
| Horas de bitácora = dedicación; **no** tocan Task | BR-013; AC (US-008); §2.4 |
| `WeeklyReport` ancla lunes; consolida solo ENVIADO/REVISADO | BR-015; AC-017; SCR-11; §2.5; §11 D4 |
| Propuestas semanales = solo texto, no mutan nada | BR-015; AC-018; SCR-11; §2.5 |
| `Issue` un registro por incidente; estado `RECORD_STATE` | AC-019; SCR-12; `06`; §2.6; §11 D5 |
| Máquina mínima Issue abierto→seguimiento→resuelto/cerrado (reversible) | `06` "transición exacta P"; `28` p.3; §4; §11 D5 |
| `Meeting` estado inicial `BORRADOR`; participantes N:M | SCR-13; `06` "reunión inicia Borrador"; §1.4; §11 D6 |
| Acta/notificación/asistencia/compromiso-auto = NO implementar | SCR-13; `28` p.3; §11 D6 |
| `Commitment` vencimiento req., reunión fuente opcional; sin auto-creación | SCR-14; `08` Compromiso; §1.5; §11 D7 |
| Estado por catálogo `RECORD_STATE`, máquina mínima reversible | `06` "compromiso estados P"; §4; §11 D7 |
| Alcance por rol: integrante lo suyo, líder su proceso, jefe área | `specs/10` matriz log/meeting; AC-025/026; §2.2 |
| Helper de alcance **propio** por rol (NO reutiliza `request.scopeWhere` privado) | lección 1; `capacity-scope.service.ts`; §2.2; §13 F1 |
| Líder/jefe: lectura por proceso, escritura por persona; consolidación usa autor del semanal | `specs/10`; §2.2/§2.5; §11 D13; §13 F2 |
| `weekStart` siempre normalizado al lunes ISO (nunca 400 por no-lunes) | §3.4; §11 D8; §13 F3 |
| `hours` opcional `@default(0)`; requerido al enviar es P | SCR-29; `08`; §2.3; §11 D11; §13 F4 |
| "proyecto"=Request (P); FK a Request validada por `scopedProcessIds` (visibilidad Fase 2, NO líder-only) | §1.2/§2.3; §11 D12; §14 H2 |
| FK `taskId` por traversal `phase.plan.request` (Task NO tiene relación `request`) | §1.2; `requireTaskInScope`; §14 H1 |
| `relatedIssueId` validado por proceso del diario (no por persona) | §1.2; `08`/SCR-10; §14 M1 |
| `evidenceUrl` = texto libre `@IsString`≤2000 (sin `@IsUrl`) | §1.2/§3.4; §11 D3; §14 M3 |
| Sin endpoint `/consolidation` separado (conteos en el detalle) | §2.5/§3; §14 N3 |
| `ISSUE_TYPE` salvo `BLOQUEO` = seed P reversible (no enumerados en `20`) | §1.7; `29`; §14 N2 |
| `dateStringToDate` revalida con round-trip (400 si irreal) | `month.spec.ts`; §3.4; §13 F6 |
| `/worklog/daily/:id/review` NO expuesto (ENVIADO→REVISADO queda P) | `06`; §3/§4; §13 F7 |
| Auditar en `$transaction`; `scopeProcessId = proceso del registro` | Fase 1 §6; lección 3; §1.6 |
| Ampliar `AuditObjectType` **y** `OBJECT_TYPES` del filtro | lección 2; §1.6 |
| Nuevas maestras seed: `ACTIVITY_CLASS`, `ISSUE_TYPE`, `RECORD_STATE` | `20` familias; `06`; §1.7 |
| Formato fecha de día/semana = `DateTime @db.Date` UTC, contrato `YYYY-MM-DD` | Fase 4 §1.3 helper; §11 D8 (reversible) |

### Supuestos explícitos

1. **El alcance por rol se mira por `grant.roleCode`, no por "tener procesos"** (lección 1): el
   integrante gestiona/ve **solo lo suyo** (sus diarios por `authorUserId`, sus compromisos por
   `assignedUserId`/`responsibleUserId`); el líder ve/gestiona **su(s) proceso(s)** solo si tiene
   `grant.roleCode === LIDER_PROCESO`; el jefe ve el **área**. Un integrante con grant en un proceso
   **no** se expande al proceso (§2.2).
2. **Toda entidad de Fase 5 tiene `processId` requerido** (son registros de trabajo de un proceso):
   por tanto `scopeProcessId` de auditoría es **siempre** el proceso del registro (lección 3; nunca
   `null`), a diferencia de la disponibilidad de Fase 4.
3. **No se implementa** Activos/Documentos reales (FEATURE-007), Frameworks (FEATURE-008) ni
   Portafolio/dashboard (FEATURE-010). El "activo" se representa como **texto** (`assetRef`), con el
   gancho de migración a FK documentado (§11 D3). La "evidencia" es **URL/texto**, no un `Document`.
4. El `X-Actor-Id`, `CurrentUserGuard`/`RolesGuard`, `CurrentActor`, `AuditService`, el helper de mes
   de Fase 4 y el api-client ya existen y se reutilizan sin cambios de contrato.
5. **No se tocan** las tablas ni pantallas de Fases 1–4, ni `/catalogs`, ni los comandos del repo.

---

## 1. Modelo de datos (Prisma)

### 1.1 Principios heredados (sin cambios)

- Esquema físico en `apps/api/prisma/schema.prisma`. Modelos PascalCase; columnas `snake_case` vía
  `@map`/`@@map`; PK `String @id @default(uuid()) @db.Uuid`; timestamps `created_at`
  (`@default(now())`) / `updated_at` (`@updatedAt`) en toda tabla mutable (las append-only sin
  `updatedAt`, como `Approval`).
- **Precaución Prisma 7 (heredada de Fase 3 §1.1 / Fase 4 §1.1):** un `@@unique` de **un solo campo**
  con `name` custom **no** sirve como `where` de `findUnique`/`upsert`; para resolver por un solo campo
  se usa **`findFirst`**. Los `@@unique` **compuestos** sí sirven como `where`. En Fase 5 el único
  unique relevante es el **compuesto** `DailyLog([authorUserId, processId, date])`, de modo que sí es
  usable como `where` (caso favorable). Todas las demás resoluciones son por `id` (PK) con `findFirst`
  + alcance.
- Solo se modelan las entidades confirmadas de esta fase. No hay tabla de resumen semanal (se calcula
  por lectura, §2.5) ni entidades de FEATURE-007/008/010.

### 1.2 Entidades y relaciones

```
User    (1) ──< (N) DailyLog              [autor; @@unique([authorUserId, processId, date])]
Process (1) ──< (N) DailyLog              [proceso del diario, requerido]
DailyLog(1) ──< (N) DailyLogActivity      [actividades del día; cascade al borrar el diario]
Process (1) ──< (N) WeeklyReport          [proceso del semanal, requerido]
User    (1) ──< (N) WeeklyReport          [autor del semanal; @@unique([authorUserId, processId, weekStart])]
Process (1) ──< (N) Issue                 [proceso de la novedad, requerido]
Process (1) ──< (N) Meeting               [proceso de la reunión, requerido]
Meeting (N) >──< (N) User                 [participantes, tabla puente MeetingParticipant]
Process (1) ──< (N) Commitment            [proceso del compromiso, requerido]
Meeting (0..1) ──< (N) Commitment         [reunión fuente opcional]

// Relaciones opcionales a entidades existentes (nunca amplían alcance):
Task     (0..1) ──< (N) DailyLogActivity  [referencia tarea planificada]
Request  (0..1) ──< (N) DailyLogActivity  [referencia proyecto/solicitud planificada]
Issue    (0..1) ──< (N) DailyLogActivity  [novedad relacionada]
Request  (0..1) ──< (N) Issue/Meeting/Commitment  [solicitud relacionada]
Task     (0..1) ──< (N) Issue             [tarea relacionada]
User     responsible/assigned en Issue/Meeting/Commitment
```

Todas las relaciones inversas se añaden a `User`, `Process`, `Request` y `Task` sin alterar sus campos
existentes (Fases 1–4 intactas). Las FK opcionales usan `onDelete: Restrict` (no se borra una Request
con registros ligados sin resolverlos antes), salvo las "hijas" de la propia fase
(`DailyLogActivity`, `MeetingParticipant`) que usan `onDelete: Cascade`.

#### DailyLog (Registro diario · SCR-10 · `08` Diario)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| authorUserId | `String @db.Uuid` | `author_user_id` | FK → User (`Restrict`); autor/dueño del diario |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`Restrict`); **requerido** (cabecera) |
| date | `DateTime @db.Date` | `date` | **requerido**; día del registro (UTC, §11 D8) |
| status | `String @default("BORRADOR")` | `status` | enum lógico `DailyLogStatus`; read-only vía helper |
| submittedAt | `DateTime?` | `submitted_at` | fecha de envío a revisión |
| dayNotes | `String?` | `day_notes` | observación/notas del día (SCR-10) |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Relaciones: `author User @relation("DailyLogAuthor", …)`, `process Process @relation(…)`,
`activities DailyLogActivity[]`.
Índices: `@@unique([authorUserId, processId, date], name: "daily_log_author_process_date_unique")`
(**compuesto → usable como `where`**, §11 D2), `@@index([processId])`, `@@index([date])`,
`@@index([status])`, `@@map("daily_logs")`.

#### DailyLogActivity (Actividad del diario · SCR-10 · BR-014)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| dailyLogId | `String @db.Uuid` | `daily_log_id` | FK → DailyLog (`Cascade`) |
| classificationCode | `String` | `classification_code` | maestra `ACTIVITY_CLASS`; **requerido** (BR-014) |
| projectRequestId | `String? @db.Uuid` | `project_request_id` | FK → Request (`Restrict`); "proyecto" planificado |
| taskId | `String? @db.Uuid` | `task_id` | FK → Task (`Restrict`); tarea planificada |
| assetRef | `String?` | `asset_ref` | **texto** del activo (soporte); gancho a FK (§11 D3) |
| requesterRef | `String?` | `requester_ref` | solicitante (extraordinaria); texto |
| justification | `String?` | `justification` | justificación (extraordinaria) |
| description | `String?` | `description` | descripción del trabajo |
| result | `String?` | `result` | resultado |
| activityStatus | `String?` | `activity_status` | estado de la actividad (texto/maestra `RECORD_STATE`, §11 D9) |
| hours | `Int @default(0)` | `hours` | **dedicación** (BR-013); entero `>= 0`; **opcional en DTO** (borrador puede ir sin horas); "requerido al enviar" es `P` (§2.3, §11 D11) |
| evidenceUrl | `String?` | `evidence_url` | evidencia como **texto libre** (`@IsOptional @IsString`, ≤ 2000, **sin** `@IsUrl`; MEDIUM-3/§11 D3); endurecer a URL/FK `Document` es `P` (FEATURE-007) |
| relatedIssueId | `String? @db.Uuid` | `related_issue_id` | FK → Issue (`Restrict`); novedad relacionada |
| nextStep | `String?` | `next_step` | siguiente paso |
| nextStepDate | `DateTime? @db.Date` | `next_step_date` | fecha del siguiente paso |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Índices: `@@index([dailyLogId])`, `@@index([classificationCode])`, `@@index([taskId])`,
`@@index([projectRequestId])`, `@@index([relatedIssueId])`, `@@map("daily_log_activities")`.

> **"proyecto" = `Request` (DECISIÓN §11 D12, `P` reversible).** Fases 1–4 **no** tienen entidad
> `Project`; el concepto "proyecto" de SCR-10/`08` (y de Portafolio FEATURE-010, fuera de alcance) se
> representa, en lo que ya existe, como una **`Request`** (una solicitud con plan es el "proyecto" en el
> dominio actual). Por eso la FK se llama `projectRequestId` y apunta a `Request`. No se valida que la
> Request tenga plan: el "proyecto" es cualquier Request **en alcance** del actor. Si el Site confirmara
> una entidad `Project` propia (FEATURE-010), se añade `projectId String? @db.Uuid` conviviendo con
> `projectRequestId` (mismo gancho que D3 para `Asset`); por eso es reversible.
>
> **`where` de alcance de cada FK referenciable (resuelve §2.3 "404 si fuera de alcance").** Antes de
> persistir la actividad, el service comprueba que cada FK informada existe **dentro de la visibilidad
> del actor** (si no, 404), con estos `where` concretos (nunca amplían el alcance, son solo validación
> de referencia). **CRÍTICO (findings HIGH-1/HIGH-2):** la visibilidad de **Request** y **Task** NO es
> la de las entidades propias de Fase 5 (plano líder-only de §2.2), sino la visibilidad **real de
> Request del repo**, que es por **`scopedProcessIds` (TODOS los grants activos del actor)**, verificada
> en `request.service.ts::scopeWhere` y `plan-state.service.ts::requestScopeWhere` (ambos privados):
> no-jefe → `{ mainProcessId: { in: actor.scopedProcessIds } }`; jefe → `{}`. Si se usara el plano
> líder-only, un integrante que en Fase 2 **sí ve** una Request de su proceso recibiría 404 al
> referenciarla desde una actividad planificada, rompiendo AC-014. Por eso Fase 5 valida estas dos FK
> contra `scopedProcessIds`, **no** contra `leaderProcessIds`.
>
> Como esos `scopeWhere` son `private` (no importables, y además la refactor de Fase 2 queda fuera de
> alcance), `CoordinationScopeService` expone un helper propio y **explícitamente nombrado**
> `requestVisibilityWhere(actor)` **solo** para validar FK a Request/Task (distinto del `scopeWhere` de
> entidades Fase 5 de §2.2):
>
> ```ts
> // coordination/coordination-scope.service.ts — visibilidad de Request para validar FK (NO el plano de §2.2)
> requestVisibilityWhere(actor: CurrentActor): Prisma.RequestWhereInput {
>   if (actor.isJefeArea) return {};
>   return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } }; // TODOS los grants, igual que Fase 2
> }
> ```
>
> Con eso, las validaciones de referencia son:
> - `projectRequestId` → `request.findFirst({ where: { AND: [{ id }, requestVisibilityWhere(actor)] } })`.
>   Coincide con la visibilidad real de la Request en Fase 2. **Sin** cláusula "donde participa" (no
>   existe en el modelo de alcance de Request; el `scopeWhere` real filtra por `mainProcessId`, no por
>   `RequestParticipant`). Fuera de visibilidad → 404.
> - `taskId` → **traversal por pasos replicando `plan-state.service.ts::requireTaskInScope`** (patrón
>   heredado), porque **`Task` NO tiene relación `request`** (verificado en `schema.prisma`: la cadena
>   real es `Task → phase (planId) → Plan (requestId) → Request`). Un `where: { id, request: {…} }`
>   sobre el delegado `task` **no compila** en TS estricto. El service:
>   1. `task.findFirst({ where: { id }, include: { phase: { select: { planId: true } } } })` → si no,
>      404;
>   2. `plan.findFirst({ where: { id: task.phase.planId }, select: { requestId: true } })` → si no, 404;
>   3. `request.findFirst({ where: { AND: [{ id: plan.requestId }, requestVisibilityWhere(actor)] } })` →
>      si no, 404.
>   (Alternativa de un solo `findFirst` con el nested **correcto** `where: { id, phase: { plan: {
>   request: requestVisibilityWhere(actor) } } }` también compila; se elige el **traversal por pasos**
>   para no divergir del patrón heredado y dar 404 sin confirmar existencia, igual que
>   `requireTaskInScope`.)
> - `relatedIssueId` → se valida contra las novedades **del mismo proceso del diario**, no contra el
>   `issueScopeWhere` por persona de §2.2 (resuelve MEDIUM-1): `issue.findFirst({ where: { id,
>   processId: dailyLog.processId } })`. El diario ya está en alcance del actor (comprobado antes), así
>   que una novedad de **su proceso** es referenciable aunque el integrante no la haya reportado ni la
>   resuelva (el SDD `08`/SCR-10 no restringe la novedad relacionada a las "propias"). Fuera de ese
>   proceso → 404. Restringirlo a las propias quedaría `P` reversible; por defecto se usa el proceso del
>   diario.
>
> `assetRef`/`requesterRef`/`justification` son **texto libre** (no se validan contra tabla; §11 D3).

> **1:N vs plano (DECISIÓN §11 D1).** SCR-10 y `08` Diario dicen explícitamente "varias actividades
> por día" / "actividades N". Un diario plano (una fila = una actividad) obligaría a repetir
> proceso/fecha/notas por actividad y no permitiría agrupar la jornada ni calcular total de horas del
> día de forma natural. Se elige **1:N** (`DailyLog` cabecera, `DailyLogActivity` líneas). El total de
> horas del día es la **suma** de `hours` de sus actividades (cálculo de lectura, no columna). Elegido
> frente al plano porque la cabecera lleva estado/envío/notas una sola vez y la clasificación/horas
> varían por actividad.

#### WeeklyReport (Registro semanal · SCR-11 · `08` Semanal)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| authorUserId | `String @db.Uuid` | `author_user_id` | FK → User (`Restrict`); autor |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`Restrict`); **requerido** |
| weekStart | `DateTime @db.Date` | `week_start` | **lunes ancla** de la semana (UTC, §11 D8) |
| status | `String @default("BORRADOR")` | `status` | enum lógico; `BORRADOR`→`ENVIADO` |
| submittedAt | `DateTime?` | `submitted_at` | envío a revisión |
| results | `String?` | `results` | resultados/entregables (sección texto) |
| proposals | `String?` | `proposals` | nuevas solicitudes/prioridad **propuesta** (texto, no muta) |
| blockers | `String?` | `blockers` | bloqueos/dependencias/capacidad (texto) |
| commitmentsText | `String?` | `commitments_text` | compromisos próxima semana (texto; NO crea Commitment) |
| decisions | `String?` | `decisions` | decisiones para jefe (texto) |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Índices: `@@unique([authorUserId, processId, weekStart], name: "weekly_report_author_process_week_unique")`
(compuesto), `@@index([processId])`, `@@index([weekStart])`, `@@map("weekly_reports")`.

> Las secciones de `08` Semanal se modelan como **campos de texto** (no sub-tablas): el SDD las lista
> como contenido de informe, no como entidades. Los conteos (bitácoras, actividades, horas,
> extraordinarias) se **calculan por lectura** desde los diarios elegibles (§2.5), no se persisten.
> `commitmentsText` y `proposals` son texto puro: **no** generan `Commitment` ni cambian prioridad
> (AC-018, BR-015).

#### Issue (Novedad · SCR-12 · `08` Novedad)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`Restrict`); **requerido** |
| reportedByUserId | `String @db.Uuid` | `reported_by_user_id` | FK → User (`Restrict`); autor |
| date | `DateTime @db.Date` | `date` | **requerido** |
| typeCode | `String @default("BLOQUEO")` | `type_code` | maestra `ISSUE_TYPE`; **por defecto Bloqueo** |
| relatedRequestId | `String? @db.Uuid` | `related_request_id` | FK → Request (`Restrict`); opcional |
| relatedTaskId | `String? @db.Uuid` | `related_task_id` | FK → Task (`Restrict`); opcional |
| relatedAssetRef | `String?` | `related_asset_ref` | activo como texto (§11 D3) |
| title | `String` | `title` | **requerido** |
| detail | `String?` | `detail` | detalle |
| impact | `String?` | `impact` | impacto |
| resolverUserId | `String? @db.Uuid` | `resolver_user_id` | FK → User (`Restrict`); responsable de resolución |
| targetDate | `DateTime? @db.Date` | `target_date` | fecha objetivo = **'vencimiento'/'fecha meta'** de `08`/SCR-12 (mismo concepto; nombre técnico alineable con `Commitment.dueDate`, NIT-1) |
| resolution | `String?` | `resolution` | resolución/evidencia |
| state | `String @default("EN_CURSO")` | `state` | maestra `RECORD_STATE`; "abierto" = `EN_CURSO` (§1.7/§4) |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Índices: `@@index([processId])`, `@@index([reportedByUserId])`, `@@index([state])`,
`@@index([typeCode])`, `@@map("issues")`.

> **Un registro por incidente (AC-019).** No se crea una fila nueva por cada actualización: la novedad
> es **una** fila que se **edita** (PATCH) hasta resolverla. El historial de cambios lo da la
> auditoría (before/after), no filas duplicadas. `date` es la fecha de alta; no se re-crea al
> actualizar.

#### Meeting (Reunión · SCR-13 · `08` Reunión) y MeetingParticipant

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`Restrict`); **requerido** |
| title | `String` | `title` | **requerido** (SCR-13) |
| state | `String @default("BORRADOR")` | `state` | maestra `RECORD_STATE`; **inicial Borrador** (`06`) |
| relatedRequestId | `String? @db.Uuid` | `related_request_id` | FK → Request (`Restrict`); opcional |
| responsibleUserId | `String? @db.Uuid` | `responsible_user_id` | FK → User (`Restrict`); responsable |
| meetingDate | `DateTime @db.Date` | `meeting_date` | **requerido** (SCR-13) |
| meetingTime | `String?` | `meeting_time` | hora como `HH:mm` (texto; zona Colombia es `P`, §11 D8) |
| relatedProjectRequestId | `String? @db.Uuid` | `related_project_request_id` | FK → Request (`Restrict`); "proyecto" opcional |
| agenda | `String?` | `agenda` | agenda/temas |
| decisions | `String?` | `decisions` | decisiones/acuerdos |
| notes | `String?` | `notes` | observaciones |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

`MeetingParticipant` (puente N:M `Meeting`↔`User`):

| Campo | Tipo | Reglas |
|---|---|---|
| id | PK uuid | |
| meetingId | FK → Meeting (`Cascade`) | |
| userId | FK → User (`Restrict`) | |
| createdAt | timestamp | append-only |

Índices Meeting: `@@index([processId])`, `@@index([state])`, `@@index([meetingDate])`,
`@@map("meetings")`. Participante: `@@unique([meetingId, userId], name:
"meeting_participant_unique")`, `@@index([userId])`, `@@map("meeting_participants")`.

> `meetingTime` se guarda como **texto `HH:mm`** (no `DateTime` con hora) para no fijar zona horaria:
> la "hora Colombia" y los cortes son `P` (§11 D8). Participantes se seleccionan entre `User` del
> alcance (§2.6, endpoint `/coordination/people`). Acta/notificaciones/asistencia **no** se modelan
> (`P`, §11 D6).

#### Commitment (Compromiso · SCR-14 · `08` Compromiso)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`Restrict`); **requerido** |
| title | `String` | `title` | **requerido** (SCR-14) |
| state | `String @default("EN_CURSO")` | `state` | maestra `RECORD_STATE`; "abierto" = `EN_CURSO` (§1.7/§4) |
| relatedRequestId | `String? @db.Uuid` | `related_request_id` | FK → Request (`Restrict`); opcional |
| responsibleUserId | `String? @db.Uuid` | `responsible_user_id` | FK → User (`Restrict`); responsable |
| assignedUserId | `String? @db.Uuid` | `assigned_user_id` | FK → User (`Restrict`); persona asignada |
| dueDate | `DateTime @db.Date` | `due_date` | **requerido** (SCR-14) |
| relatedProjectRequestId | `String? @db.Uuid` | `related_project_request_id` | FK → Request (`Restrict`); proyecto opcional |
| sourceMeetingId | `String? @db.Uuid` | `source_meeting_id` | FK → Meeting (`Restrict`); **reunión fuente opcional** |
| expectedResult | `String?` | `expected_result` | resultado esperado |
| result | `String?` | `result` | resultado/evidencia |
| blockers | `String?` | `blockers` | bloqueos |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Índices: `@@index([processId])`, `@@index([state])`, `@@index([assignedUserId])`,
`@@index([responsibleUserId])`, `@@index([sourceMeetingId])`, `@@index([dueDate])`,
`@@map("commitments")`.

> **No auto-creación desde reunión (`P`, §11 D7).** `sourceMeetingId` solo **relaciona** un compromiso
> que el usuario crea manualmente con la reunión origen; cerrar/publicar una reunión **no** genera
> compromisos. Si el Site confirmara la generación automática, se agrega como acción explícita sin
> cambiar el modelo (ya hay el FK).

### 1.6 Auditoría: nuevos objectType (lección 2 y 3)

`AuditService.record(tx,…)` se usa tal cual. Se amplían **ambos** lugares, o el filtro
`?objectType=` da 400 pese a registrarse el evento:

1. `audit.service.ts` → `AuditObjectType` += `'DAILY_LOG' | 'DAILY_LOG_ACTIVITY' | 'WEEKLY_REPORT' |
   'ISSUE' | 'MEETING' | 'COMMITMENT'`.
2. `list-audit-events.dto.ts` → `OBJECT_TYPES` += los mismos seis strings (en el mismo orden).

El set de `action` (`CREATE|UPDATE|DELETE|REVOKE`) **no cambia**. Invariante (hereda Fase 1 §6): toda
mutación escribe su `AuditEvent` **dentro de la misma `$transaction`**:

| Mutación | action | objectType | objectId | scopeProcessId | before/after |
|---|---|---|---|---|---|
| crear/editar/borrar diario | CREATE/UPDATE/DELETE | DAILY_LOG | log.id | **log.processId** | snapshot |
| enviar diario a revisión | UPDATE | DAILY_LOG | log.id | log.processId | antes/después (status) |
| crear/editar/borrar actividad | CREATE/UPDATE/DELETE | DAILY_LOG_ACTIVITY | activity.id | **log.processId** (del padre) | snapshot |
| crear/editar/enviar/borrar semanal | CREATE/UPDATE/DELETE | WEEKLY_REPORT | report.id | report.processId | snapshot |
| crear/editar/borrar/transición novedad | CREATE/UPDATE/DELETE | ISSUE | issue.id | issue.processId | snapshot |
| crear/editar/borrar reunión | CREATE/UPDATE/DELETE | MEETING | meeting.id | meeting.processId | snapshot |
| crear/editar/borrar/transición compromiso | CREATE/UPDATE/DELETE | COMMITMENT | commitment.id | commitment.processId | snapshot |

> **`scopeProcessId` = proceso del registro, siempre (lección 3).** Toda entidad de Fase 5 tiene
> `processId` requerido (supuesto 2), así que la auditoría es **siempre** visible por proceso para
> líder/jefe (consistente con AC-025/026 y la auditoría de Fases 2–4). La actividad hija toma el
> `processId` de su `DailyLog` padre (se resuelve en el service antes de auditar). No hay caso de
> `scopeProcessId = null` en esta fase.

### 1.7 Maestras nuevas (seed idempotente)

Se añaden tres familias a `CATALOG_ITEMS` de `apps/api/prisma/seed.ts` (patrón `upsert` por
`catalog_code_unique` existente; no se tocan las familias previas). Valores de `20-master-data.md` y
`06-state-machines.md`:

- **`ACTIVITY_CLASS`** (clasificación de actividad, BR-014): `PLANIFICADA` "Trabajo planificado",
  `SOPORTE` "Operación/soporte", `INTERNA` "Gestión interna", `EXTRAORDINARIA` "Extraordinaria".
- **`ISSUE_TYPE`** (tipo de novedad, familia confirmada en `20`): `BLOQUEO` "Bloqueo" (**por defecto**,
  único respaldado por `29` "tipo inicial bloqueo"). Los otros tres —`INCIDENTE` "Incidente",
  `CALIDAD_DATOS` "Calidad de datos", `SOLICITUD_APOYO` "Solicitud de apoyo"— son **seed inicial `P`
  reversible** (NIT-2): `20` lista la **familia** "tipo de novedad" pero **no enumera** estos códigos,
  así que se adoptan como propuesta administrable (maestra editable, BR-018) y se cotejarán con el
  Site; no se afirman como valor confirmado. Igual criterio que los nombres de la máquina de estado.
- **`RECORD_STATE`** (estado de registro, `06`): `BORRADOR` "Borrador", `EN_CURSO` "En curso",
  `BLOQUEADO` "Bloqueado", `COMPLETADO` "Completado", `ARCHIVADO` "Archivado". Las máquinas mínimas de
  Issue/Commitment usan un subconjunto operativo (`ABIERTO`/`EN_SEGUIMIENTO`/`RESUELTO`/`CERRADO`,
  §4); como esos nombres son `P` y `RECORD_STATE` del Site usa Borrador/En curso/Bloqueado/Completado/
  Archivado, el servidor **mapea** la máquina mínima a los códigos existentes de `RECORD_STATE` para
  no inventar un catálogo paralelo (§11 D5/D7, decisión reversible): Issue inicia en `EN_CURSO`
  (equivale a "abierto"), puede ir a `BLOQUEADO`, `COMPLETADO` ("resuelto") y `ARCHIVADO` ("cerrado");
  reapertura = volver a `EN_CURSO`. El default de columna `Issue.state`/`Commitment.state` se fija a
  `EN_CURSO` en la migración.

> **Default de `Issue.state`/`Commitment.state` = `EN_CURSO`.** La máquina mínima §4 habla de "abierto"
> como **concepto**, implementado con el código real `EN_CURSO` de `RECORD_STATE`: **no** se crea un
> estado `ABIERTO` que el Site no tiene. Por eso los defaults de columna en §1.2 son `EN_CURSO`.

### 1.8 Estrategia de migración

Una única migración versionada nueva, con el comando real del repo (nunca `db push`), desde
`apps/api`:

```
npm run prisma:migrate:dev -- --name fase5_trabajo
```

Produce `apps/api/prisma/migrations/<timestamp>_fase5_trabajo/migration.sql` con las tablas
`daily_logs`, `daily_log_activities`, `weekly_reports`, `issues`, `meetings`,
`meeting_participants`, `commitments`, sus FKs, los `@@unique` compuestos y los índices. Luego
`npm run prisma:generate` regenera el client tipado en `src/generated/prisma`. Las tablas de Fases
1–4 **no se tocan**. El seed se amplía con las tres familias (§1.7) manteniéndolo idempotente.

---

## 2. Lógica de negocio y alcance (server-side)

Toda regla y alcance se evalúan **siempre en el service** (NestJS dueño). Ocultar un control en UI no
es seguridad (BR-019). Códigos: **400** = validación de dato de entrada; **409** = conflicto de
estado/constraint (p. ej. diario duplicado persona/proceso/fecha); **403** = rol insuficiente; **404**
= fuera de alcance / inexistente (sin filtrar datos).

### 2.2 Alcance por rol (en el `where`, POR ROL no por "tener procesos")

`CoordinationScopeService` centraliza el alcance (lección 1). **No reutiliza** el `scopeWhere` de
`request.service.ts`: ese método es **`private`** (no importable) y filtra por `actor.scopedProcessIds`
(**todos** los grants activos, incluidos procesos donde el actor es solo integrante), lo que
reintroduciría exactamente el bug que esta sección evita. En su lugar, `CoordinationScopeService`
**construye su propio `where` por rol** replicando el patrón verificado de
`capacity/capacity-scope.service.ts`, cuyo helper privado es la referencia correcta:

```ts
// coordination/coordination-scope.service.ts
private leaderProcessIds(actor: CurrentActor): string[] {
  return actor.grants
    .filter((g) => g.roleCode === RoleCode.LIDER_PROCESO) // NO scopedProcessIds
    .map((g) => g.processId);
}
```

Con eso, el helper arma dos planos según la entidad:

- **Plano por proceso** (Issue, Meeting, Commitment, WeeklyReport, y DailyLog para líder/jefe):
  - **jefe** (`actor.isJefeArea`) → `{}` (área completa, sin filtro);
  - **líder** → `processId ∈ leaderProcessIds(actor)` (solo grants `LIDER_PROCESO`);
  - **integrante** → **no** se expande al proceso (supuesto 1): su alcance es **"lo suyo"** (ver plano
    por persona). Un integrante con grant en un proceso **no** ve todos los registros del proceso.
- **Plano por persona** ("lo suyo" del integrante): `DailyLog`/`WeeklyReport` por `authorUserId =
  actor.userId`; `Commitment` por `assignedUserId = actor.userId OR responsibleUserId = actor.userId`;
  `Issue` por `reportedByUserId = actor.userId OR resolverUserId = actor.userId`; `Meeting` por
  participación (`participants.some(userId = actor.userId)`) **o** `responsibleUserId = actor.userId`
  (specs/10 "Reuniones: Participar").

El `where` efectivo del integrante es el plano por persona; el del líder es el plano por proceso de
sus procesos LIDER; el del jefe es vacío (área). El helper expone:
`scopeWhere<Entity>(actor): Prisma.<Entity>WhereInput` por entidad, construido con `OR`/`in` según el
rol (como `audit.service.ts`). **Fuera de alcance → 404** (`findFirst` con el `where` de alcance; si
no matchea, `NotFoundException`); **rol insuficiente → 403** (lo da `RolesGuard` cuando el módulo no
está habilitado — pero `log`/`meeting` están habilitados para los tres roles, §2.7, así que el 403 en
Fase 5 aplica a acciones concretas restringidas, no al módulo).

> **Lección 1 aplicada literalmente.** El líder se detecta por `actor.grants.filter(g => g.roleCode
> === RoleCode.LIDER_PROCESO)`, **no** por `scopedProcessIds` (que incluye también procesos donde el
> actor es solo integrante). Un integrante con grant en FIBI gestiona/ve **solo sus** diarios y
> compromisos, nunca los de otros integrantes de FIBI.
>
> **Compartir código con `request` (opcional, no requerido).** Si en el futuro se quisiera unificar el
> alcance por proceso con `request`, habría que **extraer** la lógica de `request.service.scopeWhere` a
> un helper **público** y **corregirla a `LIDER_PROCESO`** (hoy usa `scopedProcessIds`); mientras tanto,
> `CoordinationScopeService` **no** depende de `request`. Esta refactorización de `request` queda **fuera
> de alcance** de Fase 5 (no se toca Fase 2).

> **Alcance VER vs EDITAR del líder/jefe (resuelve Finding 2).** En DailyLog/WeeklyReport, el plano por
> proceso del líder/jefe es de **lectura** (specs/10 "Bitácoras: Revisar trabajo del proceso"): el líder
> **ve** los diarios/semanales de su(s) proceso(s), pero **crea/edita solo los propios** (plano por
> persona en escritura). Es decir: `GET`/detalle usan el plano por proceso para líder/jefe; `POST`/`PATCH`/
> `DELETE`/`submit` de un diario o semanal exigen que el actor sea el **autor** (`authorUserId =
> actor.userId`), salvo el jefe de área (que puede editar en su área). Que el líder pueda **editar** el
> diario/semanal de un integrante de su proceso es `P` (no confirmado por el Site): por defecto **no** se
> permite (reversible, §11 D13). La marca `REVISADO` del diario queda `P` y **no se expone** en esta
> entrega (ver §4 y Finding 7).

### 2.3 Reglas de clasificación de actividad (BR-014 / AC-014/015/016), server-side

Validadas en `WorklogService` por cada `DailyLogActivity`, tanto al **guardar borrador** como al
**enviar** (el brief dice "guardar/enviar sujeto a clasificación"; se aplica en ambos para no persistir
una actividad inválida). Reacción al fallo → **400** con mensaje específico (AC-031: conserva la
entrada; el frontend no resetea):

| `classificationCode` | Regla server-side | Falla → |
|---|---|---|
| `PLANIFICADA` | requiere `projectRequestId` **O** `taskId` (al menos uno) | 400 "Trabajo planificado requiere proyecto o tarea" (AC-014) |
| `SOPORTE` | requiere `assetRef` no vacío (activo como texto, §11 D3) | 400 "Operación/soporte requiere activo" (AC-015) |
| `INTERNA` | referencia **opcional** (ninguna obligatoria) | — |
| `EXTRAORDINARIA` | requiere `requesterRef` **Y** `justification` no vacíos | 400 "Extraordinaria requiere solicitante y justificación" (AC-016) |

`classificationCode` debe existir en `ACTIVITY_CLASS` (si no → 400). `hours` es **opcional** y, si se
informa, `>= 0` (entero); en borrador puede ir sin horas (Finding 4; "horas requeridas al enviar" es
`P`, §11 D11). Las referencias que **sí** apuntan a entidades (`projectRequestId`, `taskId`,
`relatedIssueId`) se validan **en visibilidad** con los `where` concretos documentados en §1.2 (bloque
"`where` de alcance de cada FK"), con las correcciones de los findings HIGH-1/HIGH-2/MEDIUM-1:
`projectRequestId` vía `requestVisibilityWhere(actor)` = `{ mainProcessId: { in: scopedProcessIds } }`
(**TODOS los grants**, la visibilidad real de Request de Fase 2, NO el plano líder-only de §2.2);
`taskId` vía **traversal por pasos** `Task → phase.planId → Plan.requestId → Request` replicando
`requireTaskInScope` (porque `Task` no tiene relación `request`); `relatedIssueId` vía las novedades
**del proceso del diario** (`processId: dailyLog.processId`), no por persona. Si la referencia no cae
en esa visibilidad → **404** (no existe para él). El `assetRef`/`requesterRef` son texto libre (no se
valida contra una tabla; §11 D3).

### 2.4 Separación de conceptos (CRÍTICO · BR-013/015/023)

- **Horas de bitácora = dedicación.** `DailyLogActivity.hours` **nunca** se escribe en
  `Task.estimateHours`, `Task.progress` ni `Task.accepted`. El `WorklogService` **no importa** ni
  llama a ningún método de `plan`/`TaskService` que mute la tarea. Referenciar una `taskId` desde una
  actividad es **solo un vínculo de lectura** (BR-013; US-008). Se añade una **prueba unit** que
  verifica que crear/editar actividades con `taskId` no cambia la tarea (§6).
- **Enviar bitácora/semanal = revisión, no autoriza nada.** `submitDailyLog` /`submitWeeklyReport`
  solo cambian `status` a `ENVIADO` y fijan `submittedAt`; **no** tocan `Request.operationalState`,
  prioridad, `Approval` ni `Commitment` (BR-023). No hay ninguna llamada a `request-state.service` ni
  a aprobaciones desde `coordination`.
- **El semanal consolida solo enviados/revisados; propuestas no mutan.** §2.5.

### 2.5 Consolidación del semanal (BR-015 / AC-017 / AC-018)

El detalle `GET /weekly-reports/:id` **incluye** los conteos de consolidación (NO hay endpoint
`/consolidation` separado — NIT-3): calcula **por lectura** los
conteos del semanal a partir de los `DailyLog` cuyo `authorUserId` y `processId` son **los del
`WeeklyReport` objetivo** (NO los del actor), cuya `date` cae en la semana `[weekStart, weekStart+6]`
**y** cuyo `status ∈ {ENVIADO, REVISADO}` (BR-015/AC-017). Es decir: cuando un líder abre el semanal de
un integrante de su proceso (lectura permitida, §2.2), la consolidación agrega los diarios **del autor
del semanal**, no los del líder. Conteos
derivados (no persistidos): número de diarios elegibles, número de actividades, suma de horas, número
de actividades `EXTRAORDINARIA`. Si no hay diarios elegibles → se devuelve el conteo en cero y la UI
**advierte** "sin bitácoras de respaldo" (SCR-11). Un diario en `BORRADOR` **no** entra. `proposals`/
`commitmentsText` son texto: el envío del semanal **no** crea `Commitment` ni cambia prioridad
(AC-018); se añade prueba unit que lo verifica (§6).

> **"REVISADO" (resuelve Finding 7).** El brief cita "enviados/revisados". `REVISADO` es un estado de
> la **máquina mínima de revisión del diario** (§4), cuya transición exacta `06` marca `P`. Para no
> inventar una transición que el Site no confirma, se **modela** el enum `DailyLogStatus = BORRADOR |
> ENVIADO | REVISADO` y la consolidación **acepta ambos** `ENVIADO`/`REVISADO` (así, si el Site añade
> `REVISADO` más adelante, AC-017 ya lo cuenta), pero en **esta entrega solo se implementa**
> `BORRADOR→ENVIADO` (acción `/submit`). La acción `/worklog/daily/:id/review` (`ENVIADO→REVISADO`)
> **NO se expone**: queda como `P` documentado (§4). AC-017 se cumple hoy con los diarios `ENVIADO`,
> sin exponer transición inventada ni la devolución `ENVIADO→BORRADOR` (también `P`).

### 2.6 Personas en alcance (para selectores)

`GET /coordination/people` devuelve las personas que el actor puede referenciar como
participante/responsable/asignado, reutilizando la lógica de Fase 4 (`/capacity/people`): jefe → área;
líder → personas con grant en sus procesos LIDER; integrante → él mismo (y, para participar en
reuniones, la lista se limita a su alcance). No se expone `/users` (solo jefe en Fase 1).

### 2.7 Autorización de módulo (specs/10)

Las claves `log`, `meeting`, `assigned` ya están en `MODULE_MATRIX` habilitadas para los **tres**
roles. Los controllers usan `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)` + `CurrentUserGuard` +
`RolesGuard` (patrón capacity). La diferencia real de qué ve/toca cada rol se aplica por **alcance en
el service** (§2.2), no por el guard. Las acciones que escriben (crear/editar/enviar un diario o
semanal) se restringen al **autor** dentro del service (líder/jefe no editan lo del integrante por
defecto, §2.2/§11 D13 — 403/404 si otro intenta). La marca `REVISADO` del diario (acción de líder/jefe)
**no se expone** en esta entrega (`P`, §3/§4); cuando se exponga, se verificará por `roleCode` → 403 si
integrante.

---

## 3. API REST + OpenAPI

Todos bajo `apps/api/src/modules/coordination/`. Patrón capacity: `@ApiTags`, `@ApiOperation`,
`@ApiResponse`, DTOs request (class-validator) + response separados. POST→201, PATCH→200+DTO,
DELETE→204 sin body.

### Worklog (bitácora diaria + semanal) — `WorklogController`

| Método | Ruta | Acción | Alcance / códigos |
|---|---|---|---|
| GET | `/worklog/daily` | listar diarios (filtros `date?`, `processId?`, `authorUserId?`) | alcance §2.2; 200 |
| POST | `/worklog/daily` | crear diario (cabecera) | 201 / 400 / 404 proceso / 409 duplicado (persona+proceso+fecha) |
| GET | `/worklog/daily/:id` | detalle diario + actividades | 404 fuera de alcance |
| PATCH | `/worklog/daily/:id` | editar cabecera (notas) | 200 / 404 |
| DELETE | `/worklog/daily/:id` | borrar diario (cascade actividades) | 204 / 404 |
| POST | `/worklog/daily/:id/submit` | **enviar a revisión** (`BORRADOR→ENVIADO`) | 200 / 404 / 409 estado |
| POST | `/worklog/daily/:id/activities` | agregar actividad (valida clasificación §2.3) | 201 / 400 / 404 |
| PATCH | `/worklog/activities/:id` | editar actividad | 200 / 400 / 404 |
| DELETE | `/worklog/activities/:id` | borrar actividad | 204 / 404 |
| GET | `/weekly-reports` | listar semanales (filtros `weekStart?`, `processId?`) | alcance §2.2; 200 |
| POST | `/weekly-reports` | crear semanal (ancla lunes) | 201 / 400 / 404 / 409 duplicado |
| GET | `/weekly-reports/:id` | detalle + consolidación (conteos §2.5) | 404 |
| PATCH | `/weekly-reports/:id` | editar secciones | 200 / 404 |
| POST | `/weekly-reports/:id/submit` | enviar a revisión | 200 / 404 / 409 |
| GET | `/coordination/people` | personas en alcance (selectores) | 200 / 403 |

> **`/worklog/daily/:id/review` NO se expone en esta entrega (Finding 7).** La transición
> `ENVIADO→REVISADO` queda `P`: cuando el Site confirme el ciclo de revisión/devolución, se agrega la
> ruta (restringida a líder/jefe en alcance, 403 integrante) sin cambiar el modelo (el enum ya la
> contempla). Hoy solo existe `/submit` (`BORRADOR→ENVIADO`).

### Issue (novedades) — `IssueController`

| Método | Ruta | Acción | Códigos |
|---|---|---|---|
| GET | `/issues` | listar (filtros `state?`, `typeCode?`, `processId?`) | alcance; 200 |
| POST | `/issues` | crear (tipo por defecto `BLOQUEO`) | 201 / 400 / 404 |
| GET | `/issues/:id` | detalle | 404 |
| PATCH | `/issues/:id` | editar (un registro por incidente, AC-019) | 200 / 400 / 404 |
| POST | `/issues/:id/transition` | transición de estado (§4, body `{ toState }`) | 200 / 400 estado inválido / 404 |
| DELETE | `/issues/:id` | borrar (solo autor/líder/jefe en alcance) | 204 / 403 / 404 |

### Meeting (reuniones) — `MeetingController`

| Método | Ruta | Acción | Códigos |
|---|---|---|---|
| GET | `/meetings` | listar (filtros `processId?`, `state?`) | alcance; 200 |
| POST | `/meetings` | crear (estado inicial `BORRADOR`; participantes) | 201 / 400 / 404 |
| GET | `/meetings/:id` | detalle + participantes | 404 |
| PATCH | `/meetings/:id` | editar (incluye set de participantes) | 200 / 400 / 404 |
| DELETE | `/meetings/:id` | borrar (cascade participantes) | 204 / 403 / 404 |

### Commitment (compromisos) — `CommitmentController`

| Método | Ruta | Acción | Códigos |
|---|---|---|---|
| GET | `/commitments` | listar (filtros `state?`, `processId?`, `assignedUserId?`) | alcance; 200 |
| POST | `/commitments` | crear (vencimiento req.; reunión fuente opcional) | 201 / 400 / 404 |
| GET | `/commitments/:id` | detalle | 404 |
| PATCH | `/commitments/:id` | editar | 200 / 400 / 404 |
| POST | `/commitments/:id/transition` | transición de estado (§4) | 200 / 400 / 404 |
| DELETE | `/commitments/:id` | borrar | 204 / 403 / 404 |

Tras implementar: **regenerar OpenAPI** (el app ya expone el documento Swagger) y el **api-client**
con el comando del repo (`npm run generate:api-client` o equivalente ya cableado en Fases 1–4; se usa
el mismo). No se cambia el contrato de endpoints previos.

### 3.4 DTOs destacados (validación de entrada externa)

- `CreateDailyLogDto`: `processId` (UUID req.), `date` (`@Matches(/^\d{4}-\d{2}-\d{2}$/)` req.),
  `dayNotes?` (string ≤ 2000). Autor = `actor.userId` (no se acepta del body salvo líder/jefe creando
  para un integrante en alcance — §11 D10, reversible: por defecto solo el propio).
- `CreateActivityDto`: `classificationCode` (`@IsIn(ACTIVITY_CLASS codes)` req.), `hours`
  (**`@IsOptional @IsInt @Min(0)`** — opcional; columna `@default(0)`; Finding 4),
  `projectRequestId?`/`taskId?`/`relatedIssueId?` (UUID), `assetRef?`/`requesterRef?`/
  `justification?`/`description?`/`result?`/`nextStep?` (string), `nextStepDate?` (fecha), `evidenceUrl?`
  (**`@IsOptional @IsString`, `@MaxLength(2000)`, SIN `@IsUrl`** — texto libre coherente con el activo
  como texto, D3; endurecer a URL/FK `Document` es `P`, MEDIUM-3), `activityStatus?`. Las reglas condicionales por clasificación se validan en el service
  (§2.3), no solo en el DTO, porque dependen de la combinación de campos. "Horas requeridas al enviar"
  es `P` (§11 D11): hoy no se exige ni al enviar.
- `CreateWeeklyReportDto`: `processId` (UUID req.), `weekStart` (fecha `YYYY-MM-DD` req., **cualquier
  día de la semana**). El service **siempre deriva** `weekStart = lunes ISO de la semana de la fecha
  recibida** antes de persistir/buscar duplicado; **nunca** responde 400 por no-lunes (Finding 3,
  §11 D8). Secciones de texto opcionales. Así el `@@unique([authorUserId, processId, weekStart])` es
  efectivo por semana (dos envíos de la misma semana con fechas distintas normalizan al mismo lunes y
  colisionan → 409).
- `CreateIssueDto`: `processId` req., `date` req., `typeCode?` (default `BLOQUEO`, `@IsIn ISSUE_TYPE`),
  `title` req., relaciones opcionales, etc.
- `CreateMeetingDto`: `processId` req., `title` req., `meetingDate` req., `meetingTime?`
  (`@Matches(/^\d{2}:\d{2}$/)`), `participantUserIds?: string[]` (UUID[]), demás opcionales.
- `CreateCommitmentDto`: `processId` req., `title` req., `dueDate` req., `sourceMeetingId?`,
  `assignedUserId?`, `responsibleUserId?`, demás opcionales.
- `TransitionDto`: `{ toState: string }` validado contra la máquina mínima (§4) en el service.

Fechas: patrón `YYYY-MM-DD` en DTO (`@Matches(/^\d{4}-\d{2}-\d{2}$/)`); el service convierte a `Date`
UTC con helper `dateStringToDate`, generalizado del `monthStringToDate` de Fase 4 (`capacity/month.ts`,
`new Date(Date.UTC(y, m-1, d))`). **Finding 6:** el regex por sí solo acepta fechas irreales
(`2025-13-40`), así que `dateStringToDate` **revalida con round-trip** (`dateToString(dateStringToDate(x))
=== x`, usando `getUTCFullYear/Month/Date`) y lanza **400** si no coincide (mes 13–99, día fuera de
rango, 30 de febrero, etc.). Se añaden las dos funciones puras `dateStringToDate`/`dateToString` con su
`date.spec.ts` espejo de `month.spec.ts` (§6). El contrato externo nunca expone un `DateTime` con zona.
`weekStart` reutiliza `dateStringToDate` y luego aplica la normalización al lunes ISO (§D8).

---

## 4. Máquinas de estado mínimas (implementadas vs solo modeladas, todas REVERSIBLES)

Los nombres/transiciones exactos son `P` (`06`, `28` p.3). Se implementan **máquinas mínimas**
mapeadas a la maestra `RECORD_STATE` (§1.7), con un **helper por entidad** (`WorkflowStateService`
análogo a `PlanStateService` de Fase 3) que valida la transición solicitada contra un grafo de
transiciones permitidas; cualquier salto no permitido → **400**. Todas son **reversibles** (se puede
reabrir), para no fijar una terminal que el Site no confirma.

**DailyLog (`DailyLogStatus`, IMPLEMENTADA parcial · Finding 7):**
```
BORRADOR ──(submit)──> ENVIADO ╌╌(review, P: NO expuesto)╌╌> REVISADO
   ^                              │
   └────(P: devolución NO implementada)
```
**Implementada en esta entrega:** solo `BORRADOR→ENVIADO` (acción `/submit`, cualquier rol sobre su
**propio** diario). **NO implementadas (P):** `ENVIADO→REVISADO` (la ruta `/worklog/daily/:id/review`
**no se expone**; el estado `REVISADO` se **modela** en el enum y la consolidación lo acepta, pero no
hay transición que lo produzca todavía) y la devolución `ENVIADO→BORRADOR` (transición exacta `P`).
Ambas quedan como hueco documentado y reversible: el enum y la consolidación ya las contemplan, de modo
que exponerlas luego no cambia el modelo.

**WeeklyReport (IMPLEMENTADA):** `BORRADOR → ENVIADO` (acción `/submit`). Sin más estados (el semanal
no aprueba nada, BR-015).

**Issue (modelada sobre `RECORD_STATE`, IMPLEMENTADA mínima reversible):**
```
EN_CURSO (abierto) ──> BLOQUEADO ──> COMPLETADO (resuelto) ──> ARCHIVADO (cerrado)
   ^            ^__________________________│                        │
   └──────────────────(reabrir)───────────────────────────────────┘
```
Transiciones permitidas (grafo en el helper, **reversible**): `EN_CURSO↔BLOQUEADO`,
`EN_CURSO→COMPLETADO`, `BLOQUEADO→COMPLETADO`, `COMPLETADO→ARCHIVADO`, y **reapertura**
`COMPLETADO→EN_CURSO`, `ARCHIVADO→EN_CURSO`. Cierre/reapertura exactos y requeridos de resolución son
`P` (§11 D5): no se exige `resolution` para completar (reversible: se puede endurecer).

**Commitment (modelada sobre `RECORD_STATE`, IMPLEMENTADA mínima reversible):** mismo grafo que Issue
(`EN_CURSO`/`BLOQUEADO`/`COMPLETADO`/`ARCHIVADO`, reversible). Catálogo/transiciones exactos `P`
(§11 D7).

**Meeting (solo MODELADA, no máquina de transición):** estado inicial `BORRADOR`; otros estados de
`RECORD_STATE` se pueden fijar por PATCH libre dentro de alcance **sin** grafo de transición
(publicación de acta es `P`, §11 D6). Se documenta como reversible: si el Site confirma un ciclo
(Borrador→Publicada→…), se añade el helper como en Issue.

---

## 5. Frontend (apps/web, solo vía api-client)

Convierte placeholders y crea las rutas que falten. **Solo** consume el api-client regenerado; nunca
Prisma/PostgreSQL. Cada pantalla con estados **loading / vacío / error / éxito** y **AC-031**
(conserva valores ante error, resetea solo en éxito). Campos **condicionados por clasificación** en el
diario; **horas rotuladas como "dedicación"** con nota de que no afectan el avance de la tarea
(BR-013).

| SCR | Ruta App Router | Estado actual | Acción |
|---|---|---|---|
| SCR-10 | `apps/web/src/app/seguimiento/bitacora/page.tsx` | placeholder `UnderConstruction` | **Registro diario real**: lista de diarios + editor de cabecera + líneas de actividad con campos condicionados por `classificationCode`; botones Guardar borrador / Enviar a revisión; total de horas (dedicación) del día |
| SCR-11 | `apps/web/src/app/seguimiento/semanal/page.tsx` | **no existe** | **crear**: Registro semanal con selector de lunes + proceso; conteos consolidados (solo diarios enviados/revisados); secciones de texto; aviso "sin respaldo"; enviar |
| SCR-12 | `apps/web/src/app/seguimiento/novedades/page.tsx` | **no existe** | **crear**: lista + ficha de novedad; tipo por defecto Bloqueo; un registro por incidente; acción de transición de estado |
| SCR-13 | `apps/web/src/app/seguimiento/reuniones/page.tsx` | placeholder `UnderConstruction` | **Reuniones real**: lista + formulario (título, fecha, hora, participantes del alcance, agenda, decisiones) |
| SCR-14 | `apps/web/src/app/seguimiento/compromisos/page.tsx` | **no existe** | **crear**: lista + formulario de compromiso (título, vencimiento, asignado, reunión fuente opcional); transición de estado |

**Navegación** (`apps/web/src/lib/navigation.ts`): el grupo "Seguimiento" ya tiene `Bitacora`
(`/seguimiento/bitacora`, `log`) y `Reuniones` (`/seguimiento/reuniones`, `meeting`). Se **añaden solo
las que faltan**, sin romper las existentes:
- `{ href: '/seguimiento/semanal', label: 'Semanal', moduleKey: 'log' }`
- `{ href: '/seguimiento/novedades', label: 'Novedades', moduleKey: 'log' }`
- `{ href: '/seguimiento/compromisos', label: 'Compromisos', moduleKey: 'meeting' }`

(`log`/`meeting` ya están en `ModuleKey` y en `MODULE_MATRIX` para los tres roles; no se agregan claves
nuevas.) El menú se filtra por `allowedModules` como ya ocurre; el control real es server-side.

El diario condiciona campos por `classificationCode` en el cliente **solo como UX** (muestra
proyecto/tarea para planificada, activo para soporte, solicitante+justificación para extraordinaria);
la validación **autoritativa** es el 400 del backend (§2.3), que la UI muestra conservando lo tecleado.

---

## 6. Plan de pruebas unitarias (Jest, apps/api)

Siguiendo el patrón `capacity.service.spec.ts` / `request.service.spec.ts` (mock de `PrismaService` y
`AuditService`; se verifica el `where` construido y la llamada a `audit.record`). Mínimo requerido:

**Clasificación de actividad (§2.3, BR-014):**
- planificada sin proyecto ni tarea → 400 (AC-014); con proyecto O tarea → ok.
- soporte sin `assetRef` → 400 (AC-015); con `assetRef` → ok.
- interna sin referencias → ok.
- extraordinaria sin solicitante o sin justificación → 400 (AC-016); con ambos → ok.
- `classificationCode` fuera de `ACTIVITY_CLASS` → 400.
- **(Finding 4) actividad en borrador sin `hours`** → se persiste con `hours = 0` (no 400).
- **(HIGH-2) `projectRequestId` de una Request visible por el integrante vía `scopedProcessIds`** (grant
  integrante en su `mainProcessId`) → **OK** (no 404); Request de un proceso sin grant → 404. Se verifica
  que el `where` usa `scopedProcessIds`, **no** `leaderProcessIds` (evita el regreso del bug AC-014).
- **(HIGH-1) `taskId` fuera de visibilidad** → 404 por el traversal `phase.plan.request` (se mockea
  `task.findFirst`/`plan.findFirst`/`request.findFirst`); `taskId` cuya Request es visible → OK. Verifica
  que NO se usa un `where: { request: {…} }` sobre `task` (que no compilaría).
- **(MEDIUM-1) `relatedIssueId` de una novedad del mismo proceso del diario** no reportada ni resuelta por
  el integrante → **OK** (se valida por `processId: dailyLog.processId`); novedad de otro proceso → 404.

**Separación de conceptos (§2.4, BR-013/023) — crítico:**
- crear/editar actividad con `taskId` **no** invoca ningún método que mute `Task` (se verifica que el
  mock de task no se llama / que no hay dependencia a `plan`).
- `submitDailyLog` solo cambia `status`/`submittedAt`; no toca Request/Approval/Commitment.
- enviar semanal con `proposals`/`commitmentsText` **no** crea `Commitment` ni muta prioridad (AC-018).

**Consolidación semanal (§2.5, BR-015/AC-017):**
- consolidación incluye solo diarios `ENVIADO`/`REVISADO` del proceso+autor en la semana; excluye
  `BORRADOR` y los fuera de rango.
- sin diarios elegibles → conteos en cero (bandera "sin respaldo").
- **(Finding 2) líder consolida el semanal de un integrante de su proceso: la consolidación usa
  `authorUserId`/`processId` del `WeeklyReport` objetivo, no los del líder** (verifica el `where` de los
  diarios agregados).

**Normalización de `weekStart` (§3.4, Finding 3):**
- `CreateWeeklyReportDto` con fecha miércoles → se persiste/busca duplicado con el **lunes ISO** de esa
  semana (nunca 400 por no-lunes).
- dos semanales de la misma semana con fechas distintas (ambas normalizan al mismo lunes) → segundo 409.

**Helper de fecha `dateStringToDate` (§3.4, Finding 6):** `date.spec.ts` espejo de `month.spec.ts`:
`2025-02-10` round-trip ok; `2025-13-40`, `2025-02-30`, `2025-00-10` → 400; `dateToString(dateStringToDate(x)) === x`.

**Alcance por rol (§2.2, lección 1, AC-025/026):**
- integrante: `where` de diarios = `authorUserId = él`; no ve diarios de otro integrante del mismo
  proceso (se verifica el `where`, no `scopedProcessIds`).
- líder: `where` por `processId ∈ grants LIDER`; recurso de otro proceso → 404.
- jefe: `where` vacío (área).
- integrante accediendo a `:id` ajeno → 404 (no filtra).

**Máquinas de estado (§4):**
- Issue: transición permitida ok; salto no permitido → 400; reapertura `COMPLETADO→EN_CURSO` ok.
- DailyLog: `BORRADOR→ENVIADO` ok; segundo `/submit` sobre un diario ya `ENVIADO` → 409 estado;
  `/submit` sobre diario ajeno → 404. (No hay test de `/review`: la ruta no se expone, Finding 7.)
- Commitment: grafo igual que Issue.

**Auditoría (§1.6, lección 2/3):**
- cada mutación llama `audit.record(tx, …)` con el `objectType` correcto y `scopeProcessId = proceso
  del registro` (actividad toma el del padre).
- test de contrato: cada `objectType` nuevo de `AuditObjectType` está también en `OBJECT_TYPES` del
  DTO (se puede verificar comparando ambos arrays en un spec, para prevenir la regresión de la lección
  2).

**Duplicados / 409:**
- segundo diario para (autor, proceso, fecha) → P2002 → 409.
- segundo semanal para (autor, proceso, lunes) → 409.

Además, los specs de módulo existentes (`*.module.spec.ts`) se replican para el nuevo módulo
`coordination` (que compila e inyecta sus services/controllers). Se ejecuta `npm run test` y
`npm run build` en `apps/api`, y `npm run typecheck`/`build` en `apps/web`, antes de dar por terminado
(verificación obligatoria del steering).

---

## 11. DECISIONES de diseño (todo lo `P`, reversible)

- **D0 — Módulo `coordination` con 4 controllers/services.** Agrupa worklog/issue/meeting/commitment
  para compartir el scope y la auditoría (ver §"Organización"). Reversible: se puede dividir en
  módulos si crece.
- **D1 — DailyLog 1:N DailyLogActivity.** SCR-10/`08` "varias actividades por día". Reversible a plano
  solo si el Site lo contradice (no lo hace).
- **D2 — `@@unique([authorUserId, processId, date])` en DailyLog.** Un diario por persona/proceso/día
  (coherente con "cabecera de proceso y fecha"). Reversible: si el Site permite varios diarios por día
  se quita el unique. Es compuesto → usable como `where` (§1.1).
- **D3 — "Activo" como texto `assetRef` requerido para soporte, sin `Asset`.** FEATURE-007 está fuera
  de alcance; el brief pide representar el activo como **texto requerido**. Gancho de migración:
  cuando Fase 7 cree `Asset`, se añade `assetId String? @db.Uuid` FK conviviendo con `assetRef`, se
  migran los textos que casen por nombre y se endurece la validación de soporte a exigir `assetId`.
  Igual para `relatedAssetRef` de Issue. Reversible/evolutivo.
- **D4 — Semanal ancla al lunes; consolida solo ENVIADO/REVISADO.** BR-015/AC-017. La normalización
  "qué es el lunes" depende de zona horaria (`P`): se usa UTC y se ancla al lunes ISO (§D8).
  Reversible.
- **D5 — Issue: un registro por incidente; estado mapeado a `RECORD_STATE`.** AC-019. Los nombres
  "abierto/en seguimiento/resuelto/cerrado" del brief son conceptos; se implementan con los códigos
  reales `EN_CURSO/BLOQUEADO/COMPLETADO/ARCHIVADO` para no inventar un catálogo paralelo. Cierre/
  reapertura exactos y requeridos de resolución `P`: máquina mínima reversible (§4), no se exige
  `resolution` para completar.
- **D6 — Meeting: estado inicial Borrador; acta/notificación/asistencia/compromiso-auto NO
  implementados.** SCR-13/`06`/`28` p.3. Reversible: ganchos listos (`sourceMeetingId` en Commitment,
  `state` en Meeting).
- **D7 — Commitment: vencimiento requerido, reunión fuente opcional, sin auto-creación.** SCR-14/`08`.
  Catálogo/transiciones `P`: máquina mínima reversible mapeada a `RECORD_STATE`.
- **D8 — Fechas `DateTime @db.Date` UTC; contrato `YYYY-MM-DD`; hora como texto `HH:mm`; `weekStart`
  siempre al lunes ISO.** La zona Colombia y los cortes de semana son `P` (`28` p.9): se evita arrastrar
  zona horaria usando `@db.Date` y guardando la hora como texto. El semanal **siempre** deriva
  `weekStart = lunes ISO de la semana de la fecha recibida` (idempotente); **nunca** responde 400 por
  no-lunes (Finding 3). `dateStringToDate` revalida la fecha con round-trip (400 si irreal, Finding 6).
  Reversible: si el Site fija zona o cambia el ancla de semana, se cambia la normalización del helper sin
  tocar el contrato.
- **D9 — `activityStatus` de la actividad = texto/`RECORD_STATE` opcional.** SCR-10 lista "estado" de
  la actividad; su catálogo exacto es `P`. Se deja opcional, validable contra `RECORD_STATE` si se
  informa; no bloquea. Reversible.
- **D10 — Autor del diario = el propio actor por defecto.** specs/10 "Bitácoras: Propias"
  (integrante). Líder/jefe creando un diario para un integrante en alcance es `P`: por defecto el
  autor es el actor; se deja el gancho (DTO podría aceptar `authorUserId` validado en alcance).
  Reversible.
- **D11 — `hours` opcional (`@default(0)`); "horas requeridas al enviar" es `P` (Finding 4).** SCR-29
  marca "límites de horas" pendiente y `08` no la lista requerida. Se persiste `0` por defecto para no
  romper el guardado de borrador ni AC-031. Reversible: si el Site confirma horas obligatorias, se
  endurece la validación al enviar (como `resolution` de Issue).
- **D12 — "proyecto" = `Request` (`projectRequestId`), `P` reversible.** No hay entidad
  `Project` en Fases 1–4; el "proyecto" del dominio actual es una `Request`. Gancho: si FEATURE-010 crea
  `Project`, se añade `projectId` conviviendo con `projectRequestId`. La **validación de FK** de cada
  referencia está corregida en §1.2/§2.3 tras HIGH-1/HIGH-2/MEDIUM-1: Request por `requestVisibilityWhere`
  (= `{ mainProcessId: { in: scopedProcessIds } }`, la visibilidad **real** de Request de Fase 2, no el
  plano líder-only); Task por **traversal `phase.plan.request`** (no tiene relación `request`); Issue
  relacionada por el **proceso del diario**. Esta visibilidad de referencia es independiente del plano de
  alcance de las entidades propias de Fase 5 (§2.2).
- **D13 — Líder/jefe: lectura por proceso, escritura por persona (Finding 2).** El líder **ve** los
  diarios/semanales de su(s) proceso(s) pero **crea/edita solo los propios**; que el líder edite el
  diario/semanal de un integrante es `P` (por defecto no permitido). El jefe de área puede editar en su
  área. La consolidación semanal usa el autor/proceso del `WeeklyReport` objetivo. Reversible.

---

## 12. Checklist de "no inventar" (brief / `28` p.3 y 9)

- Transiciones exactas de revisión/devolución de bitácora → **no implementadas** (solo
  `BORRADOR→ENVIADO` y opcional `→REVISADO`); devolución es hueco documentado (§4).
- Cierre/reapertura exactos de novedades → máquina mínima reversible, sin requeridos duros (§4/§11 D5).
- Publicación de acta de reunión → **no implementada** (§11 D6).
- Creación automática de compromisos desde reunión → **no implementada** (§11 D7).
- Catálogo/transiciones exactos de compromiso → máquina mínima reversible (§4/§11 D7).
- Zona horaria / cortes de semana → UTC + `@db.Date` + hora texto, documentado reversible (§11 D8).
- Activos/Documentos reales (FEATURE-007), Frameworks (FEATURE-008), Portafolio/dashboard
  (FEATURE-010) → **no se tocan**; activo = texto (§11 D3).
- Comandos del repo, pantallas de Fases 1–4 y `/catalogs` → **intactos**.

---

## 13. Respuestas al design-review (`design-review.json`, veredicto CHANGES_REQUESTED)

Verifiqué cada hallazgo contra el código real antes de responder: `request/request.service.ts`
(`scopeWhere` **es `private`** y usa `actor.scopedProcessIds`), `capacity/capacity-scope.service.ts`
(filtra `grants` por `RoleCode.LIDER_PROCESO` — patrón correcto), `capacity/month.ts` +
`capacity/month.spec.ts` (helper de fecha a generalizar). Todos los hallazgos se **abordan** (ninguno se
backloguea ni se ignora), porque todos son coherentes con los requisitos.

**F1 (HIGH) — "reutiliza `scopeWhere` de `request.service.ts`" era incorrecto. RESUELTO.**
Confirmado: ese método es `private` (no importable) y filtra por `scopedProcessIds` (todos los grants),
contradiciendo la lección 1. Reescrita §2.2: `CoordinationScopeService` **construye su propio `where`
por rol** replicando `capacity-scope.service.ts` (`actor.grants.filter(g => g.roleCode ===
RoleCode.LIDER_PROCESO)`), con el snippet `leaderProcessIds`. Añadida nota de que compartir código con
`request` exigiría extraer un helper público corregido a `LIDER_PROCESO` y queda **fuera de alcance** de
Fase 5. El test de alcance (§6) verifica el `where` por `authorUserId`/`leaderProcessIds`, no por
`scopedProcessIds`.

**F2 (MEDIUM) — consolidación por "autor" ambigua + ver/editar del líder. RESUELTO.**
§2.5 ahora fija que la consolidación usa `authorUserId` y `processId` **del `WeeklyReport` objetivo**
(no del actor). §2.2 añade la regla **lectura por proceso / escritura por persona** para líder/jefe (el
líder ve pero no edita lo del integrante; editar lo ajeno es `P`, §11 D13). Añadido el caso de prueba
"líder consolida el semanal de un integrante de su proceso" (§6).

**F3 (MEDIUM) — `weekStart` "rechaza o ajusta" (dos contratos). RESUELTO.**
Elegido **normalizar siempre al lunes ISO** en el service antes de persistir/buscar duplicado; **nunca**
400 por no-lunes. Reescritos §3.4 y §11 D8 sin el "o". Añadidos tests de normalización y de colisión
409 por misma semana (§6). Esto hace efectivo el `@@unique([authorUserId, processId, weekStart])`.

**F4 (MEDIUM) — `hours` requerido más fuerte que lo observado. RESUELTO.**
`hours` pasa a `Int @default(0)` en la columna y `@IsOptional @IsInt @Min(0)` en `CreateActivityDto`
(§1.2, §2.3, §3.4). "Horas requeridas al enviar" se marca `P` reversible (§11 D11), igual que
`resolution` de Issue. Añadido test de borrador sin horas → `0` (§6).

**F5 (MEDIUM) — "proyecto"=Request sin justificar + `where` de alcance de FK sin trazar. RESUELTO.**
§1.2 justifica el mapeo "proyecto"=`Request` (no hay `Project` en Fases 1–4) y lo marca `P` reversible
con gancho a FEATURE-010 (§11 D12). Añadido el bloque "`where` de alcance de cada FK": Request vía
`mainProcessId`, Task vía `request.mainProcessId`, Issue vía su `scopeWhere` de §2.2; fuera de alcance →
404. §2.3 lo referencia. Añadido test de FK fuera de alcance → 404 (§6).

**F6 (NIT) — regex de fecha acepta fechas irreales. RESUELTO.**
§3.4 especifica que `dateStringToDate` **revalida con round-trip** (`dateToString(dateStringToDate(x))
=== x`) y lanza 400 para `2025-13-40`, `2025-02-30`, etc.; se añade `date.spec.ts` espejo de
`month.spec.ts`. Casos agregados a §6.

**F7 (NIT) — implementar `ENVIADO→REVISADO` roza "no inventar". RESUELTO.**
Se mantiene el enum `BORRADOR|ENVIADO|REVISADO` y la consolidación acepta ambos, pero **no se expone**
`/worklog/daily/:id/review` en esta entrega: la transición queda `P` documentada (§2.5, §3, §4). AC-017
se cumple con diarios `ENVIADO`. Eliminada la ruta de la tabla de endpoints y el test de `/review`.

---

## 14. Respuestas al design-review 2 (`design-review.json`, veredicto CHANGES_REQUESTED, 2 HIGH + 3 MEDIUM + 3 NIT)

Verifiqué cada hallazgo contra el **código real** del worktree antes de responder:
`apps/api/prisma/schema.prisma` (modelo `Task` **sin** relación `request`; cadena real
`Task → PlanPhase(phaseId) → Plan(planId) → Request(requestId)`),
`request/request.service.ts::scopeWhere` y `plan/plan-state.service.ts::requestScopeWhere` (ambos
`private`, no-jefe → `{ mainProcessId: { in: actor.scopedProcessIds } }` — **todos** los grants, sin
participación) y `plan-state.service.ts::requireTaskInScope` (traversal por pasos
`task.phase.planId → plan.requestId → request.findFirst`). Los dos HIGH eran afirmaciones **falsas**
del documento sobre el código; se corrigen. Todos los findings se **abordan** (ninguno se backloguea ni
se ignora): son coherentes con los requisitos (AC-014 en particular).

**HIGH-1 — `task.findFirst({ where: { id, request: {…} } })` no compila. RESUELTO.**
Confirmado en `schema.prisma`: `Task` solo tiene `phase`, `process`, `responsible`, `acceptedBy` y las
de dependencias; **no** hay relación `request`. §1.2 (bloque "`where` de alcance de cada FK") y §2.3 ahora
validan `taskId` por **traversal por pasos** replicando `requireTaskInScope`
(`task.findFirst({ include: { phase: { select: { planId: true } } } })` → `plan.findFirst({ select: {
requestId } })` → `request.findFirst({ AND: [{ id }, requestVisibilityWhere(actor)] } })`), con 404 en
cada escalón. Se documenta la alternativa de un `findFirst` con el nested **correcto** `{ id, phase: {
plan: { request: … } } }` pero se elige el traversal para no divergir del patrón heredado. Test en §6
(HIGH-1). Eliminado todo `where: { request: {…} }` sobre el delegado `task`.

**HIGH-2 — `requestScopeWhere` líder-only / "donde participa" no existe. RESUELTO.**
Confirmado que el `scopeWhere` real de Request/Plan filtra por `scopedProcessIds` (todos los grants) y
**no** por `RequestParticipant`. §1.2 ahora valida `projectRequestId` con un helper propio y
explícitamente nombrado `requestVisibilityWhere(actor)` = jefe `{}` / no-jefe `{ mainProcessId: { in:
actor.scopedProcessIds } }`, idéntico a la visibilidad real de Fase 2 (así un integrante que ve la
Request puede referenciarla, sin romper AC-014). **Eliminada** la cláusula "o donde participa" en §1.2,
§2.3 y en el mapa decisión→fuente. Se deja explícito que este helper de **visibilidad de referencia** es
distinto del `scopeWhere` de las entidades propias de Fase 5 (§2.2, que sí es líder-only por lección 1):
son dos planos con propósitos distintos. Test en §6 (HIGH-2) verifica `scopedProcessIds`, no
`leaderProcessIds`.

**MEDIUM-1 — `relatedIssueId` por persona daría 404 a novedades del proceso. RESUELTO.**
§1.2 fija que `relatedIssueId` se valida contra las novedades **del proceso del diario**
(`issue.findFirst({ where: { id, processId: dailyLog.processId } })`), no contra el `issueScopeWhere`
por persona: el diario ya está en alcance, y el SDD (`08` Diario/SCR-10) no restringe la novedad
relacionada a las "propias". Restringir a las propias se deja `P` reversible. Caso añadido a §6
(MEDIUM-1).

**MEDIUM-2 — orden de controllers / colisión de rutas. RESUELTO.**
Añadida nota en "Organización del módulo (D0)": regla de prefijos (ninguna estática comparte nivel con
un `:param` del mismo controller; `/coordination/people` y `/worklog/activities/:id` son hermanos, no
hijos de rutas paramétricas) y, de solaparse algún prefijo, registrar el controller de estáticas antes
en `coordination.module.ts` como hace `plan.module.ts`. Reflejado en `coordination.module.spec.ts`
(§6).

**MEDIUM-3 — `evidenceUrl` sin regla de validación. RESUELTO.**
Decidido: `@IsOptional @IsString @MaxLength(2000)`, **sin** `@IsUrl` (coherente con el activo/evidencia
como texto, D3, y sin entidad `Document`). Endurecer a URL/FK `Document` queda `P` (FEATURE-007).
Reflejado en §1.2 (fila `evidenceUrl`) y §3.4 (`CreateActivityDto`).

**NIT-1 — `targetDate` diverge del data-dictionary. RESUELTO.**
Mantengo `targetDate` (nombre técnico, alineable con `Commitment.dueDate`) con **nota de mapeo
explícita** en la tabla Issue (§1.2): `targetDate` = 'vencimiento'/'fecha meta' de `08`/SCR-12.

**NIT-2 — códigos de `ISSUE_TYPE` con certeza no respaldada. RESUELTO.**
§1.7 ahora marca solo `BLOQUEO` (default) como respaldado por `29`; `INCIDENTE`/`CALIDAD_DATOS`/
`SOLICITUD_APOYO` quedan **seed inicial `P` reversible** (maestra administrable, BR-018), no valor
confirmado del Site.

**NIT-3 — endpoint `/consolidation` en §2.5 pero no en §3. RESUELTO.**
Alineadas ambas secciones: **no** hay endpoint `/consolidation` separado; los conteos van en `GET
/weekly-reports/:id` (§2.5 reescrito, §3 ya lo listaba así).
