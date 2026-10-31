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
 * Tope (ratchet) de exclusiones PENDIENTES. Hoy el MCP cubre 47 de 186
 * operaciones: 118 están pendientes (45 de lectura y 73 de
 * escritura). La entrega 3 de BL-032 F1 añade las tools de lectura y reduce
 * este tope; el objetivo final es 0.
 */
export const MAX_PENDIENTES = 118;

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
    'La sugerencia de IA se orquesta desde el asistente del portal y consume el LLM configurado; el MCP no encadena agentes entre sí.',
    [
      'POST /requests/{id}/ai/triage-suggestion',
    ],
  ),

  // ------------------------------------------- pendientes: lectura (entrega 3)
  ...pendiente(
    'lectura · areas',
    [
      'GET /areas',
      'GET /areas/{id}',
    ],
  ),
  ...pendiente(
    'lectura · requesters',
    [
      'GET /requesters',
      'GET /requesters/{id}',
    ],
  ),
  ...pendiente(
    'lectura · notifications',
    [
      'GET /notifications',
    ],
  ),
  ...pendiente(
    'lectura · closure',
    [
      'GET /closures/pending',
      'GET /requests/{id}/closure',
    ],
  ),
  ...pendiente(
    'lectura · approval',
    [
      'GET /requests/pending-approval',
    ],
  ),
  ...pendiente(
    'lectura · priority',
    [
      'GET /requests/{id}/priority',
    ],
  ),
  ...pendiente(
    'lectura · assets',
    [
      'GET /assets',
      'GET /assets/{id}',
      'GET /assets/{id}/requests',
    ],
  ),
  ...pendiente(
    'lectura · documents',
    [
      'GET /documents',
      'GET /documents/pending-approval',
      'GET /documents/{id}',
      'GET /documents/{id}/versions',
    ],
  ),
  ...pendiente(
    'lectura · tasks',
    [
      'GET /my-work',
      'GET /tasks/{taskId}/evidence',
    ],
  ),
  ...pendiente(
    'lectura · plan',
    [
      'GET /requests/{requestId}/plan/guide',
    ],
  ),
  ...pendiente(
    'lectura · plan-phases',
    [
      'GET /plans/{planId}/phases',
    ],
  ),
  ...pendiente(
    'lectura · task-dependencies',
    [
      'GET /tasks/{id}/dependencies',
    ],
  ),
  ...pendiente(
    'lectura · capacity',
    [
      'GET /capacity/summary',
      'GET /capacity/people',
      'GET /capacity/availability',
      'GET /capacity/assignments',
    ],
  ),
  ...pendiente(
    'lectura · worklog',
    [
      'GET /coordination/people',
      'GET /worklog/daily',
      'GET /worklog/daily/{id}',
      'GET /weekly-reports',
      'GET /weekly-reports/{id}',
    ],
  ),
  ...pendiente(
    'lectura · issues',
    [
      'GET /issues',
      'GET /issues/{id}',
    ],
  ),
  ...pendiente(
    'lectura · meetings',
    [
      'GET /meetings',
      'GET /meetings/{id}',
    ],
  ),
  ...pendiente(
    'lectura · commitments',
    [
      'GET /commitments',
      'GET /commitments/{id}',
    ],
  ),
  ...pendiente(
    'lectura · governance-validations',
    [
      'GET /requests/{id}/validations',
    ],
  ),
  ...pendiente(
    'lectura · area-control',
    [
      'GET /area-control/indicators',
      'GET /area-control/demand-summary',
      'GET /area-control/attention',
    ],
  ),
  ...pendiente(
    'lectura · recurring-activity',
    [
      'GET /recurring-activities/occurrences',
      'GET /recurring-activities/occurrences/{id}',
      'GET /recurring-activities',
      'GET /recurring-activities/compliance',
      'GET /recurring-activities/{id}',
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
