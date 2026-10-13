# Diseño técnico · Fase 2 · Flujo de Demanda (control-phari)

> Revisión 3. La Revisión 2 recibió `CHANGES_REQUESTED` (2 HIGH, 3 MEDIUM, 3 NIT) por
> **inconsistencias internas de la máquina de estados**: la prosa prometía comportamientos
> (triage 1:N "histórico", re-evaluar, "reabre la fase de triage") que los gates especificados no
> producían. Esta Revisión 3 los cierra:
> - **HIGH-1** — triage es **1:1 efectivo** en Fase 2: solo se admite registrar un Triage por
>   Request; cualquier `POST` posterior es 409 (§1.3, §2.1, §11 D3, test en §5).
> - **HIGH-2** — el gate de priorización gana **precondición de estado**: `POST .../priority` solo
>   válido en `EN_TRIAGE` (con triage=Continuar) o `BACKLOG_PRIORIZADO`; en `COMPROMETIDA`/
>   `DEVUELTA`/`RECHAZADA` → 409, de modo que una re-evaluación **no** puede deshacer un compromiso
>   (BR-006) (§2.3, §3.5, §11 D4/D7, test en §5).
> - **MEDIUM-3** — `DEVOLVER` de aprobación deja `EN_TRIAGE` y habilita **re-priorizar** (no
>   re-triage); se corrige la frase "reabre la fase de triage" (§2.4, §11 D6, test en §5).
> - **MEDIUM-4** — se reconcilia explícitamente el triage-`DEVOLVER`→`DEVUELTA` terminal contra
>   FLOW-001 ("Devolver requiere corrección") y `06` ("retorno exacto P") (§1.3).
> - **MEDIUM-5** — se fija el contrato de lectura de la evaluación vigente: `currentScore`/
>   `priorityLabel` reflejan **siempre la última** `PriorityEvaluation`; las previas son histórico
>   de solo lectura; sin recálculo (§1.4, §3.4, §11 D4).
> - **NIT-6/7/8** — tramo `<50` e inclusividad `>=` atribuidos a D7; gancho de migración de
>   `requesterArea` en D1; test de visibilidad de auditoría por alcance en §5.
>
> La §12 "Respuestas a la revisión" detalla cada resolución. El diseño sigue construyendo el
> NÚCLEO del flujo de demanda sobre Fase 1 (identidad funcional, roles/grants, autorización por
> rol + alcance, auditoría transversal, navegación por permisos), reutilizando sus convenciones
> **tal cual**.

## Visión general

Esta fase implementa el núcleo del flujo de demanda `FLOW-001` (SPEC): **Solicitud →
Triage → Priorización → Aprobación del compromiso**, con **gates server-side por fase** donde
"guardar/evaluar NO equivale a aprobar" (BR-006). Cubre los cortes `FEATURE-002` (Solicitud y
triage) y `FEATURE-003` (Prioridad y revisión) de `specs/23`, y los casos de uso UC-001
(registrar solicitud), UC-002 (resolver triage), UC-003 (evaluar prioridad) más la autorización
del compromiso, que el SDD describe como un **paso separado** (UC-003, `16-use-cases.md`) pero
cuyo detalle (cola, estados, motivos) es **P**; por eso la acción `Approval` se modela como
**DECISIÓN D6** (§11), no como un caso de uso que el Site ya defina.

El diseño respeta estrictamente el steering del repo: NestJS es dueño de la lógica de negocio,
validaciones, autorización, persistencia, API REST y OpenAPI; Prisma solo vive en `apps/api`;
el frontend consume el backend **exclusivamente** vía `@plantilla-portales/api-client`
(el import real es `./api-client` que reexporta el paquete) y nunca accede a PostgreSQL ni a
Prisma. Se extiende el patrón ya probado en Fase 1 (controller fino → service con lógica y
transacción → DTOs `class-validator` → `AuditService.record(tx, …)` dentro de la `$transaction`
→ P2002 traducido a `ConflictException` → política 403 por rol / 404 por alcance → pantallas
con estados loading/vacío/error/éxito y conservación de la entrada ante error).

Las decisiones sobre todo lo que el SDD marca **P** (pendiente de confirmar contra el Site)
se concentran en §11 "DECISIONES de diseño" y se marcan en el punto donde aparecen. **Ninguna
decisión P se presenta como hecho del Site**: se adopta la opción mínima, documentada y
reversible, sin inventar requeridos, colas, estados terminales ni fórmulas exactas.

### Mapa rápido decisión → spec

| Decisión | Respaldo en spec |
|---|---|
| Entidades Request / Triage / PriorityEvaluation / Approval | `07-domain-model.md`, `08-data-dictionary.md`, `11-ui-behavior.md` SCR-03/04/05/20 |
| Flujo con gates y "guardar ≠ aprobar" | `04-user-flows.md` FLOW-001, BR-002/004/006, AC-003/005/006 |
| Enum de estado operativo (solo lectura, derivado) | `06-state-machines.md`, BR-022, `08` ("estado operativo read-only") |
| Triage decide Continuar/Devolver/Rechazar y gobierna avance | BR-004, AC-003, SCR-04 |
| Prioridad: 8 criterios 1–5, pesos 25/15/15/10/10/10/10/5, score 0–100 | BR-005, SCR-05, AC-004 |
| Fórmula de score como **DECISIÓN de Fase 2** (P) | BR-005, `28` punto 4 |
| Aprobación separada del guardado de la evaluación | BR-006, AC-005/006, SCR-20, `12-actions.md` |
| Permisos: requests (todos), triage/priority/review (jefe/líder) | `10-roles-permissions.md` matriz de módulos, BR-020, AC-006/025 |
| Alcance de proceso en el `where` del service (sin ProcessScopeGuard) | Fase 1 §2.3/§2.4/§8 (gancho futuro) |
| Auditar toda mutación dentro de la transacción | BR-024, `15-audit.md`, AC-028, Fase 1 §6 |
| Reutilizar CatalogItem para maestras; añadir solo las confirmadas | `20-master-data.md`, `08`, Fase 1 seed |
| BR-001 proceso principal siempre participa | BR-001, SCR-03, `10` ("multiproceso") |
| BR-017 edición conserva fechas iniciales + justificación | BR-017, SCR-03, `08` |

---

## 1. Modelo de datos (Prisma)

### 1.1 Principios heredados de Fase 1 (sin cambios)

- Esquema físico en `apps/api/prisma/schema.prisma`. Modelos en PascalCase; columnas en
  `snake_case` vía `@map`/`@@map`; PK `String @id @default(uuid()) @db.Uuid`. Timestamps
  `created_at` (`@default(now())`) / `updated_at` (`@updatedAt`) en toda tabla mutable, igual
  que `Process`/`CatalogItem`.
- **Hallazgo de Fase 1 que se respeta:** en Prisma 7 un `@@unique` de **un solo campo** con
  `name` custom NO es usable como `where` de `findUnique`/`upsert` en runtime → se resuelve con
  `findFirst`. Los `@@unique` **compuestos** sí funcionan (se usan como `where` de `findUnique`
  igual que `grant_user_role_process_unique`).
- Solo se modelan entidades/campos confirmados para esta fase. No se crean tablas de Plan,
  Fase, Tarea, Capacidad, Framework, Activo, Documento, Reunión, etc. (fases posteriores).
- Se **reutiliza** `CatalogItem` para toda maestra; no se duplica. Los estados de la Request
  se modelan como **enum lógico TypeScript + columna texto** (ver §1.3), no como `CatalogItem`,
  porque gobiernan la lógica de los gates y deben ser un conjunto cerrado y tipado (mismo
  criterio por el que `Role.code` es tabla cerrada y no catálogo administrable en Fase 1).

### 1.2 Entidades nuevas y relaciones

```
Process (1) ──< (N) Request               [proceso principal, requerido — BR-001]
Request (N) >──< (N) Process               [participantes, vía RequestParticipant]
Request (1) ──< (N) Triage                 [tabla 1:N por extensibilidad; en Fase 2 solo 1 fila admitida (1:1 efectivo)]
Request (1) ──< (N) PriorityEvaluation     [1:N histórico; la vigente es la última por evaluatedAt]
Request (1) ──< (N) Approval               [1:N histórico de decisiones de compromiso]
User    (1) ──< (N) Triage/PriorityEvaluation/Approval   [actor que registró]
```

Todas las entidades nuevas añaden la relación inversa correspondiente en `Process` y `User`
(p. ej. `Process.requests`, `Process.requestParticipations`, `User.triages`, …) sin alterar
los campos existentes de Fase 1.

#### Request (Solicitud)

Ficha de la solicitud. Núcleo del flujo (SCR-03, `08` "Solicitud y evaluación", BR-001/017/022).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| title | `String` | `title` | **requerido** (AC-001, `09`); `MaxLength(255)` |
| registeredAt | `DateTime @default(now())` | `registered_at` | fecha de registro, default hoy (`08`/`09`) |
| requesterArea | `String?` | `requester_area` | área solicitante; texto libre (ver §11 D1) — **No confirmado como requerido** |
| requesterName | `String?` | `requester_name` | solicitante; texto libre — No confirmado requerido |
| functionalOwner | `String?` | `functional_owner` | dueño funcional; texto libre — No confirmado requerido |
| targetDate | `DateTime?` | `target_date` | fecha objetivo; opcional |
| referenceUrl | `String?` | `reference_url` | ficha/enlace; opcional; `MaxLength(2048)` |
| expectedResult | `String?` | `expected_result` | resultado esperado; opcional (`08` "required ?") |
| mainProcessId | `String @db.Uuid` | `main_process_id` | FK → Process, **requerido**; participa siempre (BR-001) |
| operationalState | `String @default("REGISTRADA")` | `operational_state` | enum lógico `RequestState` (§1.3); **derivado/read-only** (BR-022); default **declarado solo en el schema** (una capa, MEDIUM-3) |
| initialCommitmentDate | `DateTime?` | `initial_commitment_date` | compromiso inicial; se **conserva** en edición (BR-017) |
| changeJustification | `String?` | `change_justification` | justificación del último cambio en edición (BR-017) |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | auditoría técnica |

Relaciones:
`mainProcess Process @relation("RequestMainProcess", fields:[mainProcessId], references:[id], onDelete: Restrict)`,
`participants RequestParticipant[]`, `triages Triage[]`, `priorityEvaluations PriorityEvaluation[]`,
`approvals Approval[]`.
Índices: `@@index([mainProcessId])`, `@@index([operationalState])`, `@@index([registeredAt])`,
`@@map("requests")`.

Notas de modelado (con respaldo):
- `requesterArea`/`requesterName`/`functionalOwner`/`targetDate`/`referenceUrl`/`expectedResult`
  son **opcionales** porque `08`/`29`/SCR-03 los marcan "No confirmado" como required; el
  enunciado prohíbe imponer requeridos marcados P. **DECISIÓN §11 D1:** se guardan como **texto**
  (no FK a catálogo) salvo lo ya confirmado; `requesterArea` podría ser maestra en el Site pero
  el catálogo de áreas no está confirmado (`08` "Maestras observadas … áreas … P"), así que no
  se fuerza FK.
