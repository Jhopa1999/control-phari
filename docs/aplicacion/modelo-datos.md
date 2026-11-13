# Modelo de datos

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

Fuente: `apps/api/prisma/schema.prisma` (Prisma ORM v7, PostgreSQL). El nombre entre
paréntesis en cada entidad es el de la tabla (`@@map`). Prisma se usa **solo** en el
backend.

Nota sobre "enums lógicos": varios estados (`operationalState`, `Plan.status`,
`Task.status`, `Asset.status`, `Document.status`, `GateCheck.status`, estados de
diarios/compromisos) se guardan como `String`, no como enum de Prisma. Son
máquinas de estado que escriben solo los *helpers* de estado del backend, nunca un DTO
libre.

## Fundaciones (identidad, procesos, permisos, auditoría)

### CatalogItem (`catalog_items`) — funcionalidad base
Maestra genérica reutilizable (no es una maestra de negocio concreta).
- Campos clave: `catalog`, `code`, `label`, `description` (texto opcional que explica qué significa la opción y cuándo elegirla; se muestra bajo la opción en los desplegables del triage), `active`, `sortOrder`.
- Restricciones: único `(catalog, code)`; índices por `catalog`, `active`, `sortOrder`.

### Area (`areas`)
Área organizativa (p. ej. Analítica) que agrupa procesos.
- Campos clave: `code` (único, estable), `name`, `active`, `sortOrder`.
- Restricciones: único `code`; índices por `active`, `sortOrder`.
- Relaciones: `processes` (1:N con `Process`).

### Requester (`requesters`)
- Maestro de solicitantes: `name`, `nameKey` (clave única normalizada, sin tildes ni
  mayúsculas), `areaId` (FK requerida a `Area`, `onDelete: Restrict`), `active`.
- `Request.requesterId` (FK nullable) lo referencia; `requesterName`/`requesterArea` se
  conservan como copia del maestro y como dato histórico.

### Process (`processes`)
Proceso del área (BI, Integraciones, IA) y la coordinación multiproceso FMAA.
- Campos clave: `code` (MAYÚSCULAS, estable), `name`, `framework?`, `kind`, `areaId`
  (FK requerida al `Area`), `active`, `sortOrder`.
