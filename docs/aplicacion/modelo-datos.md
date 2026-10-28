# Modelo de datos

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

Fuente: `apps/api/prisma/schema.prisma` (Prisma ORM v7, PostgreSQL). El nombre entre
paréntesis en cada entidad es el de la tabla (`@@map`). Prisma se usa **solo** en el
backend.

Nota sobre "enums lógicos": varios estados (`operationalState`, `Plan.status`,
`Task.status`, `Asset.status`, `Document.status`, `GateCheck.status`, estados de
diarios/novedades/compromisos) se guardan como `String`, no como enum de Prisma. Son
máquinas de estado que escriben solo los *helpers* de estado del backend, nunca un DTO
libre.

## Fundaciones (identidad, procesos, permisos, auditoría)

### CatalogItem (`catalog_items`) — funcionalidad base
Maestra genérica reutilizable (no es una maestra de negocio concreta).
- Campos clave: `catalog`, `code`, `label`, `active`, `sortOrder`.
- Restricciones: único `(catalog, code)`; índices por `catalog`, `active`, `sortOrder`.

### Area (`areas`)
Área organizativa (p. ej. Analítica) que agrupa procesos.
- Campos clave: `code` (único, estable), `name`, `active`, `sortOrder`.
- Restricciones: único `code`; índices por `active`, `sortOrder`.
- Relaciones: `processes` (1:N con `Process`).

### Process (`processes`)
Proceso del área (BI, Integraciones, IA) y la coordinación multiproceso FMAA.
- Campos clave: `code` (MAYÚSCULAS, estable), `name`, `framework?`, `kind`, `areaId`
  (FK requerida al `Area`), `active`, `sortOrder`.
- Restricciones: único `code`; índices por `active`, `sortOrder`.
- Relaciones: `area` → `Area` (`onDelete: Restrict`); raíz de alcance de casi todo
  (grants, requests, tasks, assignments, diarios, semanales, novedades, reuniones,
  compromisos, activos, eventos de auditoría).

### User (`users`)
Identidad funcional de una persona (no es credencial por sí misma).
- Campos clave: `identifier`, `name`, `active`, `passwordHash?` (solo lo usa el login
  JWT; nunca se expone).
- `isAdmin` (`is_admin`, default `false`): rol de sistema ADMIN, global e
  independiente de los grants por proceso.
- Restricciones: único `identifier`; índice por `active`.
- Relaciones: grants, y numerosas FKs como actor/responsable/autor en los flujos
  (triage, planes, tareas, disponibilidad, diarios, reuniones, activos, gobierno…).

### Role (`roles`)
Catálogo cerrado de 3 perfiles. El `code` gobierna la autorización.
- Campos clave: `code` (`JEFE_AREA`, `LIDER_PROCESO`, `INTEGRANTE`), `name`.
- Restricciones: único `code`.

### Grant (`grants`)
Asignación de un usuario a un rol dentro de un proceso (corazón del alcance). Revocar =
`active=false` (soft-delete).
- Campos clave: `userId`, `roleId`, `processId`, `active`.
- Restricciones: único `(userId, roleId, processId)`; índices por `userId`,
  `processId`, `roleId`, `active`.
- Relaciones: `User`, `Role`, `Process` (todas `onDelete: Restrict`).

### AuditEvent (`audit_events`)
Registro append-only de cada mutación (inmutable, sin `updatedAt`).
- Campos clave: `actorUserId?`, `action`, `objectType`, `objectId`, `scopeProcessId?`,
  `before?` (JSON), `after?` (JSON), `createdAt`.
- Restricciones/índices: por `(objectType, objectId)`, `actorUserId`, `scopeProcessId`,
  `createdAt` y, para la lectura paginada (filtro + orden `createdAt` desc),
  `(objectType, createdAt desc)`, `(actorUserId, createdAt desc)` y
  `(scopeProcessId, createdAt desc)`.

### AuthToken (`auth_tokens`)
Token de un solo uso para los flujos de credencial por correo (reestablecimiento de
contraseña e invitación/activación de cuenta). El valor en claro (alta entropía,
`randomBytes` ≥ 32 bytes) viaja solo en el correo; en BD se guarda únicamente su
SHA-256.
- Campos clave: `userId`, `purpose` (`PASSWORD_RESET` / `USER_INVITATION`), `tokenHash`
  (SHA-256), `expiresAt`, `usedAt?` (marca el consumo de un solo uso), `createdAt`.