- `operationalState` es **texto respaldado por enum lógico** y **nunca** editable por un campo
  libre (BR-022): solo cambia por las acciones del flujo (gates, §2). El DTO de edición de
  Request **no** incluye este campo. **(MEDIUM-3)** El default `REGISTRADA` vive **únicamente** en
  el schema (`@default("REGISTRADA")`); el service **no** lo repite al crear (evita divergencia de
  dos capas). La columna **solo** se escribe por el helper de transición de
  `RequestStateService` (§1.3), nunca por un `update` directo ni por el DTO.
- `initialCommitmentDate` y `registeredAt` se **conservan** en edición (BR-017): el DTO de
  update no los toca; cualquier edición relevante exige `changeJustification`.

#### RequestParticipant (N:M Request ↔ Process)

Tabla puente explícita para los procesos participantes de una solicitud (SCR-03 "Participantes",
BR-001/003, `07` `REQUEST }o--o{ PROCESS`).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| requestId | `String @db.Uuid` | `request_id` | FK → Request (`onDelete: Cascade`) |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`onDelete: Restrict`) |
| createdAt | `DateTime @default(now())` | `created_at` | |

Índices: `@@unique([requestId, processId], name: "request_participant_unique")` (compuesto →
usable como `where`), `@@index([processId])`, `@@map("request_participants")`.

**DECISIÓN §11 D2 (BR-001):** el **proceso principal siempre** se materializa como fila de
`RequestParticipant` además de `Request.mainProcessId`, para que "proceso principal forma parte
de los participantes" sea un invariante de datos consultable, no solo una convención. El service
lo garantiza en create/update (§2). Se usa tabla puente explícita (no relación `@relation`
implícita de Prisma) para poder auditar altas/bajas de participantes y para dejar `onDelete`
explícito.

#### Triage

Clasificación y decisión de ruta (SCR-04, `08` "Triaging", BR-004).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| requestId | `String @db.Uuid` | `request_id` | FK → Request (`onDelete: Cascade`) |
| routeCode | `String?` | `route_code` | maestra `TRIAGE_ROUTE` (code); opcional (req. por rama P) |
| demandTypeCode | `String?` | `demand_type_code` | maestra `DEMAND_TYPE` (code); opcional |
| criticalityCode | `String?` | `criticality_code` | maestra `CRITICALITY` (code); opcional |
| sizeCode | `String?` | `size_code` | maestra `TRIAGE_SIZE` (code); opcional |
| dataAvailabilityCode | `String?` | `data_availability_code` | maestra `DATA_AVAILABILITY` (code); opcional |
| totalEffortHours | `Int?` | `total_effort_hours` | esfuerzo total (horas); opcional; `Min(0)` |
| mainResponsible | `String?` | `main_responsible` | responsable principal; texto; opcional |
| decision | `String` | `decision` | **requerido**: `CONTINUAR`\|`DEVOLVER`\|`RECHAZAR` (BR-004) |
| decidedAt | `DateTime @default(now())` | `decided_at` | fecha de decisión (AC-003) |
| decidedByUserId | `String @db.Uuid` | `decided_by_user_id` | FK → User (actor que decidió, AC-003) |
| dependencies | `String?` | `dependencies` | dependencias; texto; opcional |
| notes | `String?` | `notes` | observaciones; texto; opcional |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Relaciones: `request Request @relation(...)`, `decidedBy User @relation(...)`.
Índices: `@@index([requestId])`, `@@index([decidedByUserId])`, `@@map("triages")`.

**DECISIÓN §11 D3 (cardinalidad 1:N en la tabla, 1:1 efectivo en Fase 2 — HIGH-1):** la **tabla**
Triage es **1:N** respecto de Request (por extensibilidad futura: SCR-04 marca "reapertura/cambio
de una decisión ya tomada" como P y `07` dice "revisiones/histórico parcial"; una tabla 1:N no
bloquea esa reapertura a futuro y encaja con la auditoría append-only). **Pero en Fase 2 el gate
de §2.1 solo admite registrar UN Triage por Request:** el primer `POST .../triage` lleva
`REGISTRADA → EN_TRIAGE`, y como la Request ya no está en `REGISTRADA`, cualquier `POST .../triage`
posterior responde **409** (precondición de fase). Por tanto, **en runtime el triage es 1:1
efectivo**: no hay re-decisión ni corrección de un triage ya tomado (reapertura/cambio es P, §8).
Esto resuelve la contradicción de la Revisión 2 entre "histórico 1:N" (que el gate hacía
inalcanzable) y el gate: se adopta la opción conservadora (A) del hallazgo. Como el conjunto es de
una sola fila, **el triage vigente es esa única fila** (la lectura por `decidedAt desc` sigue
siendo correcta y queda lista para el día que se habilite el histórico). Si en el futuro el Site
confirma la mecánica de reapertura, basta ampliar el gate de §2.1 sin tocar el modelo de datos. Los
campos maestros (`routeCode`, `demandTypeCode`, `criticalityCode`, `sizeCode`,
`dataAvailabilityCode`) guardan el **code** del `CatalogItem` (no FK dura) por consistencia con
cómo Fase 1 referencia maestras y para tolerar reconfiguración de catálogos (BR-018); el service
valida que el code exista y esté activo en su familia (§2.4). `decision` es el único campo
requerido confirmado (BR-004/AC-003); el resto es opcional porque "requeridos por rama" son P.

#### PriorityEvaluation

Evaluación ponderada de 8 criterios (SCR-05, `08` "Prioridad", BR-005, AC-004).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| requestId | `String @db.Uuid` | `request_id` | FK → Request (`onDelete: Cascade`) |
| impact | `Int` | `impact` | 1–5 **requerido** (peso 25) |
| alignment | `Int` | `alignment` | 1–5 **requerido** (peso 15) |
| riskControl | `Int` | `risk_control` | 1–5 **requerido** (peso 15) |
| urgency | `Int` | `urgency` | 1–5 **requerido** (peso 10) |
| scope | `Int` | `scope` | 1–5 **requerido** (peso 10) |
| dataAvailability | `Int` | `data_availability` | 1–5 **requerido** (peso 10) |
| feasibility | `Int` | `feasibility` | 1–5 **requerido** (peso 10) |
| reuse | `Int` | `reuse` | 1–5 **requerido** (peso 5) |
| score | `Int` | `score` | **calculado en backend** 0–100 (§1.4) |
| justification | `String?` | `justification` | justificación; opcional (SCR-05 "se captura justificación") |
| evaluatedAt | `DateTime @default(now())` | `evaluated_at` | fecha de evaluación |
| evaluatedByUserId | `String @db.Uuid` | `evaluated_by_user_id` | FK → User (actor) |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Relaciones: `request Request @relation(...)`, `evaluatedBy User @relation(...)`.
Índices: `@@index([requestId])`, `@@index([evaluatedByUserId])`, `@@map("priority_evaluations")`.

**DECISIÓN §11 D4 (cardinalidad 1:N + contrato de lectura — MEDIUM-5):** PriorityEvaluation es
**1:N** (histórico), porque SCR-05 marca "efecto de revaluar" como P: 1:N permite guardar más de
una evaluación sin bloquear ni afirmar la mecánica exacta de revaluar. **Contrato de lectura
observable en Fase 2 (cierra la ambigüedad de la Revisión 2):**
- La **evaluación vigente es siempre la última por `evaluatedAt`**; las anteriores quedan como
  **histórico de solo lectura** (nunca se borran ni se recalculan).
- `currentScore`/`priorityLabel` del `RequestResponseDto` y el `score` que ve la **cola de
  aprobación** reflejan **siempre esa última** evaluación. Fase 2 **no** define promedio, mezcla
  ni recálculo retroactivo (efecto de revaluar P).
- **En qué estados es válido re-guardar** la evaluación lo acota la precondición de estado del gate
  §2.3 (HIGH-2): solo `EN_TRIAGE` (con triage=Continuar) o `BACKLOG_PRIORIZADO`; nunca sobre
  `COMPROMETIDA`/`DEVUELTA`/`RECHAZADA`. Así, re-evaluar jamás revierte un compromiso ya autorizado
  (BR-006).

Los 8 criterios son `Int` **requeridos** 1–5 (AC-004: "ocho valores 1–5"); el DTO los exige y
valida el rango. `score` **no** se acepta del cliente: lo calcula el service (§1.4) y se persiste.
`justification` es opcional (SCR-05 la "captura" pero no la confirma como obligatoria; no se
inventa un required P).

#### Approval

Decisión de autorización del compromiso, **separada** del guardado de la evaluación
(SCR-20, BR-006, AC-005/006, `07` "Aprobación", `12-actions.md` "Revisar decisión").

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| requestId | `String @db.Uuid` | `request_id` | FK → Request (`onDelete: Cascade`) — objeto revisado |
| decision | `String` | `decision` | **requerido**: `APROBAR`\|`DEVOLVER` (§11 D6) |
| reason | `String?` | `reason` | motivo; **requerido solo si `DEVOLVER`** → ausencia = **400** (validación, §2.4/§3.5, §11 D6) |
| previousState | `String` | `previous_state` | estado operativo **inmediatamente anterior a la decisión** (siempre `BACKLOG_PRIORIZADO`, precondición del gate §2.4) |
| resultingState | `String` | `resulting_state` | estado resultante: `APROBAR`→`COMPROMETIDA`; `DEVOLVER`→`EN_TRIAGE` (destino determinista, §11 D6) |
| decidedAt | `DateTime @default(now())` | `decided_at` | fecha de la decisión |
| decidedByUserId | `String @db.Uuid` | `decided_by_user_id` | FK → User (autoridad que decide) |
| createdAt | `DateTime @default(now())` | `created_at` | append-only (sin updatedAt) |

Relaciones: `request Request @relation(...)`, `decidedBy User @relation(...)`.
Índices: `@@index([requestId])`, `@@index([decidedByUserId])`, `@@index([decidedAt])`,
`@@map("approvals")`.

**DECISIÓN §11 D6:** la cola/estados exactos de aprobación son P (`06`/SCR-20). Se modela el
**mínimo confirmado**: una acción de autorización que una autoridad con capacidad `review`
ejecuta **aparte** del guardado de la evaluación, que cambia el estado operativo
`BACKLOG_PRIORIZADO → COMPROMETIDA` y queda auditada. `DEVOLVER` tiene un **destino determinista
`EN_TRIAGE`** con `previousState = BACKLOG_PRIORIZADO` y `reason` **requerido**.