- Restricciones: único `code`; índices por `active`, `sortOrder`.
- Relaciones: `area` → `Area` (`onDelete: Restrict`); raíz de alcance de casi todo
  (grants, requests, tasks, assignments, diarios, semanales, reuniones,
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

### AiGlobalConfig (`ai_global_config`)
Configuración global de IA editable en runtime (fila única / singleton). El ADMIN enciende
o apaga la IA y elige el modo de credenciales sin tocar código. Arranca apagada.
- Campos clave: `enabled` (default `false`), `credentialMode` (`credential_mode`, default
  `iam-role`; otro valor: `access-keys`), `awsAccessKeyId?` (`aws_access_key_id`),
  `awsSecretAccessKeyCipher?` (`aws_secret_access_key_ciphertext`), `updatedByUserId?`
  (`updated_by_user_id`).
- En modo `access-keys` el secret se guarda **cifrado** (AES-256-GCM, formato
  `iv.tag.ciphertext` base64) con la clave `SETTINGS_ENCRYPTION_KEY`; nunca en claro ni
  devuelto al frontend. En modo `iam-role` no se guardan claves (el SDK resuelve el rol de
  la instancia).
- Relaciones: `updatedBy` → `User` (`onDelete: SetNull`, relación `AiGlobalConfigUpdatedBy`).

### AiAgentConfig (`ai_agent_config`)
Configuración por agente de IA (uno por `code`, p. ej. `TRIAGE`). Todo editable desde el
Admin. Arranca apagado. No guarda secretos (las credenciales viven en `AiGlobalConfig`). La API crea las filas `TRIAGE` (sugerencia de triage) y `ASISTENTE` (asistente conversacional del portal, con más tokens y tiempo) al arrancar si faltan (`ensureDefaultAgents`, valores en `ai-defaults.ts`, el mismo origen que usa el seed); ambas nacen apagadas; el Admin solo edita agentes existentes.
- Campos clave: `code` (único), `displayName` (`display_name`), `enabled` (default
  `false`), `region` (default `us-east-2`), `model`, `basePrompt` (`base_prompt`, texto),
  `temperature` (default `0.2`), `maxTokens` (`max_tokens`, default `1024`), `timeoutMs`
  (`timeout_ms`, default `20000`), `updatedByUserId?` (`updated_by_user_id`).
- Restricciones/índices: `code` único e indexado.
- Relaciones: `updatedBy` → `User` (`onDelete: SetNull`, relación `AiAgentConfigUpdatedBy`).

### AiModel (`ai_model`)
Catálogo de modelos de IA (Bedrock) gestionable desde el Admin, con las capacidades de cada
modelo. Sustituye a la lista cerrada en código. La API siembra los modelos por defecto al
arrancar (`ensureDefaults`, valores en `bedrock-model-catalog.ts`) sin pisar cambios del admin.
- Campos clave: `modelId` (`model_id`, único; id invocable/perfil de inferencia), `label`,
  `tier` (`default`/`premium`/`other`), `enabled` (default `true`), `supportsTemperature`,
  `supportsTools`, `supportsVision`, `supportsDocuments`, `supportsPromptCache` (default `false`; la migración `20261104120000_ai_model_prompt_cache` la activa en los Claude 4.5 sembrados), `sortOrder`.
- Reglas: un agente solo puede usar un modelo existente y habilitado; si el modelo no soporta
  `temperature` (p. ej. Claude 5.x) la invocación la omite; si el modelo no soporta `supportsPromptCache`, el asistente no envía puntos de caché de prompt.
- Restricciones/índices: `model_id` único; índice por (`enabled`, `sort_order`).
- Precios: `inputUsdPerMTok` / `outputUsdPerMTok` (`input_usd_per_mtok`, `output_usd_per_mtok`,
  USD por millón de tokens, nullables) para estimar el costo del consumo.

### AiUsage (`ai_usage`)
Una fila por llamada al modelo de IA: base del presupuesto mensual y de los reportes de costo.
Solo métricas, nunca el contenido de prompts ni respuestas.
- Campos clave: `createdAt`, `userId?` (FK a `User`, `onDelete: SetNull`), `agentCode`
  (p. ej. `TRIAGE`), `modelId`, `inputTokens`, `outputTokens`, `cacheReadInputTokens`,
  `cacheWriteInputTokens`, `costUsd?` (null si el modelo no tiene precio), `durationMs`.
- Índices: `createdAt`; (`userId`, `createdAt`); (`agentCode`, `createdAt`).

Presupuesto: `AiGlobalConfig` suma `monthlyBudgetUsd?` (`monthly_budget_usd`, default `100`,
`null` = sin tope) y `budgetAlertPct` (`budget_alert_pct`, default `80`).

### AiProposal (`ai_proposal`)
Propuesta de acción del asistente: el asistente nunca ejecuta una escritura, la registra aquí y la
persona la confirma o descarta. Privada de su usuario.
- Campos clave: `conversationId` (FK a `AiConversation`, `onDelete: Cascade`), `messageId?` (turno del
  asistente al que pertenece), `userId` (FK a `User`, `onDelete: Cascade`), `toolName`, `summary`
  (frase para la persona), `args` (JSON con los argumentos exactos de la tool, sin el resumen),
  `status` (`PENDIENTE` por defecto, `EJECUTANDO`, `CONFIRMADA`, `FALLIDA`, `DESCARTADA`; `EXPIRADA`
  se calcula al leer a las 24 h), `resultText?`, `errorText?`, `createdAt`, `resolvedAt?`.
- Índices: `conversationId`; (`userId`, `status`).

### AiConversation (`ai_conversation`) y AiMessage (`ai_message`)
Conversaciones del asistente de IA. **Privadas de su usuario**: solo el dueño las lee o borra.
- `AiConversation`: `userId` (FK a `User`, `onDelete: Cascade`), `title` (inicio del primer
  mensaje, máx. 60), `createdAt`, `updatedAt`. Índice (`userId`, `updatedAt`).
- `AiMessage`: `conversationId` (FK, `onDelete: Cascade`), `role` (`user`/`assistant`), `text`,
  `tools?` (JSON con el resumen `{name, label, status}` de las herramientas consultadas y, solo para
  uso interno, `memory` —renglones con los ids de lo que devolvió— y `args`; la API no los expone—, en el
  turno; no guarda los resultados), `createdAt`. Índice (`conversationId`, `createdAt`).

### AiAttachment (`ai_attachment`)
Adjuntos del chat del asistente (imágenes y documentos). **Privados de quien los sube.** El original
vive en S3 (`storageKey`, prefijo `asistente/{userId}/`) y aquí queda el **texto extraído**, que la
persona revisa y puede corregir antes de enviarlo y que es lo único que recibe el modelo.
- Campos: `userId` (FK, `onDelete: Cascade`), `conversationId?` y `messageId?` (FK, `onDelete: Cascade`;
  `null` = subido y aún sin enviar), `fileName`, `contentType`, `sizeBytes`, `kind`
  (`imagen`/`documento`), `storageKey`, `extractedText`, `truncated` (el texto se recortó al máximo),
  `createdAt`. Índices (`userId`, `messageId`), (`messageId`), (`conversationId`).
- Un adjunto sin enviar de más de 24 h se borra (fila y archivo) la siguiente vez que su dueño sube otro;
  al eliminar una conversación se borran también los archivos de sus adjuntos en S3.


## Flujo de demanda

### Request (`requests`)
Ficha de la demanda; núcleo del flujo.
- ID visible (solo lectura): `number` (entero, único, de la secuencia de Postgres
  `requests_number_seq`; `@default(autoincrement())`) y `code` (texto único,
  `PRY-` + `number` con 4 dígitos mínimo: `PRY-0012`). Los asigna
  `RequestService.create`; ningún DTO de entrada los acepta. Las solicitudes
  eliminadas lógicamente conservan su número y nunca se reutiliza. Ver
  «Regla de numeración de IDs visibles».
- Eliminación lógica: `deletedAt?` y `deletedByUserId?` (las consultas filtran
  `deletedAt = null`). `requesterId?` referencia al maestro de solicitantes.
- `createdByUserId?`: usuario que registró la solicitud (UUID sin relación, como
  `deletedByUserId`/`closedByUserId`). Permite que el creador siempre vea su
  solicitud en el alcance de lectura aunque aún no tenga proceso principal.
- Campos clave: `title`, `registeredAt`, datos del solicitante (`requesterArea?`,
  `requesterName?`, `functionalOwner?`), `targetDate?`, `referenceUrl?`,
  `expectedResult?`, `mainProcessId?` (proceso principal; **nullable**: la
  solicitud se registra sin proceso y lo adquiere en el triage al `CONTINUAR`),
  `assetId?` (activo base sobre el que se
  trabaja la solicitud, P1; nullable hasta que la mesa lo asocie),
  `operationalState` (default `REGISTRADA`),
  `initialCommitmentDate?`, `changeJustification?`.
- Campos de gobierno (fase 7): `governanceRoute?`, flag de bloqueo transversal
  (`blockedReason?`, `blockedAt?`, `blockedByUserId?`, `blockedResolvedAt?`,
  `blockedResolvedByUserId?`).
- Restricciones/índices: por `mainProcessId`, `operationalState`, `registeredAt`,
  `governanceRoute`, `blockedAt`, `assetId`.
- Relaciones: `mainProcess?` (opcional, N:1 con `onDelete: Restrict`), `asset?` (activo base, N:1 con `onDelete: Restrict`,
  relación `RequestAsset`), participantes, triages, evaluaciones de prioridad,
  aprobaciones, `plan?` (1:1 efectivo), asignaciones, actividades/reuniones/
  compromisos relacionados, activos de origen (`assets`, relación
  `AssetOriginRequest`), gates y validaciones de gobierno.

### RequestParticipant (`request_participants`)
Puente N:M `Request ↔ Process` (procesos participantes); el proceso principal siempre
se materializa aquí (BR-001). Se puebla en el **triage**, cuando se fija el
proceso principal: una solicitud recién registrada no tiene participantes.
- Restricciones: único `(requestId, processId)`; índice por `processId`.

### Triage (`triages`)
Clasificación y decisión del triage.
- `routeCode?` está **DEPRECADO** (dato histórico): la «Ruta» (maestra `TRIAGE_ROUTE`) era redundante con el proceso principal y ya no se captura; la columna y la maestra se conservan para triages antiguos y se muestran como «Ruta (histórica)». «Multiproceso» es una etiqueta derivada de tener más de un `RequestParticipant`.
- Campos clave: `routeCode?` (deprecado), `demandTypeCode?`, `criticalityCode?`, `sizeCode?`,
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
- Línea base de entrega: `baselineDate?` (`baseline_date`) la fija `PlanService.authorize` al
  autorizar el plan, con `commitmentDate ?? periodEnd ?? última fecha fin de las tareas`, y no
  se mueve si luego se edita `commitmentDate`. Es la referencia del vencimiento en el
  portafolio. La migración `20261114120000_plan_baseline_date` rellena los planes ya
  autorizados con la misma regla.
- Restricciones: único `requestId`; índice por `status`.
- Contadores de ID visible: `phaseSeqNext` y `taskSeqNext` (columnas `phase_seq_next` y
  `task_seq_next`, enteros, default 1) = **siguiente** número de fase y de tarea del plan.
  Solo crecen: se incrementan con una sola sentencia `UPDATE … RETURNING` (`increment`
  de Prisma) dentro de la transacción de creación, que bloquea la fila del plan.

### PlanPhase (`plan_phases`)
Fase del plan (ordenada por `order` 0-based; la inicial es la de `order` mínimo).
- Campos clave: `planId`, `name`, `startDate?`, `endDate?`, `deliverable?`, `order`,
  `code` (ID visible `PRY-0012-F2`, texto único, solo lectura, inmutable; no cambia al
  reordenar).
- Restricciones: único `(planId, order)`; único `code`; índice por `planId`.

### Task (`tasks`)
Tarea del plan.
- Campos clave: `phaseId`, `processId?`, `title`, `responsibleUserId?`, `startDate?`,
  `endDate?`, `estimateHours?`, `isMilestone`, `description?`, `acceptanceCriteria?`,
  `status` (default `POR_HACER`), `progress`, `frameworkPhaseRequired?`, `blockedReason?` (columna `blocked_reason`, motivo vigente del bloqueo; solo tiene valor con `status = BLOQUEADA`), `reviewRequestedAt?` (columna `review_requested_at`, BL-036 E3: momento en que la tarea pasó a `EN_REVISION`; se fija al entrar, se limpia al salir y queda `null` en las tareas que ya estaban en revisión al desplegar, para las que la API usa `updatedAt` como respaldo aproximado; migración aditiva `20261112120000_task_review_requested_at`), `accepted`,
  `acceptedAt?`, `acceptedByUserId?`, `evidenceUrl?`.
- ID visible: `code` (`PRY-0012-T07`, texto único, solo lectura, inmutable). La tarea no
  cambia de fase (`UpdateTaskDto` no tiene `phaseId`), así que el código es estable.
- Restricciones/índices: único `code`; por `phaseId`, `responsibleUserId`, `status`.

#### Regla de numeración de IDs visibles
- Formato: solicitud `PRY-0012` (prefijo `PRY`, 4 dígitos mínimo, crece a 5+ sin truncar),
  fase `PRY-0012-F2` (sin relleno) y tarea `PRY-0012-T07` (2 dígitos mínimo, crece a 3+).
  El prefijo vive en una sola constante de la API (`VISIBLE_CODE_PREFIX` en
  `apps/api/src/modules/plan/visible-code.ts`, que también concentra el formato).
- Inmutables, de solo lectura y **nunca reutilizados**: los contadores solo crecen, borrar
  una fase o tarea no libera su número y los huecos son aceptables (transacción revertida,
  solicitud eliminada). Fase y tarea llevan el código de la solicitud de su plan.
- Se asignan en todos los puntos de creación: solicitud (`RequestService.create`), fase
  manual (`PhaseService.create`), tarea manual (`TaskService.create`) y fases/tareas
  importadas (`PlanService.importPlan`). La importación **reemplaza** el contenido del plan
  y reserva de una vez N números de fase y N de tarea: las filas nuevas reciben números
  **nuevos que continúan el contador**; el `code` que traiga el archivo se ignora.
- Búsqueda: `GET /plans/{planId}/tasks?q=` coincide con el título o con el código (completo,
  parcial o forma corta `T07`/`F2`, sin distinguir mayúsculas).

### TaskEvidence (`task_evidences`)
Archivo de evidencia de una tarea; el binario vive en el bucket S3 maestro y aquí solo el metadato.
- Campos clave: `taskId`, `fileName`, `contentType`, `sizeBytes`, `storageKey` (único), `uploadedByUserId`, `createdAt`.
- Relaciones: pertenece a `Task` (borrado en cascada) y a `User` (quien la subió).

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
  (default `BORRADOR`), `submittedAt?`, `dayNotes?`, y los datos de revisión:
  `reviewedAt?`/`reviewedByUserId?` y `returnedAt?`/`returnedByUserId?`/`returnReason?`
  (la última devolución se conserva hasta el siguiente envío).
- Restricciones: único `(authorUserId, processId, date)`; índices por `processId`,
  `date`, `status`.

### DailyLogActivity (`daily_log_activities`)
Actividad de un registro diario (con clasificación de maestra `ACTIVITY_CLASS`).
- Campos clave: `dailyLogId`, `classificationCode`, referencias opcionales
  (`projectRequestId?`, `taskId?`, `assetRef?`, `requesterRef?`,
  `assetId?`). La columna `related_issue_id` (`relatedIssueId`) se **conserva en la BD pero ya no se expone ni se escribe**: la API la rechaza y la pantalla ya no la ofrece, `hours`, `evidenceUrl?`, `nextStep?`, `nextStepDate?` (estos dos últimos ya no se capturan ni se muestran en la UI; se conservan en BD).
- Índices: por `dailyLogId`, `classificationCode`, `taskId`, `projectRequestId`,
  `relatedIssueId`, `assetId`.

### WeeklyReport (`weekly_reports`)
Registro semanal anclado al lunes; consolida por lectura los diarios del proceso.
- Campos clave: `authorUserId`, `processId`, `weekStart` (`@db.Date`), `status`
  (default `BORRADOR`), `submittedAt?`, y secciones de texto (`results?`, `proposals?`,
  `blockers?`, `commitmentsText?`, `decisions?`) y los mismos campos de revisión y
  devolución que `DailyLog`.
- Restricciones: único `(authorUserId, processId, weekStart)`; índices por `processId`,
  `weekStart`.

### Issue (`issues`)
Novedad (un registro por incidente que se edita hasta resolver). **Módulo retirado**:
ya no hay pantalla, API ni tools de MCP (menú, `/issues`, tools `issue.*` y asistente se
quitaron en el cambio «retirar Novedades»), pero **la tabla, sus filas, la columna
`daily_log_activities.related_issue_id`, el catálogo `ISSUE_TYPE` y el tipo de auditoría
`ISSUE` se conservan sin cambios** para no perder datos ni historial. El Panel de demanda
dejó de contarlas. El borrado físico queda en `docs/BACKLOG.md` (BL-050).
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
Activo genérico, compartido y gobernado. `processId` es el proceso propietario/origen
(FK requerida), siempre visible; la visibilidad adicional vive en la tabla puente
`AssetProcessVisibility`. Los atributos por-solicitud (tipo, tecnología, fuente,
frecuencia) se retiraron del modelo: pertenecen a cada solicitud, no al activo. Sin
borrado físico: retiro = cambio de estado. La escritura (crear/editar/cambiar estado)
está reservada al jefe de área.
- Campos clave: `processId` (propietario), `requestId?`, `ownerUserId?`, `name`,
  `status` (default `BORRADOR`), `documentationRef?`, `generalDescription?` (descripción
  general del activo), `dependencies?`.
- Índices: por `processId`, `requestId`, `status`.
- Relaciones: `process` (propietario), `request?` (solicitud de origen, relación
  `AssetOriginRequest`), `owner?`, `requestsAssociated` (solicitudes que usan este
  activo como base, inversa de `Request.asset`, relación `RequestAsset`), `visibilities`
  (procesos que pueden ver/usar el activo), documentos, actividades de bitácora y
  novedades (módulo retirado; ver `Issue`).

### AssetProcessVisibility (`asset_process_visibilities`)
Tabla puente N:M Activo↔Proceso: procesos que pueden ver y usar (asociar) un activo
genérico, además del proceso propietario (`Asset.processId`), que siempre se considera
visible. Solo el jefe de área define este conjunto al crear/editar el activo.
- Campos clave: `assetId`, `processId`.
- Índices: único `(assetId, processId)`; índice por `processId`.
- Relaciones: `asset` (`onDelete: Cascade`), `process` (`onDelete: Restrict`).

### Document (`documents`)
Metadatos de un documento Markdown; FK requerida al activo. El contenido vive en las
versiones.
- Campos clave: `assetId`, `title`, `categoryCode?`, `status` (default `BORRADOR`),
  `currentVersionId?` (apunta a la última versión).
- Aprobación documental: `submittedAt?`/`submittedByUserId?` (envío a aprobación),
  `reviewedAt?`/`reviewedByUserId?`/`reviewReason?` (última aprobación o rechazo).
- `requestId?`: proyecto (solicitud) al que pertenece el documento; la documentación de
  cierre usa la categoría `CIERRE`.
- Índices: por `assetId`, `status`, `categoryCode`.

### Notification (`notifications`)
Notificación por usuario del centro de notificaciones.
- Campos clave: `userId` (FK a `User`, `onDelete: Cascade`), `type` (p. ej.
  `TASK_ASSIGNED`, `CLOSURE_REQUESTED`), `title`, `message`, `link?` (ruta interna),
  `requestId?`, `readAt?`, `createdAt`.
- Índices: `(userId, readAt)` y `(userId, createdAt)`.

### ProjectClosure (`project_closures`)
Solicitud de cierre formal de un proyecto (una fila por intento; se conserva como
evidencia).
- Campos clave: `requestId` (FK a `Request`), `status` (`PENDIENTE`/`APROBADO`/`RECHAZADO`),
  `requestedByUserId`, `requestedAt`, `decidedByUserId?`, `decidedAt?`, `decisionReason?`.
- `Request.closedAt?`/`closedByUserId?` registran quién y cuándo cerró el proyecto.

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
  `active`, `estimatedHours` (`Decimal(6,2)`, esfuerzo por ocurrencia, obligatorio al
  crear), `prepDays` (días antes del día objetivo en que la ocurrencia se habilita; si el
  alta no lo informa, 2 para SEMANAL y 5 para el resto) y `requiresEvidence` (por defecto
  `false`; si es `true` completar exige al menos un adjunto). `anticipationDays` queda
  como horizonte técnico de generación y no se edita desde el portal.
- Relaciones: `responsibleUser`/`responsibleArea` (`onDelete: Restrict`), `occurrences`.
- CHECK: `estimated_hours > 0` y `prep_days >= 0`.
- Regla de integridad: un `CHECK` garantiza **exactamente un responsable** (USER con
  `responsibleUserId` y sin área, o AREA con `responsibleAreaId` y sin usuario).
- Índices: por `active`, `responsibleUserId`, `responsibleAreaId`, `activityType`,
  `cadence`.

### RecurringActivityOccurrence (`recurring_activity_occurrences`)

Instancia concreta de una definición para un día objetivo; es lo que una persona realiza
y marca como completada.
- Campos clave: `activityId`, `targetDate` (`@db.Date`), `status` (valor lógico
  `OccurrenceStatus`, inicial `PENDIENTE`), `completedAt?`, `completedByUserId?`,
  `completionComment?`, `periodLabel?` (etiqueta legible del período, p. ej. `2024-W03`),
  `reminderSentAt?` (marca de envío del recordatorio por correo; si está puesta, el cron
  de recordatorio no reenvía), `estimatedHours` (snapshot de las horas de la definición
  al generarse; se actualiza mientras siga PENDIENTE), `actualHours?` (horas reales al
  completar), `startedAt?`/`startedByUserId?` (quién y cuándo la tomó),
  `cancelledAt?`/`cancelReason?` (si se canceló por un cambio de fechas o una pausa) y
  `windowNotifiedAt?`/`dueNotifiedAt?`/`overdueNotifiedAt?` (marcas de idempotencia de
  los avisos internos).
- Relaciones: `activity` (`onDelete: Cascade`), `completedBy` y `startedBy`
  (`onDelete: Restrict`).
- CHECK: `estimated_hours > 0` y `actual_hours` nulo o `> 0`.
- Unicidad: `(activityId, targetDate)` único — el motor genera con `skipDuplicates`, así
  que es idempotente y no duplica la ocurrencia de un mismo día.
- Índices: por `status`, `targetDate`, `(status, targetDate)`, `completedByUserId`,
  `startedByUserId`, `activityId`.

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
  los compromisos usan `EN_CURSO` como estado inicial de una máquina mínima
  reversible (las novedades, ya retiradas, la usaban igual).
- **Cadencia de actividad recurrente** (`RecurringActivity.cadence`, enum `Recurrence`):
  `SEMANAL`, `MENSUAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`.
- **Tipo de responsable** (`RecurringActivity.responsibleKind`, enum `ResponsibleKind`):
  `USER`, `AREA`.
- **Estado de ocurrencia recurrente** (`RecurringActivityOccurrence.status`, enum
  `OccurrenceStatus`): `PENDIENTE` inicial; `EN_CURSO`, `COMPLETADA` (terminal),
  `VENCIDA` (puede cerrarse tarde a `COMPLETADA`) y `CANCELADA` (solo desde
  `PENDIENTE`; vuelve a `PENDIENTE` si la fecha coincide otra vez con la recurrencia). El
  estado que ve el usuario (`displayStatus`: PROGRAMADA, PENDIENTE, EN_CURSO, VENCE_HOY,
  VENCIDA, COMPLETADA, COMPLETADA_TARDE, CANCELADA) es derivado y no se persiste.

Varios atributos se almacenan como **código de maestra** (`CatalogItem`) y se validan en
el service, por ejemplo: `ACTIVITY_CLASS`, `ISSUE_TYPE`, `RECORD_STATE`,
`GOVERNANCE_ROUTE`, `RECURRING_ACTIVITY_TYPE` y los tipos/tecnologías/fuentes/frecuencias
de los activos.
(Las familias de activos antes consumidas por el triage ya no tienen consumidores
tras el activo generico; permanecen sembradas por compatibilidad.)

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
16. `20261021040316_activo_base_solicitudes` (añade `requests.asset_id` + FK a `assets`)
17. `20261023023235_add_audit_event_query_indexes` (índices de lectura paginada de auditoría)
18. `20261027231656_activo_generico_gobernanza` (migración destructiva: elimina de
    `assets` las columnas `type_code`, `technology_code`, `source_code`,
    `frequency_code` y su índice; renombra `functional_description` a
    `general_description` conservando los datos; crea la tabla puente
    `asset_process_visibilities`)
19. `20261028010201_ai_config` (crea `ai_global_config` y `ai_agent_config`, aditiva)
20. `20261028021002_recurring_activities` (actividades recurrentes: tablas
    `recurring_activities` y `recurring_activity_occurrences`, con un `CHECK` escrito a
    mano que garantiza exactamente un responsable —persona o área—)
21. `20261028115118_occurrence_reminder_sent_at` (añade la columna aditiva
    `reminder_sent_at` a `recurring_activity_occurrences` para los recordatorios por correo)
22. `20261028225723_solicitantes_eliminacion_logica` (aditiva: tabla `requesters`;
    columnas `requests.requester_id`, `deleted_at`, `deleted_by_user_id`)
23. `20261028233818_notificaciones_cierre_aprobacion_documental` (aditiva: tablas
    `notifications` y `project_closures`; columnas `requests.closed_at`/`closed_by_user_id`
    y de revisión en `documents`; siembra idempotente de `DOC_CATEGORY=CIERRE` y
    `DOC_STATUS=PENDIENTE_APROBACION/RECHAZADO`)
24. `20261028234216_documento_proyecto` (aditiva: `documents.request_id` + FK a `requests`)
25. `20261101120000_ai_model_catalogo` (aditiva: tabla `ai_model`, catálogo de modelos de IA con capacidades)
26. `20261101180000_ai_consumo_presupuesto` (aditiva: tabla `ai_usage`; columnas de presupuesto en
    `ai_global_config` y de precio en `ai_model`; precios de los modelos por defecto)
27. `20261102120000_ai_conversaciones` (aditiva: tablas `ai_conversation` y `ai_message`)
28. `20261103120000_ai_propuestas` (aditiva: tabla `ai_proposal`)
    (las migraciones intermedias hasta `20261112120000_task_review_requested_at` no se detallan aquí)
41. `20261113120000_visible_ids` (IDs visibles: añade `requests.number`/`code`, la secuencia
    `requests_number_seq`, `plans.phase_seq_next`/`task_seq_next`, `plan_phases.code` y
    `tasks.code`; rellena las filas existentes de forma determinista —solicitudes por
    `registered_at, created_at, id` incluidas las eliminadas; fases por plan en orden
    `"order", id`; tareas por plan en orden `fase.order, created_at, id`—, ajusta la secuencia
    y los contadores a máximo + 1 y recién entonces pone `NOT NULL` + `UNIQUE`. Reejecutarla
    no renumera nada. Ensayada sobre copias de la BD de desarrollo y sobre un conjunto
    sintético con empates de `created_at`; consulta de verificación en
    `scripts/verificar-ids-visibles.sql`.
    **Rollback** (solo antes de que haya código en uso externo, p. ej. citado en correos):
    `DROP INDEX requests_number_key, requests_code_key, plan_phases_code_key, tasks_code_key;`
    `ALTER TABLE requests DROP COLUMN number, DROP COLUMN code;` `DROP SEQUENCE IF EXISTS
    requests_number_seq;` `ALTER TABLE plans DROP COLUMN phase_seq_next, DROP COLUMN task_seq_next;`
    `ALTER TABLE plan_phases DROP COLUMN code;` `ALTER TABLE tasks DROP COLUMN code;` y quitar la
    fila de `_prisma_migrations`; el código anterior sigue funcionando sin las columnas. Antes
    de desplegar, respaldar con `pg_dump`.)
    (las migraciones intermedias hasta `20261114130000_recurring_activity_types` no se detallan aquí)
44. `20261115120000_recurring_activity_redesign` (aditiva y segura sobre datos existentes:
    añade a `recurring_activities` `estimated_hours` (backfill 1 h), `prep_days`
    (backfill 2 si `cadence='SEMANAL'`, 5 en el resto) y `requires_evidence` (`false`);
    añade a `recurring_activity_occurrences` `estimated_hours` (heredada de su
    definición con `UPDATE … FROM`), `actual_hours`, `started_at`,
    `started_by_user_id` (FK a `users`), `cancelled_at`, `cancel_reason` y las tres
    marcas de aviso. Luego quita los `DEFAULT` temporales y agrega los `CHECK`. No borra
    filas ni cambia el estado de ninguna ocurrencia.)