- Relaciones: `User` (`onDelete: Cascade`).
- Índices: por `userId`, `tokenHash`.
### SmtpConfig (`smtp_config`)
Configuración SMTP editable en runtime (fila única / singleton). Permite al ADMIN cambiar
el servidor de correo sin tocar `.env` ni reconstruir.
- Campos clave: `host`, `port`, `secure` (default `false`), `username?`,
  `passwordCiphertext?` (`password_ciphertext`), `fromAddress` (`from_address`),
  `fromName?` (`from_name`), `updatedByUserId?` (`updated_by_user_id`).
- El password se guarda **cifrado** (AES-256-GCM, formato `iv.tag.ciphertext` base64) con
  la clave `SETTINGS_ENCRYPTION_KEY`; nunca en claro ni devuelto al frontend.
- La URL base del frontend (`APP_WEB_URL`) NO se persiste aquí: es responsabilidad del
  entorno.
- Relaciones: `updatedBy` → `User` (`onDelete: SetNull`).


## Flujo de demanda

### Request (`requests`)
Ficha de la demanda; núcleo del flujo.
- Campos clave: `title`, `registeredAt`, datos del solicitante (`requesterArea?`,
  `requesterName?`, `functionalOwner?`), `targetDate?`, `referenceUrl?`,
  `expectedResult?`, `mainProcessId`, `assetId?` (activo base sobre el que se
  trabaja la solicitud, P1; nullable hasta que la mesa lo asocie),
  `operationalState` (default `REGISTRADA`),
  `initialCommitmentDate?`, `changeJustification?`.
- Campos de gobierno (fase 7): `governanceRoute?`, flag de bloqueo transversal
  (`blockedReason?`, `blockedAt?`, `blockedByUserId?`, `blockedResolvedAt?`,
  `blockedResolvedByUserId?`).
- Restricciones/índices: por `mainProcessId`, `operationalState`, `registeredAt`,
  `governanceRoute`, `blockedAt`, `assetId`.
- Relaciones: `mainProcess`, `asset?` (activo base, N:1 con `onDelete: Restrict`,
  relación `RequestAsset`), participantes, triages, evaluaciones de prioridad,
  aprobaciones, `plan?` (1:1 efectivo), asignaciones, actividades/novedades/reuniones/
  compromisos relacionados, activos de origen (`assets`, relación
  `AssetOriginRequest`), gates y validaciones de gobierno.

### RequestParticipant (`request_participants`)
Puente N:M `Request ↔ Process` (procesos participantes); el proceso principal siempre
se materializa aquí.
- Restricciones: único `(requestId, processId)`; índice por `processId`.

### Triage (`triages`)
Clasificación y decisión de ruta.
- Campos clave: `routeCode?`, `demandTypeCode?`, `criticalityCode?`, `sizeCode?`,
  `dataAvailabilityCode?`, `totalEffortHours?`, `mainResponsibleUserId?`, `decision`,
  `decidedAt`, `decidedByUserId`, `dependencies?`, `notes?`.
- Índices: por `requestId`, `decidedByUserId`, `mainResponsibleUserId`.

### PriorityEvaluation (`priority_evaluations`)
Evaluación ponderada de 8 criterios (histórico; vigente = la última por `evaluatedAt`).
- Campos clave: `impact`, `alignment`, `riskControl`, `urgency`, `scope`,
  `dataAvailability`, `feasibility`, `reuse`, `score` (lo calcula el backend),
  `justification?`, `evaluatedAt`, `evaluatedByUserId`.
- Índices: por `requestId`, `evaluatedByUserId`.

### Approval (`approvals`)
Decisión de autorización del compromiso (append-only, sin `updatedAt`).
- Campos clave: `decision`, `reason?`, `previousState`, `resultingState`, `decidedAt`,
  `decidedByUserId`.
- Índices: por `requestId`, `decidedByUserId`, `decidedAt`.

## Plan y ejecución

### Plan (`plans`)
Plan de trabajo de una Request comprometida (1:1 efectivo con Request).
- Campos clave: `requestId`, `periodStart?`, `periodEnd?`, `commitmentDate?`, `risks?`,
  `mitigations?`, `status` (default `BORRADOR`), datos de envío/autorización/devolución.
- Restricciones: único `requestId`; índice por `status`.

### PlanPhase (`plan_phases`)
Fase del plan (ordenada por `order` 0-based; la inicial es la de `order` mínimo).
- Campos clave: `planId`, `name`, `startDate?`, `endDate?`, `deliverable?`, `order`.
- Restricciones: único `(planId, order)`; índice por `planId`.