**Qué habilita exactamente el destino `EN_TRIAGE` (MEDIUM-3 — corrige la frase "reabre la fase de
triage/priorización" de la Revisión 2):** `DEVOLVER` deja la Request en `EN_TRIAGE` con su **triage
vigente = CONTINUAR ya resuelto** (el triage es 1:1 efectivo, §11 D3, y no se re-ejecuta: reapertura
de triage es P, §8). Lo que el destino habilita es **volver a guardar la priorización** (§2.3, que
admite `POST .../priority` en `EN_TRIAGE` con triage=Continuar) y **re-presentar a aprobación**. El
triage **no** se re-hace. Por eso D6 ya **no** dice "reabre la fase de triage": dice "reabre la
priorización". El destino `EN_TRIAGE` es DECISIÓN de Fase 2 (la devolución exacta es P en `06`), no
un hecho del Site; se elige un destino **fijo** (y no un "estado anterior" derivado del histórico)
porque ese dato de origen no se persiste y la evaluación es 1:N, de modo que "el estado previo a
BACKLOG" no es único ni recuperable: un destino fijo es el único camino implementable y testeable.

No se modela "cola de pendientes" como entidad (es una **consulta** derivada vía
`GET /requests/pending-approval`, §3), ni reenvío, ni doble decisión (todo P). Approval es
append-only (histórico de decisiones) como `AuditEvent`.

### 1.3 Enum de estados y transiciones implementadas vs. solo modeladas

Se define un **enum lógico TypeScript** `RequestState` en el backend (p. ej.
`apps/api/src/modules/request/request-state.ts`), espejo de los estados del catálogo de
`06-state-machines.md`. La columna `Request.operationalState` guarda el **code** del estado
(texto), nunca editable libremente (BR-022).

Estados **modelados** en el enum (todos los confirmados en `06`), para no truncar el ciclo:

```
REGISTRADA, EN_TRIAGE, DEVUELTA, RECHAZADA, BACKLOG_PRIORIZADO, COMPROMETIDA,
EN_PLANIFICACION, EN_EJECUCION, BLOQUEADA, EN_VALIDACION, LISTA_PARA_LIBERAR,
EN_ESTABILIZACION, OPERATIVA, CERRADA, RETIRADA
```

Transiciones **IMPLEMENTADAS en Fase 2** (y solo estas; gates server-side, §2):

| Transición | Disparador (acción/gate) | Respaldo |
|---|---|---|
| (alta) → `REGISTRADA` | crear Request con requeridos (título + proceso principal) | AC-001, BR-002 |
| `REGISTRADA` → `EN_TRIAGE` | registrar un Triage sobre la Request | BR-002, FLOW-001, §11 D5 |
| `EN_TRIAGE` → `BACKLOG_PRIORIZADO` *(vía Continuar+evaluación)* | ver desglose abajo | BR-004/005 |
| `EN_TRIAGE` → `DEVUELTA` | triage `DEVOLVER` | BR-004, AC-003 |
| `EN_TRIAGE` → `RECHAZADA` | triage `RECHAZAR` | BR-004, AC-003 |
| `EN_TRIAGE` → *(habilita priorización)* | triage `CONTINUAR` (sin cambiar aún a backlog) | BR-002/004 |
| `EN_TRIAGE` (triage=Continuar) → `BACKLOG_PRIORIZADO` | guardar PriorityEvaluation | BR-005, §11 D7 |
| `BACKLOG_PRIORIZADO` → `BACKLOG_PRIORIZADO` | re-guardar PriorityEvaluation (re-evaluar, idempotente en estado; HIGH-2) | §2.3, §11 D4 |
| `BACKLOG_PRIORIZADO` → `COMPROMETIDA` | Approval `APROBAR` por rol con `review` | BR-006, AC-005/006 |
| `BACKLOG_PRIORIZADO` → `EN_TRIAGE` | Approval `DEVOLVER` con motivo (destino determinista) | SCR-20, §11 D6 |

> **Reingreso desde `DEVUELTA` (frontera explícita + reconciliación con FLOW-001, MEDIUM-4).** El
> disparador de triage es **solo `REGISTRADA → EN_TRIAGE`**. `DEVUELTA` **no** es origen de
> ninguna transición implementada: salir de `DEVUELTA` sería **reapertura/re-triage**. **Tensión
> con FLOW-001 (reconciliada aquí):** `04-user-flows.md` describe "Devolver requiere corrección" y
> su flowchart dibuja `Triage --Devolver--> Solicitud` (volver a corregir y re-entrar); pero
> `06-state-machines.md` marca el **retorno exacto como P** ("Triage → devolución … retorno exacto
> P"). Ante ese conflicto fuente-vs-fuente, Fase 2 **adopta `DEVUELTA` como estado sin salida
> implementada** (opción conservadora, coherente con §8), y **declara este punto como el exacto a
> reabrir** cuando el Site confirme a qué estado (`REGISTRADA`/`EN_TRIAGE`) y bajo qué condición
> vuelve una solicitud devuelta. No se inventa el retorno P: una Request `DEVUELTA` queda en ese
> estado en Fase 2 y no se expone acción que la reabra. (Nota: el `DEVOLVER` de **Approval**,
> arriba, lleva a `EN_TRIAGE` —no a `DEVUELTA`— y sí habilita re-priorizar, §2.4; es un camino
> distinto y no entra en conflicto con esta frontera.)

Transiciones **solo modeladas, NO implementadas** en Fase 2 (los estados existen en el enum,
pero ninguna acción de Fase 2 los produce; son de Plan/Ejecución/Validación/cierre, fases 4+):
`COMPROMETIDA → EN_PLANIFICACION`, `EN_PLANIFICACION → EN_EJECUCION`, `EN_EJECUCION ↔ BLOQUEADA`,
`EN_VALIDACION → LISTA_PARA_LIBERAR/OPERATIVA/CERRADA`, `→ RETIRADA`, y cualquier reapertura.
`06` marca estas transiciones como P ("transición terminal/reapertura P", "secuencia exacta P");
por eso se **modela el estado** pero **no** se codifica la transición ni se expone acción que la
dispare.

**Validación de escritura del estado (MEDIUM-3).** La columna `operational_state` nunca se escribe
por un `update` libre ni por un DTO: el único camino es un helper de transición en
`RequestStateService` (§3.2). Ese helper acepta **solo** transiciones entre miembros del enum
`RequestState` listadas como implementadas arriba; ante un `from`/`to` fuera del enum o una
transición no implementada lanza un error de dominio (`ConflictException` para precondición de
fase; error interno para un valor imposible), de modo que ningún valor de estado no tipado llega a
BD. El `@IsEnum(RequestState)` del `ListRequestsDto` (§3.4) valida **solo el filtro de lectura**;
la integridad de la escritura la garantiza el helper, no el DTO.

### 1.4 Fórmula de prioridad — DECISIÓN de Fase 2 (P)

`BR-005` y `28` punto 4 marcan **fórmula, redondeo y cortes exactos como P**. Se adopta una
fórmula ponderada explícita y documentada, **sin afirmar que es la del Site**:

```
Pesos (confirmados por BR-005/SCR-05, suman 100):
  impact 25, alignment 15, riskControl 15, urgency 10,
  scope 10, dataAvailability 10, feasibility 10, reuse 5

score = round( Σ ( peso_i × (valor_i / 5) ) )        // valor_i ∈ [1..5]
```

Propiedades: con todos los criterios en 5 → `Σ peso_i × 1 = 100`; con todos en 1 →
`Σ peso_i × 0.2 = 20`; rango efectivo [20..100] dentro de la escala 0–100 (AC-004). **Redondeo:
`Math.round` a entero** (DECISIÓN §11 D7). Requisito de cálculo: **los 8 criterios deben estar
presentes y en 1–5** (DTO los exige), evitando el caso "datos incompletos" que BR-005 deja P.

**Umbrales 80/65/50:** se exponen **solo como etiqueta informativa** derivada del score
(`>=80`, `>=65`, `>=50`, `<50`) para la UI; **no** disparan transiciones automáticas ni aprobación
(`05` "no se afirma que ≥80 se apruebe automáticamente"; `28` punto 4 cortes inclusivos P). La
etiqueta se calcula en backend y se devuelve como campo informativo del response, sin persistir
una decisión. **NIT-6:** solo el SDD confirma los **cortes** 80/65/50; la **inclusividad `>=`** y
el **cuarto tramo `<50`** son parte de la DECISIÓN §11 D7 (cortes inclusivos P en `28` punto 4),
no un hecho del Site; al ser solo etiqueta sin efecto, su revisión no cambia ninguna transición.

### 1.5 Maestras (CatalogItem): reutilizar y completar el seed

Se **reutilizan** las familias ya sembradas en Fase 1 (`seed.ts`): `TRIAGE_DECISION`
(Continuar/Devolver/Rechazar), `CRITICALITY` (Baja/Media/Alta/Crítica), `DATA_AVAILABILITY`
(Sí/Parcial/No), `DEMAND_TYPE` (Desarrollo/Evolución/Soporte-Incidente/Deuda técnica/Exploración).

Se **añaden al seed** (idempotente, mismo patrón `upsert` por `catalog_code_unique`) solo las
familias que faltan y están **confirmadas** en el SDD, con valores sin ruido/"aa"
(`20-master-data.md`, SCR-04):

- `TRIAGE_ROUTE` — ruta de la solicitud. Valores confirmados por BR-003 (BI→FIBI,
  Integraciones→FIID, IA→FIAA, multiproceso→FMAA): `BI`/"BI", `INTEGRACIONES`/"Integraciones",
  `IA`/"IA", `MULTIPROCESO`/"Multiproceso (FMAA)". **DECISIÓN §11 D8:** la ruta se siembra con
  estas 4 opciones porque son las confirmadas; no se inventan rutas adicionales.
- `TRIAGE_SIZE` — tamaño. `08`/SCR-04 confirman que "tamaño" es un campo maestro pero **no**
  listan sus valores exactos. **DECISIÓN §11 D8:** se siembra una escala conservadora genérica
  `S`/"S", `M`/"M", `L`/"L", `XL`/"XL" marcada como provisional (etiqueta neutra, sin ruido),
  a revisar contra el Site; no se afirma que sean los valores reales.

El seed de Fase 1 **no se reescribe**: se **extiende** agregando estas dos familias a la
constante `CATALOG_ITEMS` existente, preservando su idempotencia. No se añaden maestras de fases
futuras no usadas en este flujo.

### 1.6 Estrategia de migración

Una única migración versionada nueva, con el comando real del repo (nunca `db push`), ejecutada
desde `apps/api`:

```
npm run prisma:migrate:dev -- --name fase2_demanda
```

Produce `apps/api/prisma/migrations/<timestamp>_fase2_demanda/migration.sql` con las tablas
`requests`, `request_participants`, `triages`, `priority_evaluations`, `approvals`, sus FKs,
uniques e índices, siguiendo el formato de las migraciones existentes. Luego
`npm run prisma:generate` regenera el client tipado en `src/generated/prisma`. Las tablas de
Fase 1 **no se tocan** (sus migraciones quedan intactas). El seed extendido se re-ejecuta con
`npm run prisma:seed` (idempotente).

### 1.7 Auditoría: nuevos objectType

`AuditService.record(tx, …)` se usa **tal cual** (dentro de la `$transaction`). Se amplía el
tipo `AuditObjectType` de `audit.service.ts` para incluir `REQUEST`, `TRIAGE`,
`PRIORITY_EVALUATION`, `APPROVAL` (hoy es `'PROCESS' | 'USER' | 'GRANT' | 'CATALOG_ITEM'`). El
set de `action` (`CREATE|UPDATE|DELETE|REVOKE`) **no cambia**: aprobar/devolver/decidir triage
se auditan como `UPDATE` de la Request más `CREATE` del objeto de decisión (Triage/
PriorityEvaluation/Approval), con `before/after` que capturan el cambio de estado. **Todas** las
mutaciones de Fase 2 pasan por `AuditService.record` dentro de la misma transacción, con
`scopeProcessId = Request.mainProcessId` (invariante de §6).

---

## 2. Gates del flujo (server-side)

Los gates se evalúan **siempre en el service** (NestJS dueño de las reglas). Ocultar un botón
no es control (BR-019). Cada gate que no se cumple produce un error de dominio tipado
(`BadRequestException`/`ConflictException`) **sin** mutar nada, y la UI lo refleja como candado
con precondición (UI-04, AC-002/023).

### 2.1 Gate Registro → Triage

- **Precondición de fase (contrato 409, no 400).** Registrar triage exige que la Request **exista**
  y esté en estado `REGISTRADA`. Como la Request siempre se crea vía `POST /requests` con sus
  requeridos confirmados (título + proceso principal), esos requeridos **ya están satisfechos** por
  construcción (ver nota de tautología abajo). Lo que el gate verifica realmente es la
  **precondición de estado**: `POST .../triage` **solo** se admite cuando la Request está en
  `REGISTRADA`. Sobre cualquier otro estado (`EN_TRIAGE`, `DEVUELTA`, `RECHAZADA`,
  `BACKLOG_PRIORIZADO`, `COMPROMETIDA`, …) responde **siempre `409`** (precondición de fase) con
  mensaje de candado (AC-002: "muestra candado/motivo y no permite decisión"). El `400`
  queda **reservado** a la validación del `CreateTriageDto` (p. ej. `decision` inválida o code
  maestro inexistente). Esta separación es la que §3.5 exige: 409 = candado de fase, 400 = error de
  dato; nunca el mismo caso en ambos.
- **Triage 1:1 efectivo (HIGH-1).** Como el primer triage lleva `REGISTRADA → EN_TRIAGE`, un
  **segundo** `POST .../triage` encuentra la Request en `EN_TRIAGE` y cae en la regla anterior →
  **409**. En Fase 2, por tanto, **solo puede existir un Triage por Request**; no hay re-decisión
  ni corrección de un triage ya tomado (reapertura/cambio es P, §8). Un líder que elige una
  decisión por error no puede re-decidir en Fase 2: ese es exactamente el punto marcado P a reabrir
  cuando el Site confirme la mecánica de reapertura (ampliando este gate, sin tocar el modelo 1:N).
  Hay test que fija "segundo POST triage sobre `EN_TRIAGE` → 409" (§5).
- **Nota de tautología (MEDIUM-1).** Con solo título + proceso principal como requeridos
  confirmados, **no existe** un estado de "registro incompleto" por datos: toda Request creada los
  cumple, así que no se inventa un gate de datos de registro (los requeridos-por-fase son P,
  `28` p.3). **DECISIÓN:** AC-002 ("registro incompleto / candado") se cubre por las **precondiciones
  reales del flujo** —no por un candado de registro inexistente—: (a) el estado de la Request no
  habilita el triage (409 arriba), (b) priorizar exige triage=`CONTINUAR` (§2.3), (c) aprobar exige
  estado `BACKLOG_PRIORIZADO` (§2.4). El mapa de AC en §9 refleja esta cobertura y **no** promete un
  candado de datos de registro.
- Registrar un Triage lleva el estado a `EN_TRIAGE` (desde `REGISTRADA`), **antes** de aplicar la
  decisión del propio triage (§11 D5).

### 2.2 Gate Triage (decisión) → avance

Al guardar el Triage con su `decision` (BR-004, AC-003), el service aplica **en la misma
transacción**:

- `DEVOLVER` → `Request.operationalState = DEVUELTA`. No habilita priorización.
- `RECHAZAR` → `Request.operationalState = RECHAZADA`. No habilita priorización. (No se
  implementa reapertura: `06` la marca P.)
- `CONTINUAR` → **habilita** la priorización; el estado operativo pasa a reflejar que el triage
  está resuelto y continúa. **DECISIÓN §11 D5:** con `CONTINUAR` el estado permanece `EN_TRIAGE`
  (triage resuelto, aún sin evaluación) y la habilitación de prioridad se determina por "existe
  un triage vigente con `decision = CONTINUAR`" (BR-002/004), no por un estado intermedio
  inventado. Se evita crear un estado "triage aprobado" que `06` no confirma.

Guardar/editar el triage **nunca** aprueba el compromiso (BR-006): solo clasifica y decide ruta.

### 2.3 Gate Priorización (guardar evaluación)

- **Precondición de decisión (BR-002):** priorización disponible **solo si** el triage vigente de
  la Request tiene `decision = CONTINUAR`. Si no, `POST .../priority` responde `409` con
  precondición (AC-002/UI-04). Esto cubre AC-003 ("solo Continuar permite priorizar").
- **Precondición de estado (HIGH-2 — nueva, obligatoria).** Además de triage=Continuar, el
  `POST .../priority` **solo** se admite cuando `operationalState ∈ { EN_TRIAGE, BACKLOG_PRIORIZADO }`.
  En `COMPROMETIDA`, `DEVUELTA`, `RECHAZADA` o cualquier estado posterior → **409** (precondición de
  fase), **sin mutación**. Motivo: la evaluación es 1:N (§11 D4) y el triage=Continuar permanece
  verdadero tras aprobar; sin esta precondición de estado, un `POST .../priority` sobre una Request
  ya `COMPROMETIDA` pasaría el gate y reescribiría `operationalState = BACKLOG_PRIORIZADO`,
  **deshaciendo un compromiso ya autorizado sin pasar por aprobación** — exactamente lo que BR-006
  prohíbe (que el estado de compromiso cambie por un guardado de evaluación). La precondición cierra
  ese agujero. Hay test "re-POST priority sobre `COMPROMETIDA` → 409 sin mutación" (§5).
- **Efecto de guardar.** Con ambas precondiciones satisfechas y una PriorityEvaluation válida (8
  criterios 1–5), el service calcula `score` (§1.4), persiste la evaluación (histórico 1:N, la
  vigente pasa a ser esta) y lleva `Request.operationalState = BACKLOG_PRIORIZADO`. Desde
  `EN_TRIAGE` es la transición de alta a backlog; desde `BACKLOG_PRIORIZADO` es una **re-evaluación
  idempotente en estado** (el estado ya es backlog y se mantiene; solo cambia la evaluación vigente,
  §11 D4). **DECISIÓN §11 D7:** se adopta `BACKLOG_PRIORIZADO` al guardar la evaluación (coherente
  con el estado confirmado en `06`), pero **guardar NO es aprobar** (BR-006): el compromiso sigue
  requiriendo el paso de aprobación (§2.4). AC-005: "sigue pendiente hasta autorización de actor
  autorizado".

### 2.4 Gate Aprobación (compromiso) — SEPARADO

- **Acción separada** (BR-006, SCR-20): `POST .../approval` con `decision` ∈ `{APROBAR, DEVOLVER}`.
- **Permiso:** solo rol con capacidad `review` según `MODULE_MATRIX.review = [JEFE_AREA,
  LIDER_PROCESO]` (`10`), **más** alcance de proceso (§4). Un usuario **sin** `review` que intenta
  aprobar → **403** sin mutación (AC-006, control negativo 4 de `10`). Un integrante nunca hace
  revisión (AC-025, BR-020).
- **Precondición de estado:** la Request debe estar en `BACKLOG_PRIORIZADO`. En otro estado →
  `409` con precondición (no se aprueba lo no priorizado; AC-023 "GA2 bloqueado si GA1/triage no
  confirmado").
- `APROBAR` → `operationalState = COMPROMETIDA`; registra `Approval`
  (`previousState = BACKLOG_PRIORIZADO`, `resultingState = COMPROMETIDA`) y audita.
- `DEVOLVER` → **destino determinista `EN_TRIAGE`** (`previousState = BACKLOG_PRIORIZADO`,
  `resultingState = EN_TRIAGE`; §11 D6). **Qué habilita (MEDIUM-3):** con el triage vigente=Continuar
  intacto (triage 1:1, no se re-ejecuta), el destino `EN_TRIAGE` permite **volver a guardar la
  priorización** (§2.3, que admite `POST .../priority` en `EN_TRIAGE` con triage=Continuar) y
  re-presentar a aprobación; **no** reabre el triage. **`reason` es obligatorio en esta rama**: su
  ausencia es una **validación de entrada**, no una precondición de fase, por lo que el service
  lanza **`BadRequestException` (400)** con mensaje "El motivo es obligatorio para devolver"
  —**no** 409—. Registra `Approval` y audita.
- **Separación 400 vs 409 en aprobación:** `409` se reserva a la **precondición de estado** (la
  Request no está en `BACKLOG_PRIORIZADO` al aprobar/devolver); `400` cubre la validación del
  `CreateApprovalDto` y la regla condicional `reason`-si-`DEVOLVER`.
- **Validación de maestras del triage:** los códigos maestros recibidos (ruta, tipo, criticidad,
  tamaño, disponibilidad) se validan contra `CatalogItem` activo de su familia en el service; code
  inexistente/inactivo → `400` ("Revisa los datos ingresados"), sin exponer detalle Prisma.

### 2.5 Permisos por módulo y alcance de proceso

Reutiliza **exactamente** el mecanismo de Fase 1 (`@Roles` + `RolesGuard`; alcance en el `where`
del service; política 403 rol / 404 alcance). **No** se crea `ProcessScopeGuard` (Fase 1 §2.3/§8
lo dejó como gancho futuro); el alcance de recursos por `:id` se resuelve en el service
resolviendo `Request.mainProcessId` y comparando con `actor.scopedProcessIds`.

| Operación | Rol requerido (`@Roles`) | Alcance de proceso |
|---|---|---|
| Crear/listar/ver/editar Request | ninguno extra (todos: `requests` para los 3 roles) | sí: `mainProcessId ∈ scopedProcessIds` (jefe: todos los suyos) |
| Registrar/editar Triage + decisión | `JEFE_AREA, LIDER_PROCESO` (`triage`) | sí |
| Guardar PriorityEvaluation | `JEFE_AREA, LIDER_PROCESO` (`priority`) | sí |
| Ejecutar Approval (aprobar/devolver) | `JEFE_AREA, LIDER_PROCESO` (`review`) | sí |

- **Alcance de la Request:** la Request pertenece a su **proceso principal**. El enforcement de
  lectura/escritura filtra por `mainProcessId ∈ actor.scopedProcessIds` (jefe: sus procesos de
  área, igual que Fase 1; en el seed, los 4). Un líder del proceso A que pide una Request del
  proceso B → **404** (Plano A, "denegar sin filtrar datos", AC-026). Rol insuficiente para
  triage/priority/review → **403** (AC-006/025).
- **Multiproceso (alcance de lectura con participantes):** **DECISIÓN §11 D9:** el **proceso
  principal gobierna el scope** de lectura/escritura de la Request. Que un líder de un proceso
  solo participante (no principal) pueda ver/operar la Request es P (`10` "multiproceso … P");
  Fase 2 **no** amplía el scope por participación (mínimo confirmado), y lo deja documentado como
  punto a reabrir. Los participantes se guardan y muestran, pero no otorgan alcance por sí mismos
  en esta fase.

### 2.6 Integrante

El integrante **no** hace triage ni revisión (AC-025, BR-020): `triage`/`priority`/`review`
exigen jefe/líder vía `@Roles`. El integrante sí puede, dentro de su alcance de proceso,
crear/consultar/editar solicitudes (`requests` para los 3 roles, `10`). AC-025 (integrante abre
URL de triage por rol) → 403; recurso de otro proceso → 404.

---

## 3. API REST + OpenAPI

### 3.1 Convenciones (heredadas de Fase 1, sin cambios)

Controllers finos con `@UseGuards(CurrentUserGuard, RolesGuard)`; `@Roles(...)` por endpoint;
`@CurrentActor()` inyecta el actor; DTOs `class-validator` con `ValidationPipe` global
(whitelist + forbidNonWhitelisted + transform); **DTOs de request y response separados**
(no se filtra la forma Prisma); `@nestjs/swagger` en todos los endpoints
(`@ApiTags/@ApiOperation/@ApiResponse/@ApiBody/@ApiParam/@ApiQuery`); P2002 → `ConflictException`;
`findOne` fuera de alcance → `NotFoundException` (404); ningún error de Prisma se expone. Cada
cambio de contrato → `npm run contracts:generate` (committear `openapi.json` y
`packages/api-client/src/generated/*`).

### 3.2 Estructura de módulos NestJS

**DECISIÓN §11 D10:** un **módulo raíz `request/`** con **submódulos** `triage/`, `priority/`,
`approval/`, todos bajo `apps/api/src/modules/`. Razón: las tres sub-entidades son dependientes
de la Request (no existen sin ella) y comparten el invariante de scope por `mainProcessId` y la
máquina de estados; un módulo raíz con submódulos mantiene cohesión y evita duplicar la
resolución de alcance, respetando "monolito modular" (steering). Cada submódulo tiene su
controller + service + DTOs + spec, e importa un `RequestStateService` compartido (helper de
transiciones y lectura del triage/evaluación vigentes) expuesto por `request/`.

```
apps/api/src/modules/request/
  request.module.ts            ← agrupa y reexporta submódulos; importa AuditModule, AuthModule
  request.controller.ts        ← CRUD de Request
  request.service.ts           ← CRUD + scope por mainProcessId + BR-001/017
  request-state.ts             ← enum RequestState + helpers de transición (gates)
  request-state.service.ts     ← lee triage/evaluación vigentes; aplica transiciones
  dto/ (create/update/list/response)
  triage/   (controller, service, dto, spec)
  priority/ (controller, service, dto, spec)
  approval/ (controller, service, dto, spec)
```

Se registra `RequestModule` en `app.module.ts` (junto a los de Fase 1, sin tocar los existentes).

### 3.3 Endpoints

Todos pasan por `CurrentUserGuard` (actor requerido). Alcance por `mainProcessId` en el service.

**Request** (`requests`) — rol: los 3 (con alcance de proceso)
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/requests` | todos | lista por alcance; filtros `state?`, `mainProcessId?` (opcionales) |
| GET | `/requests/:id` | todos | detalle; 404 fuera de alcance; incluye triage/evaluación vigentes + estado |
| POST | `/requests` | todos | crea (título + proceso principal requeridos); estado `REGISTRADA`; BR-001; audita CREATE |
| PATCH | `/requests/:id` | todos | edita campos de ficha (no estado); `changeJustification`; conserva fechas iniciales (BR-017); audita UPDATE |

**Triage** (`requests/:id/triage`) — rol: `JEFE_AREA, LIDER_PROCESO`
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/requests/:id/triage` | jefe/líder | devuelve el triage de la Request (en Fase 2, 1:1 efectivo: cero o una fila; forma lista por compatibilidad con el histórico futuro) |
| POST | `/requests/:id/triage` | jefe/líder | registra **el** triage + decisión (solo si estado=`REGISTRADA`; 2º POST → 409, HIGH-1); aplica gate §2.2; audita (CREATE Triage + UPDATE Request) |

**Prioridad** (`requests/:id/priority`) — rol: `JEFE_AREA, LIDER_PROCESO`
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/requests/:id/priority` | jefe/líder | histórico de evaluaciones (**vigente = última por `evaluatedAt`**, §11 D4), con score y etiqueta de umbral |
| POST | `/requests/:id/priority` | jefe/líder | guarda evaluación (requiere triage=Continuar **y** estado ∈ {`EN_TRIAGE`,`BACKLOG_PRIORIZADO`}, §2.3/HIGH-2; en otro estado → 409 sin mutación); score calculado en backend; estado→BACKLOG_PRIORIZADO; audita |

**Aprobación** (`requests/:id/approval` + cola) — rol: `JEFE_AREA, LIDER_PROCESO` (capacidad `review`)
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/requests/pending-approval` | jefe/líder (`review`) | **cola de SCR-20**: Requests en `BACKLOG_PRIORIZADO` dentro del alcance del actor; endpoint propio restringido (§11 D6) |
| GET | `/requests/:id/approval` | jefe/líder | histórico de decisiones de compromiso |
| POST | `/requests/:id/approval` | jefe/líder | aprobar→COMPROMETIDA / devolver (motivo req.→400 si falta); gate §2.4; AC-006 (sin review→403 sin mutación); audita |

No se expone endpoint para editar `operationalState` directamente (BR-022).

> **Fuente de la cola de aprobaciones (MEDIUM-5).** SCR-20 se sirve por un **endpoint propio
> `GET /requests/pending-approval`** restringido con `@Roles(JEFE_AREA, LIDER_PROCESO)` + alcance
> por `mainProcessId`, que devuelve las Requests en `BACKLOG_PRIORIZADO` del alcance del actor. Se
> prefiere un contrato propio (y no reutilizar `GET /requests?state=BACKLOG_PRIORIZADO`) para que la
> "cola de revisión" **no** quede expuesta a un integrante —que sí puede llamar al `GET /requests`
> genérico— y para no hacer depender SCR-20 de un filtro de query. La frontera de seguridad de la
> **aprobación** sigue siendo `POST .../approval` (exige `review`); un integrante podría consultar
> backlog de su proceso vía `GET /requests?state=`, pero no verá ni usará la cola de SCR-20. Esto es
> DECISIÓN de Fase 2 (cola persistente/estados exactos son P; §11 D6).

### 3.4 DTOs (validación por entrada externa)

Toda entrada externa se valida con DTO (requerido/opcional, tipo, límites, fallo → 400):

- **CreateRequestDto:** `title` string requerido, trim, `MaxLength(255)`; `mainProcessId`
  `@IsUUID` requerido; `participantProcessIds?` `@IsUUID('all', {each:true})` array opcional
  (validación de pertenencia/dedup en el service, ver §11 D9/NIT-3);
  `requesterArea?`/`requesterName?`/`functionalOwner?`/`expectedResult?` string `MaxLength`
  opcionales; `targetDate?`/`initialCommitmentDate?` `@IsDateString` opcionales; `referenceUrl?`
  string `MaxLength(2048)` opcional. Fallo → 400; `mainProcessId` inexistente/fuera de alcance → 404.
- **UpdateRequestDto:** mismos campos de ficha **excepto** `operationalState`, `registeredAt` e
  `initialCommitmentDate` (se conservan, BR-017); `changeJustification?` string. No permite tocar
  el estado.
- **CreateTriageDto:** `decision` `@IsEnum(['CONTINUAR','DEVOLVER','RECHAZAR'])` requerido;
  `routeCode?`/`demandTypeCode?`/`criticalityCode?`/`sizeCode?`/`dataAvailabilityCode?` string
  opcionales (validados contra `CatalogItem` activo en el service); `totalEffortHours?` int
  `Min(0)` opcional; `mainResponsible?`/`dependencies?`/`notes?` string opcionales.
- **CreatePriorityEvaluationDto:** `impact,alignment,riskControl,urgency,scope,dataAvailability,
  feasibility,reuse` todos int `@Min(1) @Max(5)` **requeridos**; `justification?` string opcional.
  `score` **no** se acepta (lo calcula el backend).
- **CreateApprovalDto:** `decision` `@IsEnum(['APROBAR','DEVOLVER'])` requerido; `reason?` string
  (validación condicional en el service: requerido si `DEVOLVER`).
- **List DTOs:** `ListRequestsDto` con `state?` `@IsEnum(RequestState)`, `mainProcessId?`
  `@IsUUID`, todos `@IsOptional`.
- **Response DTOs** separados: `RequestResponseDto` (incluye `operationalState`,
  `currentTriageDecision?`, `currentScore?`, `priorityLabel?`, `participants`),
  `TriageResponseDto`, `PriorityEvaluationResponseDto` (con `score` y `thresholdLabel`),
  `ApprovalResponseDto`. Todos con `@ApiProperty`; fechas `date-time`.
  **Contrato de vigencia (MEDIUM-5):** `currentTriageDecision` refleja el único Triage (1:1
  efectivo, §11 D3); `currentScore`/`priorityLabel` reflejan **siempre la última**
  `PriorityEvaluation` por `evaluatedAt` (§11 D4) — las evaluaciones previas se exponen solo por
  `GET /requests/:id/priority` como histórico de solo lectura, sin recálculo ni promedio.

### 3.5 Códigos de estado y manejo de errores

Cada operación que puede fallar, su condición, si es recuperable/fatal, qué recibe el caller y
si se loguea (patrón de Fase 1 §4.4/§6.4; ningún detalle Prisma se expone):

| Situación | Código | Recuperable | Log |
|---|---|---|---|
| Lectura / PATCH ok | 200 | — | no |
| POST ok (crea Request/Triage/Priority/Approval) | 201 | — | no |
| Validación DTO (título vacío, criterio fuera de 1–5, etc.) | 400 | sí | no |
| Code maestro inexistente/inactivo en triage | 400 | sí | no |
| **`DEVOLVER` sin `reason`** (validación de dominio de la acción) | **400** | sí | no (MEDIUM-4) |
| Participante inexistente/inactivo en create Request | 400 | sí | no (NIT-3) |
| Sin actor / usuario inválido | 401 | sí | warn (dev) |
| Rol insuficiente (triage/priority/review) | 403 | sí | no (esperado, AC-006/025) |
| Request/sub-recurso inexistente o fuera de alcance | 404 | sí | no (AC-026) |
| Gate de **precondición de fase**: triage sobre estado ≠ `REGISTRADA` (incluye 2º triage, HIGH-1); priorizar sin triage=Continuar; **priorizar sobre estado ∉ {`EN_TRIAGE`,`BACKLOG_PRIORIZADO`}** (HIGH-2); aprobar/devolver fuera de `BACKLOG_PRIORIZADO` | 409 | sí | no (precondición, AC-002/005/023) |
| Participante duplicado en la lista (incluido el proceso principal) | — (se **deduplica** en el service, NIT-3; no es error) | — | no |
| `mainProcessId` referido no existe | 404 | sí | no |
| Fallo al escribir AuditEvent dentro de la tx | 500 | fatal (rollback total) | error (server) |
| Error Prisma no previsto / BD caída | 500 genérico sin stack | fatal | error (server) |

- **Gate vs. permiso:** gate no cumplido = **409** ("precondición de fase": existe el recurso,
  falta una condición del flujo). Permiso = **403** (rol) / **404** (alcance). Esta separación
  evita confundir "no puedes aún" con "no puedes nunca" (UI-04: "no confundir candado de fase con
  permiso del usuario").
- **Atomicidad:** cada acción (crear Request, decidir triage, guardar evaluación, aprobar) hace
  mutación + cambio de estado + `AuditEvent` en **una** `$transaction`; si algo falla, rollback
  total (invariante §6, igual que Fase 1).

### 3.6 Regeneración de contrato

Tras definir endpoints/DTOs: `npm run contracts:generate` (ya existe), committear
`apps/api/openapi/openapi.json` y `packages/api-client/src/generated/*`. El frontend consume
solo vía `@plantilla-portales/api-client` (`apps/web/src/lib/api-client.ts`), que inyecta
`X-Actor-Id` por middleware (Fase 1 §5.3) — **sin cambios** en ese mecanismo.

---

## 4. Frontend (apps/web, solo vía api-client)

Convierte los **placeholders existentes** en pantallas reales, manteniendo Fase 1 operativo. Las
rutas ya existen en `src/lib/navigation.ts` y como páginas `UnderConstruction`; se reemplaza su
contenido por vistas funcionales (patrón `catalogs-view.tsx`/`equipo-view.tsx`). Nuevos wrappers
tipados en `src/lib/`: `requests.ts`, `triage.ts`, `priority.ts`, `approval.ts` (patrón
`catalog.ts`: traducen status HTTP a mensajes entendibles con una clase `*Error`, sin exponer
JSON/Prisma; 400/403/404/409 mapeados).

### 4.1 Pantallas

- **SCR-03 Solicitudes** (`/demanda/solicitudes`): listado por alcance + alta/edición de ficha.
  Formulario con título (requerido), fecha de registro (default hoy, informativa), proceso
  principal (Select de procesos del alcance, requerido), participantes (multi-select; el proceso
  principal aparece siempre y no se puede quitar — BR-001), campos opcionales de solicitante/área/
  dueño/objetivo/enlace/resultado. **Estado operativo read-only** (badge, BR-022). En edición:
  campo `justificación del cambio` visible (BR-017) y fechas iniciales mostradas como solo lectura.
  Pestañas por fase (Solicitud → Triage → Priorización → Aprobación) con las **posteriores
  bloqueadas** y explicación de precondición (UI-04): p. ej. "Triage disponible tras registrar la
  solicitud", "Priorización disponible solo si el triage es Continuar", "Aprobación disponible
  tras priorizar".
- **SCR-04 Triage** (`/demanda/triage`): visible solo a jefe/líder (gating por `allowedModules`).
  Formulario con ruta/tipo/criticidad/tamaño/disponibilidad (Selects poblados desde
  `/catalog-items?catalog=...`), esfuerzo (horas), responsable, dependencias, observaciones y
  **decisión** (Continuar/Devolver/Rechazar, requerida). Al guardar refleja el nuevo estado. Si
  la solicitud no cumple la precondición de registro, muestra candado/motivo (AC-002) sin permitir
  decidir.
- **SCR-05 Priorización** (`/demanda/priorizacion`): jefe/líder. 8 sliders/inputs 1–5 con sus
  pesos visibles; justificación. El **score lo calcula el backend** y se muestra tras guardar,
  con la etiqueta de umbral (80/65/50) como texto informativo. Bloqueada con precondición si el
  triage vigente no es Continuar (UI-04). Mensaje explícito "Guardar la evaluación no aprueba el
  compromiso" (BR-006).
- **SCR-20 Aprobaciones** (`/administracion/revision` — ruta `review` ya existente en el menú):
  jefe/líder con `review`. La cola se obtiene de `GET /requests/pending-approval` (endpoint propio
  restringido, §3.3/MEDIUM-5), con acción **Aprobar** (→ Comprometida) y **Devolver** (motivo
  requerido; si falta → 400 "motivo obligatorio", el formulario conserva valores). Un usuario sin
  `review` no ve el módulo (gating) y, si fuerza la llamada a la cola o a `POST .../approval`,
  recibe 403 (AC-006). Muestra que la decisión es independiente del guardado de la evaluación.

### 4.2 Estados UI y accesibilidad (obligatorios)

Toda vista con datos implementa **loading / vacío / error / éxito** (UI-02/06, AC-030), con el
patrón de `catalogs-view.tsx`: `Skeleton` en carga, bloque de error con "Reintentar", estado
vacío con acción de crear si el rol lo permite, `toast` (sonner) en éxito/error. Las fases
posteriores se muestran **bloqueadas con explicación de precondición** (UI-04), no como error.

**AC-031 (conservar la entrada ante error):** en los formularios (crear/editar solicitud,
registrar triage, guardar evaluación, aprobar/devolver) el `reset` solo ocurre en el camino de
**éxito** (201/200). Ante fallo (400/403/404/409/500) el formulario **no se limpia ni se cierra**:
conserva los valores, mantiene el foco accesible y muestra el error (toast + mensaje en línea
cuando aplica), para corregir y reintentar sin reescribir.

**Accesibilidad:** HTML semántico, `<Label htmlFor>` en cada control, `aria-live` en regiones de
carga, `aria-current` en navegación activa, estados de foco de shadcn. (La validación plena con
tecnología asistiva requiere pruebas manuales con lectores de pantalla y revisión experta; no se
afirma conformidad WCAG completa.)

### 4.3 Mantener Fase 1

El sidebar, el selector de usuario dev, `/catalogs`, `/gobierno/*` y `/administracion/maestras`
siguen operativos sin cambios. El `moduleKey` de cada pantalla ya coincide con `MODULE_MATRIX`;
el gating de menú es cosmético y el control real es server-side (§2.5).

---

## 5. Testabilidad

**Unit (Jest, `apps/api`)** — prioridad: gates, permisos, fórmula, auditoría (patrón
`*.service.spec.ts` de Fase 1 con `PrismaService` mockeado):
- `request-state.service` / helpers: cada transición implementada (alta→REGISTRADA; triage
  Devolver→DEVUELTA; Rechazar→RECHAZADA; Continuar habilita prioridad; evaluación→BACKLOG_
  PRIORIZADO; approval Aprobar→COMPROMETIDA; approval Devolver→EN_TRIAGE). Afirmar que las
  transiciones **no** implementadas no se disparan.
- Gates (precondición de fase, 409): priorizar sin triage=Continuar → 409; aprobar/devolver fuera
  de `BACKLOG_PRIORIZADO` → 409; registrar triage sobre estado no habilitado (`RECHAZADA`/`DEVUELTA`/
  `COMPROMETIDA`) → 409.
- **Triage 1:1 efectivo (HIGH-1):** primer POST triage sobre `REGISTRADA` → 201 y `EN_TRIAGE`;
  **segundo** POST triage sobre `EN_TRIAGE` → **409 sin mutación** (no se crea 2ª fila ni se cambia
  estado).
- **Precondición de estado de priorización (HIGH-2):** re-POST priority sobre una Request
  `COMPROMETIDA` → **409 sin mutación** (no revierte a `BACKLOG_PRIORIZADO`); POST priority sobre
  `DEVUELTA`/`RECHAZADA` → 409; re-POST priority sobre `BACKLOG_PRIORIZADO` → 201, estado se
  mantiene `BACKLOG_PRIORIZADO` y la evaluación vigente pasa a ser la última.
- **Camino approval-devolver → re-priorizar → re-aprobar (MEDIUM-3):** `DEVOLVER` deja `EN_TRIAGE`;
  desde ahí un POST priority (triage sigue=Continuar) → 201 y `BACKLOG_PRIORIZADO`; un POST triage
  desde ese `EN_TRIAGE` → 409 (el triage no se re-ejecuta); luego `APROBAR` → `COMPROMETIDA`.
- Validaciones de dominio (400, no 409): `DEVOLVER` sin `reason` → 400 (MEDIUM-4); code maestro
  inexistente → 400; participante inexistente/inactivo → 400 (NIT-3).
- Destino de devolución (HIGH-1): Approval `DEVOLVER` deja `resultingState = EN_TRIAGE` y
  `previousState = BACKLOG_PRIORIZADO`; test que fija ese destino determinista.
- Frontera de reapertura: no existe transición que saque de `DEVUELTA`; test que afirma que
  registrar triage sobre una Request `DEVUELTA` → 409 (no reabre).
- Fórmula de score: casos límite (todos 5 → 100; todos 1 → 20; mezcla con redondeo
  `Math.round`); etiqueta de umbral por tramo.
- Permisos/alcance: triage/priority/review con rol insuficiente → 403; Request de otro proceso →
  404 (where por `mainProcessId`); aprobar sin `review` → 403 sin mutación (AC-006).
- Auditoría: cada mutación invoca `AuditService.record` con `objectType` correcto
  (REQUEST/TRIAGE/PRIORITY_EVALUATION/APPROVAL), `scopeProcessId = mainProcessId` y before/after.
- **Visibilidad de auditoría por alcance (NIT-8):** test de integración que verifica que, dado que
  los eventos de Fase 2 se escriben con `scopeProcessId = mainProcessId`, la lectura de auditoría de
  Fase 1 (`AuditService.findMany` filtrando `scopeProcessId ∈ scopedProcessIds`) muestra a un líder
  del proceso A los eventos de Fase 2 de Requests con `mainProcessId = A` y **no** los de B.
- Validación de codes maestros del triage contra CatalogItem (inexistente/inactivo → 400).
- Invariante BR-001: crear/editar Request siempre deja `RequestParticipant` del proceso principal.

**E2E (Playwright, `/e2e`)** — flujo FLOW-001 y controles negativos:
- AC-001: crear solicitud sin título → no persiste, campo señalado.
- AC-002: intentar priorizar sin triage=Continuar, o aprobar sin backlog → candado/motivo (409),
  sin mutación (precondición de fase, no de datos de registro).
- AC-003: líder decide Continuar/Devolver/Rechazar → guarda decisión/actor/fecha; solo Continuar
  habilita priorizar.
- Devolución de aprobación: aprobar lleva a Comprometida; devolver con motivo lleva a En triage;
  devolver sin motivo → error de motivo (400), formulario conserva valores. **Tras devolver
  (MEDIUM-3):** se puede re-guardar la priorización y re-presentar a aprobación hasta Comprometida;
  no aparece acción de re-triage.
- Monotonía del compromiso (HIGH-2): una vez Comprometida, re-guardar la evaluación de prioridad no
  está disponible / devuelve candado (no revierte el compromiso).
- AC-004: evaluación con 8 valores → score 0–100 con pesos observados.
- AC-005: score guardado → sigue pendiente hasta aprobación.
- AC-006: usuario sin `review` intenta aprobar → denegado sin mutación (403).
- AC-025: integrante abre URL de triage/priorización → 403.
- AC-026: líder A abre solicitud de proceso B → 404.
- AC-028: cada mutación aparece en auditoría (actor/acción/fecha) — reutiliza la vista de Fase 1.
- AC-031: POST fallido (p. ej. gate 409) conserva los valores del formulario.
- AC-030: listado de solicitudes vacío muestra estado vacío con acción de crear si el rol permite.

Verificación de cierre (steering): `npm run typecheck`, `npm run build`, `npm run test:unit`,
`npm run test:e2e` pasan; `npm run contracts:generate` con artefactos committeados; Fase 1,
`/catalogs` y `/catalog-items` siguen operativos; migración `fase2_demanda` aplicada y seed
idempotente.

---

## 6. AuditEvent: invariante en Fase 2

**Invariante:** ninguna mutación de dominio de Fase 2 sin su `AuditEvent`, dentro de la misma
`$transaction`. **Dueño:** la capa de service (único lugar con Prisma y actor), igual que Fase 1
§6. Contenido:
- `actorUserId`: del `CurrentActor`.
- `scopeProcessId`: **siempre `Request.mainProcessId`** (para que la auditoría respete el alcance
  por proceso de la lectura de Fase 1: líder ve eventos de sus procesos).
- `action`: `CREATE` al crear Request/Triage/PriorityEvaluation/Approval; `UPDATE` al editar la
  Request o cambiar su estado por un gate; `before/after` capturan el cambio (incluido
  `operationalState`).
- `objectType`: `REQUEST | TRIAGE | PRIORITY_EVALUATION | APPROVAL`.

Cada acción compuesta (p. ej. aprobar) emite los eventos que correspondan (CREATE Approval +
UPDATE Request con el cambio de estado) en la misma transacción.

---

## 7. Resumen de archivos a crear/modificar

**apps/api**
- `prisma/schema.prisma` — + Request, RequestParticipant, Triage, PriorityEvaluation, Approval
  (y relaciones inversas en Process/User).
- `prisma/migrations/<ts>_fase2_demanda/migration.sql` — vía `npm run prisma:migrate:dev`.
- `prisma/seed.ts` — **extender** `CATALOG_ITEMS` con `TRIAGE_ROUTE` y `TRIAGE_SIZE` (idempotente).
- `src/modules/request/` — módulo raíz + submódulos `triage/`, `priority/`, `approval/`
  (controller + service + dto + spec), `request-state.ts`, `request-state.service.ts`.
- `src/modules/audit/audit.service.ts` — ampliar `AuditObjectType` con los 4 nuevos tipos.
- `src/app.module.ts` — registrar `RequestModule` (sin tocar los existentes).

**packages/api-client** — regenerado con `npm run contracts:generate` (committear artefactos).

**apps/web**
- `src/app/demanda/solicitudes/page.tsx` + `solicitudes-view.tsx` (+ diálogos de ficha).
- `src/app/demanda/triage/page.tsx` + `triage-view.tsx`.
- `src/app/demanda/priorizacion/page.tsx` + `priorizacion-view.tsx`.
- `src/app/administracion/revision/page.tsx` + `revision-view.tsx`.
- `src/lib/requests.ts`, `src/lib/triage.ts`, `src/lib/priority.ts`, `src/lib/approval.ts`.
- Componentes shadcn ya presentes (textarea no existe aún: añadir `components/ui/textarea.tsx`
  solo si hace falta para observaciones/justificación; es parte del stack shadcn, no nueva dep).

Navegación (`src/lib/navigation.ts`) **no cambia**: las rutas ya existen con sus `moduleKey`.

---

## 8. Fuera de alcance (explícito)

Respetando `28` (todo lo marcado **P**) y el enunciado:
- **Plan, Fase, Tarea, Hito, Capacidad, Ejecución** (FEATURE-004/005, fases posteriores): no se
  modelan ni se exponen; los estados `EN_PLANIFICACION`+ solo se **modelan** en el enum, sin
  transición ni acción (§1.3).
- **Frameworks/controles/evidencia, GA3–GA5, Excel, notificaciones, SLA, correo, firma, tareas
  programadas** (FEATURE-008, `03`, SCR-06/19): no se implementan.
- **Reapertura/cambio de un triage ya decidido** (`06`/SCR-04 → P): no se implementa. El triage es
  **1:1 efectivo** en Fase 2 (2º POST → 409, HIGH-1); la tabla 1:N no bloquea reabrir a futuro, pero
  ningún endpoint lo expone. El punto exacto a reabrir es el gate de §2.1.
- **Retorno desde `DEVUELTA`** (`06` "retorno exacto P", en tensión con el flowchart de FLOW-001):
  no se implementa; `DEVUELTA` es estado sin salida en Fase 2 (§1.3). Punto a reabrir cuando el Site
  confirme destino y condición del retorno.
- **Reenvío/doble decisión/cola persistente de aprobación, estados terminales/retiro/cierre**
  (`06`/SCR-20 → P): no se implementan; modelados como histórico append-only que no los bloquea.
- **Fórmula/redondeo/cortes exactos del Site** (BR-005, `28` punto 4): se adopta la fórmula de
  §1.4 como DECISIÓN de Fase 2, no como la del Site.
- **Requeridos por fase no confirmados** (BR-002, `28` punto 3): no se imponen; solo título +
  proceso principal (confirmados).
- **Alcance por proceso participante (no principal)** (`10` multiproceso P): el scope lo gobierna
  el proceso principal (§11 D9).
- **`ProcessScopeGuard`**: no se crea (Fase 1 §8); alcance en el `where` del service.
- **Autenticación real**: se mantiene el header de dev de Fase 1 sin cambios.

---

## 9. Mapa de criterios de aceptación cubiertos

| AC | Cómo se cumple |
|---|---|
| AC-001 | `title` requerido en DTO + validación; sin título → 400, campo señalado |
| AC-002 | **Candado de fase** por precondición del flujo (no de datos de registro, MEDIUM-1): triage sobre estado no habilitado / priorizar sin Continuar / aprobar sin backlog → 409 con motivo; UI muestra candado (§2.1, §2.3, §2.4, §4.1) |
| AC-003 | Triage guarda decision/decidedBy/decidedAt; solo Continuar habilita prioridad (§2.2) |
| AC-004 | 8 criterios 1–5, pesos 25/15/15/10/10/10/10/5, score 0–100 calculado en backend (§1.4) |
| AC-005 | Guardar evaluación → BACKLOG_PRIORIZADO pero no aprueba; aprobación aparte (§2.3/2.4) |
| AC-006 | Approval exige `review`; sin permiso → 403 sin mutación (§2.4) |
| AC-025 | Integrante en triage/priority/review → 403 (§2.5/2.6) |
| AC-026 | Request de otro proceso → 404 (where por mainProcessId) |
| AC-028 | Toda mutación auditada con actor/acción/fecha, scopeProcessId=mainProcessId (§6) |
| AC-030 | Estados vacíos con acción de crear según rol (§4.2) |
| AC-031 | Formularios conservan valores ante error; reset solo en éxito (§4.2) |

> **Nota de códigos HTTP (NIT-2).** La asignación de códigos a estos AC es una **DECISIÓN heredada
> de Fase 1** (403 = rol insuficiente, 404 = fuera de alcance, 409 = precondición de fase, 400 =
> validación de dato). Los AC en sí **no** fijan un código: AC-025/AC-026 solo exigen "denegar sin
> filtrar datos no autorizados" y AC-002 "mostrar candado/motivo sin permitir la decisión". Los
> códigos son el contrato interno que la UI usa para distinguir los casos, no un requisito literal
> del SDD.

---

## 10. Riesgos y notas de implementación

- **Prisma 7 / uniques:** usar `findFirst` para lecturas por campo único de un solo campo; los
  uniques compuestos (`request_participant_unique`) sí sirven como `where` de `findUnique`
  (hallazgo de Fase 1 respetado).
- **Transiciones compuestas:** aprobar/decidir triage mutan Request + crean sub-objeto + auditan;
  mantener todo en una `$transaction` (si falla el AuditEvent, rollback total).
- **Codes maestros:** validar contra `CatalogItem` activo en el service, no confiar en el cliente;
  code inactivo → 400 (tolera reconfiguración de catálogos, BR-018).
- **Estado read-only:** el DTO de update de Request nunca incluye `operationalState`; el único
  camino para cambiarlo son los gates (BR-022).

---

## 11. DECISIONES de diseño (puntos marcados P en el SDD)

Cada decisión adopta la opción mínima, documentada y reversible; **ninguna** afirma ser el
comportamiento exacto del Site.

- **D1 — Campos de solicitante/área/dueño como texto opcional (`08`/`29`/SCR-03 "No confirmado").**
  Se guardan como texto y **opcionales**, no FK a catálogo ni requeridos. No se impone un required
  que el SDD marca P. **Gancho de reapertura explícito (NIT-7, mismo criterio que Fase 1 con el
  `@@unique` de Grant):** si el Site confirma el catálogo de áreas, `requesterArea` pasa a guardar
  el `code` de un `CatalogItem` de familia `REQUESTER_AREA` (sembrada en el seed) **sin romper
  datos existentes** — como el campo ya es texto, los valores actuales quedan como texto libre
  legado y los nuevos como `code`; una migración futura puede mapearlos. También reabrir si el Site
  confirma obligatoriedad de alguno de estos campos.
- **D2 — BR-001 materializada (confirmada, pero su representación es decisión).** El proceso
  principal se guarda además como `RequestParticipant`, convirtiendo "principal siempre participa"
  en invariante de datos. Tabla puente explícita para auditar y controlar `onDelete`.
- **D3 — Triage: tabla 1:N, pero 1:1 efectivo en Fase 2 (SCR-04 "reapertura P"; HIGH-1).** La tabla
  admite N filas por extensibilidad futura, pero el gate de §2.1 (triage solo desde `REGISTRADA`)
  hace que en Fase 2 **solo exista un Triage por Request**: un 2º POST → 409. No se implementa
  reabrir ni re-decidir (P); el punto exacto a reabrir es el gate, sin tocar el modelo. El triage
  vigente es esa única fila.
- **D4 — PriorityEvaluation 1:N con contrato de lectura cerrado (SCR-05 "efecto de revaluar P";
  HIGH-2/MEDIUM-5).** Histórico; **vigente = la última por `evaluatedAt`**; las previas son
  histórico de solo lectura; sin recálculo/promedio. Re-evaluar solo es válido en `EN_TRIAGE`
  (triage=Continuar) o `BACKLOG_PRIORIZADO` (§2.3); nunca sobre `COMPROMETIDA`/`DEVUELTA`/
  `RECHAZADA`, de modo que revaluar jamás revierte un compromiso (BR-006). No se afirma la mecánica
  exacta de revaluar.
- **D5 — Estado tras triage.** `REGISTRADA → EN_TRIAGE` al registrar triage (solo desde
  `REGISTRADA`; salir de `DEVUELTA` es reapertura, fuera de alcance, MEDIUM-2);
  `CONTINUAR` **no** crea un estado "triage aprobado" (no confirmado en `06`): la habilitación de
  prioridad se deriva de "triage vigente = Continuar". Evita estados inventados.
- **D6 — Modelo de aprobación mínimo (SCR-20/`06` "cola/estados/motivos P").** Acción separada
  `APROBAR`/`DEVOLVER`; `APROBAR`→`COMPROMETIDA`; `DEVOLVER`→**destino determinista `EN_TRIAGE`**
  (`previousState = BACKLOG_PRIORIZADO`) con `reason` requerido —su ausencia es validación 400, no
  gate 409—. **El destino `EN_TRIAGE` habilita re-priorizar, NO re-triage (MEDIUM-3):** el triage
  vigente=Continuar queda intacto (triage 1:1, D3) y lo que se reabre es la priorización (§2.3) para
  re-presentar a aprobación; el triage no se re-ejecuta (reapertura de triage es P). La **cola** de
  SCR-20 es el endpoint propio `GET /requests/pending-approval` restringido a `review` + alcance,
  no un filtro de query abierto ni una entidad; sin reenvío ni doble decisión. Approval append-only.
- **D7 — Fórmula de prioridad y estado al guardar (BR-005/`28` punto 4 P).** `score =
  round(Σ peso_i·(valor_i/5))`, redondeo `Math.round`, 8 criterios requeridos 1–5; guardar la
  evaluación lleva a `BACKLOG_PRIORIZADO` (desde `EN_TRIAGE` con triage=Continuar, o re-guardado
  idempotente en estado desde `BACKLOG_PRIORIZADO`; nunca desde `COMPROMETIDA`/`DEVUELTA`/
  `RECHAZADA`, HIGH-2). Umbrales 80/65/50 solo etiqueta informativa, sin transición automática; la
  **inclusividad `>=` y el tramo `<50` son parte de esta decisión** (cortes inclusivos P en `28`
  punto 4), no del Site (NIT-6). Marcada como DECISIÓN de Fase 2, no fórmula del Site.
- **D8 — Maestras `TRIAGE_ROUTE` y `TRIAGE_SIZE` (SCR-04/`08` valores exactos P).** Ruta con las
  4 opciones confirmadas por BR-003 (BI/Integraciones/IA/Multiproceso-FMAA); tamaño con escala
  provisional S/M/L/XL sin ruido, a cotejar. Añadidas al seed idempotente sin reescribirlo.
- **D9 — Alcance multiproceso y validación de participantes (`10` multiproceso P; NIT-3).** El
  **proceso principal gobierna el scope** de la Request; la participación (proceso no principal) no
  otorga alcance en Fase 2. Reabrir si el Site confirma visibilidad por participación. **Validación
  de `participantProcessIds` (service, NIT-3):** cada id debe corresponder a un `Process`
  **activo**; un id inexistente o inactivo → **400** ("Revisa los datos ingresados", sin exponer
  Prisma). **No** se restringen al alcance del actor: dado que participar **no** amplía scope
  (coherente con esta misma D9), un líder puede añadir como participante un proceso donde no tiene
  grant; esto no le concede acceso adicional. El **proceso principal se deduplica**: si
  `mainProcessId` viene también en `participantProcessIds`, se inserta una sola fila de
  `RequestParticipant` (BR-001 lo materializa siempre; §11 D2), sin violar
  `request_participant_unique`.
- **D10 — Estructura de módulos.** Módulo raíz `request/` con submódulos `triage/`/`priority/`/
  `approval/` (cohesión por dependencia de la Request y scope compartido), frente a módulos
  totalmente independientes (más duplicación) o un solo módulo monolítico (menos cohesivo). Se
  elige el intermedio por "monolito modular" del steering.

---

## 12. Respuestas a la revisión (Revisión 2 → Revisión 3)

Cada hallazgo de `design-review.json` (iteración sobre la Revisión 2), con su resolución y dónde
quedó aplicada. Todos los hallazgos eran **inconsistencias internas de la máquina de estados**: la
prosa prometía comportamientos que los gates no producían. Se resolvieron **todos** (2 HIGH, 3
MEDIUM, 3 NIT).

- **HIGH-1 — El gate de triage (§2.1) solo permite un Triage, contradiciendo el modelo 1:N
  "histórico, vigente = último".** *Resuelto (opción A del hallazgo).* Se adopta **triage 1:1
  efectivo en Fase 2**: la tabla sigue siendo 1:N por extensibilidad, pero como el 1er triage lleva
  `REGISTRADA → EN_TRIAGE`, cualquier 2º `POST .../triage` cae en el gate "solo desde `REGISTRADA`"
  → **409**. Se reescribió §11 D3, el diagrama de §1.2, el párrafo de la entidad Triage, §2.1
  (regla explícita + nota del 2º POST), y el endpoint de §3.3. Se añadió el test "2º POST triage →
  409 sin mutación" (§5). Se eliminó la afirmación de "histórico 1:N vigente=último" como
  comportamiento de runtime; queda documentado como punto P a reabrir (ampliar el gate, sin tocar
  el modelo).
- **HIGH-2 — El gate de priorización (§2.3) carecía de precondición de estado: una re-evaluación
  podía devolver una Request `COMPROMETIDA` a `BACKLOG_PRIORIZADO`.** *Resuelto.* Se añadió en §2.3
  la **precondición de estado**: `POST .../priority` solo válido en `EN_TRIAGE` (triage=Continuar)
  o `BACKLOG_PRIORIZADO`; en `COMPROMETIDA`/`DEVUELTA`/`RECHAZADA`/posteriores → **409 sin
  mutación**. Esto impide que un guardado de evaluación revierta un compromiso (BR-006). Reflejado
  en la tabla de transiciones (§1.3), §3.5 (fila 409), §3.3 (endpoint priority), §11 D4/D7, y tests
  "re-POST priority sobre `COMPROMETIDA` → 409" + monotonía del compromiso (§5).
- **MEDIUM-3 — "DEVOLVER de Approval reabre la fase de triage/priorización" (D6) era inalcanzable:
  desde `EN_TRIAGE` el triage queda bloqueado.** *Resuelto.* Se reescribió §11 D6 y §2.4: el
  destino `EN_TRIAGE` habilita **re-priorizar** (§2.3) y re-presentar a aprobación, con el triage
  vigente=Continuar intacto; el triage **no** se re-ejecuta (reapertura de triage es P). Se añadió
  el test "approval-devolver → re-priorizar → re-aprobar" y "POST triage desde ese `EN_TRIAGE` →
  409" (§5).
- **MEDIUM-4 — El triage-`DEVOLVER`→`DEVUELTA` terminal no se reconciliaba con FLOW-001.**
  *Resuelto.* En la nota de `DEVUELTA` (§1.3) se cita explícitamente la tensión: FLOW-001 dibuja
  `Devolver → Solicitud` para corregir, pero `06` marca el **retorno exacto como P**; Fase 2 adopta
  `DEVUELTA` como estado sin salida implementada (coherente con §8) y declara este punto como el
  exacto a reabrir cuando el Site confirme el retorno. Reflejado también en §8.
- **MEDIUM-5 — La re-ejecución de priorización ("revaluar") no definía el efecto sobre el score
  vigente ni la etiqueta.** *Resuelto.* En §11 D4, §1.4 y §3.4 se fija el contrato observable:
  `currentScore`/`priorityLabel` del `RequestResponseDto` y de la cola de aprobación reflejan
  **siempre la última** `PriorityEvaluation` por `evaluatedAt`; las anteriores son histórico de
  solo lectura; sin recálculo ni promedio (efecto de revaluar P). La validez del re-POST queda
  ligada a la precondición de estado del HIGH-2.
- **NIT-6 — La etiqueta de umbral definía cuatro tramos cuando el SDD solo confirma los cortes
  80/65/50.** *Resuelto.* En §1.4 y §11 D7 se atribuye la **inclusividad `>=`** y el **tramo `<50`**
  a la DECISIÓN D7 (cortes inclusivos P en `28`), aclarando que es solo etiqueta sin efecto.
- **NIT-7 — `requesterArea` como texto sin gancho de migración.** *Resuelto.* §11 D1 añade el punto
  exacto de reapertura: si el Site confirma catálogo de áreas, `requesterArea` pasa a `code` de
  `CatalogItem` familia `REQUESTER_AREA` sin romper datos existentes (campo ya es texto).
- **NIT-8 — §5 no probaba que `scopeProcessId = mainProcessId` haga visible la auditoría de Fase 2
  en la lectura por rol de Fase 1.** *Resuelto.* Se añadió en §5 el test de integración: un líder
  del proceso A ve en auditoría los eventos de Fase 2 de Requests con `mainProcessId = A` y no los
  de B (vía `AuditService.findMany` por `scopeProcessId ∈ scopedProcessIds`).

### Hallazgos de la Revisión 1 (ya resueltos en la Revisión 2, se mantienen)

Se conservan las resoluciones previas, que esta revisión no revierte: destino determinista de
`DEVOLVER` de approval (previo HIGH-1); 409 único del gate de registro→triage (previo HIGH-2); gate
de registro tautológico aclarado y AC-002 cubierto por precondiciones reales del flujo (previo
MEDIUM-1); `operationalState` con `@default` solo en el schema y escritura solo por el helper de
transición (previo MEDIUM-3); `DEVOLVER` sin `reason` como 400 (previo MEDIUM-4); cola de
aprobaciones con endpoint propio `GET /requests/pending-approval` (previo MEDIUM-5); autorización
como paso separado P (previo NIT-1); códigos HTTP como DECISIÓN heredada de Fase 1 (previo NIT-2);
`participantProcessIds` validados y proceso principal deduplicado (previo NIT-3).
