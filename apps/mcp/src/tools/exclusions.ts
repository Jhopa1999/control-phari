/**
 * EXCLUSIONES del catálogo del MCP: operaciones del contrato OpenAPI que NO se
 * exponen como tool, cada una con su motivo. El test de cobertura
 * (__tests__/coverage.test.ts) exige que toda operación del contrato tenga una
 * tool O una entrada aquí, y que no haya entradas obsoletas.
 *
 * Dos tipos:
 * - `permanente`: decisión de diseño estable (auth, administración, binarios...).
 * - `pendiente`: la operación debería exponerse y aún no se ha hecho. Su motivo
 *   empieza por «PENDIENTE». Están acotadas por MAX_PENDIENTES (ratchet): el
 *   tope solo puede BAJAR. Al exponer una operación hay que quitar su entrada y
 *   bajar el tope; subirlo requiere justificación explícita en el PR.
 */

/** Tipo de exclusión. */
export type ExclusionKind = 'permanente' | 'pendiente';

/** Una operación del contrato que el MCP no expone, con su motivo. */
export interface Exclusion {
  /** Operación del contrato: `'METHOD /path'`. */
  readonly operation: string;
  readonly kind: ExclusionKind;
  /** Motivo en español; las pendientes empiezan por «PENDIENTE». */
  readonly reason: string;
}

/**
 * Tope (ratchet) de exclusiones PENDIENTES. Las lecturas ya están expuestas
 * (BL-032 F1 entrega 3); quedan 73 pendientes, todas de escritura. Solo puede
 * BAJAR; el objetivo final es 0.
 */
export const MAX_PENDIENTES = 73;

function permanente(
  reason: string,
  operations: ReadonlyArray<string>,
): Exclusion[] {
  return operations.map((operation) => ({
    operation,
    kind: 'permanente',
    reason,
  }));
}

function pendiente(
  reason: string,
  operations: ReadonlyArray<string>,
): Exclusion[] {
  return operations.map((operation) => ({
    operation,
    kind: 'pendiente',
    reason: `PENDIENTE: ${reason}`,
  }));
}