### Task (`tasks`)
Tarea del plan.
- Campos clave: `phaseId`, `processId?`, `title`, `responsibleUserId?`, `startDate?`,
  `endDate?`, `estimateHours?`, `isMilestone`, `description?`, `acceptanceCriteria?`,
  `status` (default `POR_HACER`), `progress`, `frameworkPhaseRequired?`, `accepted`,
  `acceptedAt?`, `acceptedByUserId?`, `evidenceUrl?`.
- Restricciones/índices: por `phaseId`, `responsibleUserId`, `status`.

### TaskDependency (`task_dependencies`)
Dependencia dirigida entre dos tareas del mismo plan (append-only).
- Campos clave: `dependentTaskId`, `predecessorTaskId`.
- Restricciones: único `(dependentTaskId, predecessorTaskId)`; índice por
  `predecessorTaskId`.

## Capacidad

### MonthlyAvailability (`monthly_availabilities`)
Disponibilidad de horas de una persona en un mes (una fila por persona/mes).
- Campos clave: `userId`, `month` (`@db.Date`, primer día del mes UTC), `availableHours`.
- Restricciones: único `(userId, month)`; índice por `month`.

### Assignment (`assignments`)
Horas comprometidas de una persona en un mes, en un proceso (opcionalmente ligadas a
una Request). Se agregan por periodo/proceso (varias filas por persona/mes).
- Campos clave: `userId`, `month`, `processId`, `requestId?`, `committedHours`,
  `description?`.
- Índices: por `(userId, month)`, `processId`, `requestId`.

## Trabajo y coordinación

### DailyLog (`daily_logs`)
Cabecera de registro diario por proceso + fecha + autor.
- Campos clave: `authorUserId`, `processId`, `date` (`@db.Date`), `status`
  (default `BORRADOR`), `submittedAt?`, `dayNotes?`.
- Restricciones: único `(authorUserId, processId, date)`; índices por `processId`,
  `date`, `status`.

### DailyLogActivity (`daily_log_activities`)
Actividad de un registro diario (con clasificación de maestra `ACTIVITY_CLASS`).
- Campos clave: `dailyLogId`, `classificationCode`, referencias opcionales
  (`projectRequestId?`, `taskId?`, `assetRef?`, `requesterRef?`, `relatedIssueId?`,
  `assetId?`), `hours`, `evidenceUrl?`, `nextStep?`, `nextStepDate?`.
- Índices: por `dailyLogId`, `classificationCode`, `taskId`, `projectRequestId`,
  `relatedIssueId`, `assetId`.

### WeeklyReport (`weekly_reports`)
Registro semanal anclado al lunes; consolida por lectura los diarios del proceso.
- Campos clave: `authorUserId`, `processId`, `weekStart` (`@db.Date`), `status`
  (default `BORRADOR`), `submittedAt?`, y secciones de texto (`results?`, `proposals?`,
  `blockers?`, `commitmentsText?`, `decisions?`).
- Restricciones: único `(authorUserId, processId, weekStart)`; índices por `processId`,
  `weekStart`.

### Issue (`issues`)
Novedad (un registro por incidente que se edita hasta resolver).
- Campos clave: `processId`, `reportedByUserId`, `date`, `typeCode` (default `BLOQUEO`),
  referencias opcionales (`relatedRequestId?`, `relatedTaskId?`, `relatedAssetRef?`,
  `assetId?`), `title`, `detail?`, `impact?`, `resolverUserId?`, `targetDate?`,
  `resolution?`, `state` (default `EN_CURSO`).
- Índices: por `processId`, `reportedByUserId`, `state`, `typeCode`, `assetId`.

### Meeting (`meetings`)
Reunión (estado inicial `BORRADOR`); participantes N:M con `User`.
- Campos clave: `processId`, `title`, `state`, `relatedRequestId?`,
  `responsibleUserId?`, `meetingDate`, `meetingTime?` (texto `HH:mm`),
  `relatedProjectRequestId?`, `agenda?`, `decisions?`, `notes?`.
- Índices: por `processId`, `state`, `meetingDate`.

### MeetingParticipant (`meeting_participants`)
Puente N:M `Meeting ↔ User` (append-only).
- Restricciones: único `(meetingId, userId)`; índice por `userId`.

### Commitment (`commitments`)
Compromiso (vencimiento requerido; reunión fuente opcional).
- Campos clave: `processId`, `title`, `state` (default `EN_CURSO`), `relatedRequestId?`,
  `responsibleUserId?`, `assignedUserId?`, `dueDate`, `relatedProjectRequestId?`,
  `sourceMeetingId?`, `expectedResult?`, `result?`, `blockers?`.
- Índices: por `processId`, `state`, `assignedUserId`, `responsibleUserId`,
  `sourceMeetingId`, `dueDate`.

## Activos y documentos

### Asset (`assets`)
Activo analítico anclado a un proceso (FK requerida = ancla de alcance). Sin borrado
físico: retiro = cambio de estado.
- Campos clave: `processId`, `requestId?`, `ownerUserId?`, `name`, `status`
  (default `BORRADOR`), atributos por código de maestra (`typeCode?`, `technologyCode?`,
  `sourceCode?`, `frequencyCode?`), `documentationRef?`, `functionalDescription?`,
  `dependencies?`.
- Índices: por `processId`, `requestId`, `status`, `typeCode`.
- Relaciones: `process`, `request?` (solicitud de origen, relación
  `AssetOriginRequest`), `owner?`, `requestsAssociated` (solicitudes que usan este
  activo como base, inversa de `Request.asset`, relación `RequestAsset`), documentos,
  actividades de bitácora y novedades.

### Document (`documents`)
Metadatos de un documento Markdown; FK requerida al activo. El contenido vive en las
versiones.
- Campos clave: `assetId`, `title`, `categoryCode?`, `status` (default `BORRADOR`),
  `currentVersionId?` (apunta a la última versión).
- Índices: por `assetId`, `status`, `categoryCode`.

### DocumentVersion (`document_versions`)
Versión inmutable de contenido (append-only; editar crea una nueva versión).
- Campos clave: `documentId`, `versionNumber`, `content` (`@db.Text`), `authorUserId`.
- Restricciones: único `(documentId, versionNumber)`; índices por `documentId`,
  `authorUserId`.

## Gobierno de la demanda

### GateCheck (`gate_checks`)
Punto de control del ciclo de gobierno (una fila por `(requestId, gateCode)` para los 5
gates).
- Campos clave: `requestId`, `gateCode`, `status` (default `PENDIENTE`), `conditionText`,
  `authorityText`, `waiverReason?`, `decidedAt?`, `decidedByUserId?`.
- Restricciones: único `(requestId, gateCode)`; índices por `requestId`, `status`.

### GatePendingItem (`gate_pending_items`)
Faltante registrado de un gate no cumplido (qué falta, quién lo resuelve, fecha de
revisión).
- Campos clave: `gateCheckId`, `description`, `ownerUserId?`, `reviewDate?`, `resolved`,
  `resolvedAt?`.
- Índices: por `gateCheckId`, `resolved`.

### ValidationRecord (`validation_records`)
Registro de una prueba/validación con su evidencia.
- Campos clave: `requestId`, `gateCheckId?`, `validationTypeCode`, `testCase`,
  `version?`, `environment?`, `resultCode`, `blocking`, resolución del bloqueo
  (`blockingResolved`, `blockingResolvedAt?`, `blockingResolvedByUserId?`), evidencia
  (`evidenceRef?`, `evidenceDocumentId?`, `evidenceDocumentVersionId?`),
  `executedByUserId`, `executedAt`, `notes?`.
- Índices: por `requestId`, `gateCheckId`, `validationTypeCode`, `resultCode`,
  `blocking`, `blockingResolved`.

## Actividades recurrentes

### RecurringActivity (`recurring_activities`)

Definición de una actividad que se repite con una cadencia (qué se repite y cada cuánto).
- Campos clave: `title`, `description?`, `activityType` (código de la maestra
  `RECURRING_ACTIVITY_TYPE`), `cadence` (valor lógico `Recurrence`), `intervalCount`
  (cada cuántos períodos; por defecto 1), `startDate` (`@db.Date`, ancla de la cadencia),
  `endDate?` (`@db.Date`), `anticipationDays?` (si es nulo, usa el default del entorno),
  responsable (`responsibleKind` USER/AREA con `responsibleUserId?`/`responsibleAreaId?`),
  `active`.
- Relaciones: `responsibleUser`/`responsibleArea` (`onDelete: Restrict`), `occurrences`.
- Regla de integridad: un `CHECK` garantiza **exactamente un responsable** (USER con
  `responsibleUserId` y sin área, o AREA con `responsibleAreaId` y sin usuario).
- Índices: por `active`, `responsibleUserId`, `responsibleAreaId`, `activityType`,
  `cadence`.