export const EXCLUSIONS: ReadonlyArray<Exclusion> = [
  // ---------------------------------------------------------------- permanentes
  ...permanente(
    'Sondeo de disponibilidad para la infraestructura (balanceador/Docker); no es una capacidad de negocio. health.check cubre GET /health.',
    [
      'GET /health/ready',
    ],
  ),
  ...permanente(
    'Autenticación: el MCP no gestiona credenciales ni recuperación de contraseña; la identidad se configura por entorno (stdio) o por Bearer (HTTP).',
    [
      'POST /auth/login',
      'POST /auth/forgot-password',
      'POST /auth/reset-password',
    ],
  ),
  ...permanente(
    'Administración de la plataforma (SMTP, banderas de administrador, configuración de IA): no se delega a un agente.',
    [
      'GET /admin/smtp-config',
      'PATCH /admin/smtp-config',
      'POST /admin/smtp-config/test',
      'GET /admin/users',
      'PATCH /admin/users/{id}/admin-flag',
      'GET /admin/ai/usage',
      'GET /admin/ai/models',
      'POST /admin/ai/models',
      'PATCH /admin/ai/models/{modelId}',
      'GET /admin/ai/config',
      'PATCH /admin/ai/config',
      'GET /admin/ai/agents/{code}',
      'PATCH /admin/ai/agents/{code}',
      'POST /admin/ai/agents/{code}/test',
    ],
  ),
  ...permanente(
    'Descarga binaria (Excel, contenido de documento o evidencia): una tool MCP devuelve texto JSON, no archivos.',
    [
      'GET /documents/{id}/versions/{versionId}/content',
      'GET /documents/{id}/content',
      'GET /requests/{requestId}/plan/export-excel',
      'GET /requests/{requestId}/plan/template-excel',
      'GET /tasks/{taskId}/evidence/{evidenceId}/download',
    ],
  ),
  ...permanente(
    'Subida multipart/form-data de un archivo: una tool MCP no transporta binarios.',
    [
      'POST /tasks/{taskId}/evidence',
    ],
  ),
  ...permanente(
    'El asistente de IA del portal es un CLIENTE del MCP: no se expone a sí mismo como tool (evita recursión) y su chat es un flujo de eventos (SSE), no una respuesta JSON.',
    [
      'GET /assistant/status',
      'POST /assistant/chat',
      'GET /assistant/conversations',
      'GET /assistant/conversations/{id}',
      'DELETE /assistant/conversations/{id}',
    ],
  ),
  ...permanente(
    'La sugerencia de IA se orquesta desde el asistente del portal y consume el LLM configurado; el MCP no encadena agentes entre sí.',
    [
      'POST /requests/{id}/ai/triage-suggestion',
    ],
  ),

  // ------------------------------------------ pendientes: escritura (posterior)
  ...pendiente(
    'escritura · areas',
    [
      'POST /areas',
      'PATCH /areas/{id}',
    ],
  ),
  ...pendiente(
    'escritura · requesters',
    [
      'POST /requesters',
      'PATCH /requesters/{id}',
    ],
  ),
  ...pendiente(
    'escritura · notifications',
    [
      'POST /notifications/read-all',
      'POST /notifications/{id}/read',
    ],
  ),
  ...pendiente(
    'escritura · closure',
    [
      'POST /requests/{id}/closure',
      'POST /requests/{id}/closure/decision',
      'POST /requests/{id}/reopen',
    ],
  ),
  ...pendiente(
    'escritura · requests',
    [
      'DELETE /requests/{id}',
    ],
  ),
  ...pendiente(
    'escritura · triage',
    [
      'POST /requests/{id}/asset',
    ],
  ),
  ...pendiente(
    'escritura · assets',
    [
      'POST /assets',
      'PATCH /assets/{id}',
      'POST /assets/{id}/status',
    ],
  ),
  ...pendiente(
    'escritura · documents',
    [
      'POST /documents',
      'PATCH /documents/{id}',
      'POST /documents/{id}/versions',
      'POST /documents/{id}/submit-approval',
      'POST /documents/{id}/review',
      'POST /documents/{id}/status',
    ],
  ),
  ...pendiente(
    'escritura · users',
    [
      'POST /users/{id}/invite',
    ],
  ),
  ...pendiente(
    'escritura · tasks',
    [
      'DELETE /tasks/{id}',
      'DELETE /tasks/{taskId}/evidence/{evidenceId}',
    ],
  ),
  ...pendiente(
    'escritura · plan',
    [
      'PATCH /requests/{requestId}/plan',
      'POST /requests/{requestId}/plan/import-excel',
    ],
  ),
  ...pendiente(
    'escritura · plan-phases',
    [
      'POST /plans/{planId}/phases',
      'PATCH /plans/{planId}/phases/reorder',
      'PATCH /plans/{planId}/phases/{phaseId}',
      'DELETE /plans/{planId}/phases/{phaseId}',
    ],
  ),
  ...pendiente(
    'escritura · task-dependencies',
    [
      'POST /tasks/{id}/dependencies',
      'DELETE /tasks/{id}/dependencies/{predecessorTaskId}',
    ],
  ),
  ...pendiente(
    'escritura · capacity',
    [
      'POST /capacity/availability',
      'PATCH /capacity/availability/{id}',
      'POST /capacity/assignments',
      'PATCH /capacity/assignments/{id}',
      'DELETE /capacity/assignments/{id}',
    ],
  ),
  ...pendiente(
    'escritura · worklog',
    [
      'POST /worklog/daily',
      'PATCH /worklog/daily/{id}',
      'DELETE /worklog/daily/{id}',
      'POST /worklog/daily/{id}/submit',
      'POST /worklog/daily/{id}/activities',
      'PATCH /worklog/activities/{id}',
      'DELETE /worklog/activities/{id}',
      'POST /weekly-reports',
      'PATCH /weekly-reports/{id}',
      'POST /weekly-reports/{id}/submit',
    ],
  ),
  ...pendiente(
    'escritura · issues',
    [
      'POST /issues',
      'PATCH /issues/{id}',
      'DELETE /issues/{id}',
      'POST /issues/{id}/transition',
    ],
  ),
  ...pendiente(
    'escritura · meetings',
    [
      'POST /meetings',
      'PATCH /meetings/{id}',
      'DELETE /meetings/{id}',
      'POST /meetings/{id}/close',
      'POST /meetings/{id}/reopen',
    ],
  ),
  ...pendiente(
    'escritura · commitments',
    [
      'POST /commitments',
      'PATCH /commitments/{id}',
      'DELETE /commitments/{id}',
      'POST /commitments/{id}/transition',
    ],
  ),
  ...pendiente(
    'escritura · governance-gates',
    [
      'POST /requests/{id}/gates/{gateCode}/pending-items',
      'PATCH /requests/{id}/gates/{gateCode}/pending-items/{itemId}',
      'POST /requests/{id}/gates/{gateCode}/waive',
      'POST /requests/{id}/block',
      'POST /requests/{id}/unblock',
      'PUT /requests/{id}/governance-route',
    ],
  ),
  ...pendiente(
    'escritura · governance-validations',
    [
      'POST /requests/{id}/validations',
      'PATCH /requests/{id}/validations/{validationId}/resolve-blocking',
    ],
  ),
  ...pendiente(
    'escritura · recurring-activity',
    [
      'POST /recurring-activities/occurrences/{id}/start',
      'POST /recurring-activities/occurrences/{id}/complete',
      'POST /recurring-activities/run-generation',
      'POST /recurring-activities',
      'PATCH /recurring-activities/{id}',
      'DELETE /recurring-activities/{id}',
    ],
  ),
];