### RecurringActivityOccurrence (`recurring_activity_occurrences`)

Instancia concreta de una definición para un día objetivo; es lo que una persona realiza
y marca como completada.
- Campos clave: `activityId`, `targetDate` (`@db.Date`), `status` (valor lógico
  `OccurrenceStatus`, inicial `PENDIENTE`), `completedAt?`, `completedByUserId?`,
  `completionComment?`, `periodLabel?` (etiqueta legible del período, p. ej. `2024-W03`).
- Relaciones: `activity` (`onDelete: Cascade`), `completedBy` (`onDelete: Restrict`).
- Unicidad: `(activityId, targetDate)` único — el motor genera con `skipDuplicates`, así
  que es idempotente y no duplica la ocurrencia de un mismo día.
- Índices: por `status`, `targetDate`, `(status, targetDate)`, `completedByUserId`,
  `activityId`.

## Enums y estados (valores lógicos, no enums de Prisma)

- **Roles** (`Role.code`, enum TypeScript `RoleCode`): `JEFE_AREA`, `LIDER_PROCESO`,
  `INTEGRANTE`.
- **Estado operativo de Request** (`operationalState`): arranca en `REGISTRADA`; avanza
  por el flujo (triage → priorización → *Comprometida* → *En planificación* → *En
  ejecución* → gates de gobierno). Lo escribe solo el helper de transición.
- **Estado de Plan** (`status`): `BORRADOR` inicial; luego envío/autorización/devolución.
- **Estado de Task** (`status`): `POR_HACER` inicial; `accepted` es un flag separado.
- **Estado de Asset** (`status`) y **de Document** (`status`): `BORRADOR` inicial.
- **Estado de gate** (`GateCheck.status`): `PENDIENTE` inicial; incluye `NO_APLICA`
  (waiver). Estados de preparación de etapa referenciados por GC4/GC5: `EN_EJECUCION`,
  `EN_VALIDACION`, `LISTA_PARA_LIBERAR`, `EN_ESTABILIZACION`, `OPERATIVA`.
- **Estados de coordinación**: diarios/semanales `BORRADOR → ENVIADO` (con `REVISADO`);
  novedades y compromisos usan `EN_CURSO` como estado inicial de una máquina mínima
  reversible.
- **Cadencia de actividad recurrente** (`RecurringActivity.cadence`, enum `Recurrence`):
  `SEMANAL`, `MENSUAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`.
- **Tipo de responsable** (`RecurringActivity.responsibleKind`, enum `ResponsibleKind`):
  `USER`, `AREA`.
- **Estado de ocurrencia recurrente** (`RecurringActivityOccurrence.status`, enum
  `OccurrenceStatus`): `PENDIENTE` inicial; `EN_CURSO`, `COMPLETADA` (terminal) y
  `VENCIDA` (puede cerrarse tarde a `COMPLETADA`).

Varios atributos se almacenan como **código de maestra** (`CatalogItem`) y se validan en
el service, por ejemplo: `ACTIVITY_CLASS`, `ISSUE_TYPE`, `RECORD_STATE`,
`GOVERNANCE_ROUTE`, `RECURRING_ACTIVITY_TYPE` y los tipos/tecnologías/fuentes/frecuencias
de los activos.

## Migraciones (`apps/api/prisma/migrations/`, en orden)

1. `20261007161124_create_catalog_items`
2. `20261008040710_fase1_fundaciones`
3. `20261008055643_fase2_demanda`
4. `20261008145320_fase3_plan`
5. `20261008173254_fase4_capacidad`
6. `20261009030758_fase5_trabajo`
7. `20261009045752_fase6_activos`
8. `20261009141516_fase7_gobierno`
9. `20261009200659_add_user_password_hash`
10. `20261013055736_triage_main_responsible_fk`
11. `20261013170314_create_auth_tokens`
12. `20261015162802_add_admin_and_smtp_config`
13. `20261016050441_add_area_and_process_area_nullable`
14. `20261016050442_backfill_analitica_area` (SQL idempotente escrito a mano: crea el
    área `ANALITICA` y asigna a ella los procesos sin área)
15. `20261016050516_make_process_area_required` (`area_id` pasa a `NOT NULL`)
16. `20261021040316_activo_base_solicitudes`
17. `20261023023235_add_audit_event_query_indexes`
18. `20261028021002_recurring_activities` (actividades recurrentes: tablas
    `recurring_activities` y `recurring_activity_occurrences`, con un `CHECK` escrito a
    mano que garantiza exactamente un responsable —persona o área—)
