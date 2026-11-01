/**
 * Tools de SOLO LECTURA del resto de dominios del portal (áreas, solicitantes,
 * notificaciones, cierre, activos, documentos, capacidad, bitácora, hallazgos,
 * reuniones, compromisos, control de área y actividades recurrentes).
 *
 * Los filtros de consulta y los parámetros de ruta salen del contrato OpenAPI;
 * aquí solo se declara el nombre, la operación y la descripción.
 */
import type { ToolSpec } from '../spec.js';

function lectura(
  name: string,
  operation: string,
  description: string,
): ToolSpec {
  return { name, operation, access: 'read', description };
}

export const LECTURA_SPECS: ReadonlyArray<ToolSpec> = [
  // Ayuda del portal
  lectura(
    'help.search',
    'GET /help/search',
    'Busca en la documentación de uso del portal (pantallas, roles y permisos, flujo de trabajo) las secciones que responden una pregunta sobre cómo usarlo (GET /help/search). Úsala para dudas de uso; no devuelve datos de negocio.',
  ),

  // Áreas y solicitantes
  lectura('area.list', 'GET /areas', 'Lista las áreas de la organización (GET /areas).'),
  lectura('area.get', 'GET /areas/{id}', 'Obtiene un área por id (GET /areas/{id}).'),
  lectura(
    'requester.list',
    'GET /requesters',
    'Lista el maestro de solicitantes (GET /requesters), con filtros opcionales.',
  ),
  lectura(
    'requester.get',
    'GET /requesters/{id}',
    'Obtiene un solicitante por id (GET /requesters/{id}).',
  ),

  // Mi trabajo y notificaciones
  lectura(
    'notification.list',
    'GET /notifications',
    'Lista las notificaciones del usuario autenticado (GET /notifications).',
  ),
  lectura(
    'my-work.get',
    'GET /my-work',
    'Obtiene el trabajo asignado al usuario autenticado: tareas y pendientes (GET /my-work).',
  ),

  // Cierre, aprobación y prioridad
  lectura(
    'closure.pending',
    'GET /closures/pending',
    'Lista las solicitudes con cierre formal pendiente (GET /closures/pending).',
  ),
  lectura(
    'closure.get',
    'GET /requests/{id}/closure',
    'Obtiene el cierre formal de una solicitud (GET /requests/{id}/closure).',
  ),
  lectura(
    'request.approval.pending',
    'GET /requests/pending-approval',
    'Lista las solicitudes pendientes de aprobación (GET /requests/pending-approval).',
  ),
  lectura(
    'request.priority.get',
    'GET /requests/{id}/priority',
    'Obtiene la evaluación de prioridad de una solicitud (GET /requests/{id}/priority).',
  ),

  // Activos
  lectura('asset.list', 'GET /assets', 'Lista los activos (GET /assets), con filtros opcionales.'),
  lectura('asset.get', 'GET /assets/{id}', 'Obtiene un activo por id (GET /assets/{id}).'),
  lectura(
    'asset.requests',
    'GET /assets/{id}/requests',
    'Lista las solicitudes vinculadas a un activo (GET /assets/{id}/requests).',
  ),

  // Documentos (el contenido binario no se expone por MCP)
  lectura(
    'document.list',
    'GET /documents',
    'Lista los documentos (GET /documents), con filtros opcionales.',
  ),
  lectura(
    'document.pending-approval',
    'GET /documents/pending-approval',
    'Lista los documentos pendientes de aprobación (GET /documents/pending-approval).',
  ),
  lectura(
    'document.get',
    'GET /documents/{id}',
    'Obtiene los metadatos de un documento (GET /documents/{id}).',
  ),
  lectura(
    'document.versions.list',
    'GET /documents/{id}/versions',
    'Lista las versiones de un documento (GET /documents/{id}/versions).',
  ),

  // Tareas, evidencias, plan y dependencias
  lectura(
    'evidence.list',
    'GET /tasks/{taskId}/evidence',
    'Lista las evidencias de una tarea (GET /tasks/{taskId}/evidence).',
  ),
  lectura(
    'plan.guide',
    'GET /requests/{requestId}/plan/guide',
    'Obtiene la guía del plan de una solicitud (GET /requests/{requestId}/plan/guide).',
  ),
  lectura(
    'plan.phases.list',
    'GET /plans/{planId}/phases',
    'Lista las fases de un plan (GET /plans/{planId}/phases).',
  ),
  lectura(
    'task.dependencies.list',
    'GET /tasks/{id}/dependencies',
    'Lista las dependencias de una tarea (GET /tasks/{id}/dependencies).',
  ),

  // Capacidad
  lectura(
    'capacity.summary',
    'GET /capacity/summary',
    'Obtiene el resumen de capacidad del equipo (GET /capacity/summary).',
  ),
  lectura(
    'capacity.people',
    'GET /capacity/people',
    'Lista la capacidad por persona (GET /capacity/people).',
  ),
  lectura(
    'capacity.availability.list',
    'GET /capacity/availability',
    'Lista las disponibilidades registradas (GET /capacity/availability).',
  ),
  lectura(
    'capacity.assignments.list',
    'GET /capacity/assignments',
    'Lista las asignaciones de capacidad (GET /capacity/assignments).',
  ),

  // Bitácora y reportes semanales
  lectura(
    'worklog.people',
    'GET /coordination/people',
    'Lista las personas visibles para coordinación de bitácora (GET /coordination/people).',
  ),
  lectura(
    'worklog.daily.list',
    'GET /worklog/daily',
    'Lista las bitácoras diarias (GET /worklog/daily), con filtros opcionales.',
  ),
  lectura(
    'worklog.daily.get',
    'GET /worklog/daily/{id}',
    'Obtiene una bitácora diaria por id (GET /worklog/daily/{id}).',
  ),
  lectura(
    'weekly-report.list',
    'GET /weekly-reports',
    'Lista los reportes semanales (GET /weekly-reports), con filtros opcionales.',
  ),
  lectura(
    'weekly-report.get',
    'GET /weekly-reports/{id}',
    'Obtiene un reporte semanal por id (GET /weekly-reports/{id}).',
  ),

  // Hallazgos, reuniones y compromisos
  lectura('issue.list', 'GET /issues', 'Lista los hallazgos (GET /issues), con filtros opcionales; usa requestId para ver los de un proyecto.'),
  lectura('issue.get', 'GET /issues/{id}', 'Obtiene un hallazgo por id (GET /issues/{id}).'),
  lectura(
    'meeting.list',
    'GET /meetings',
    'Lista las reuniones (GET /meetings), con filtros opcionales; usa requestId para ver las de un proyecto.',
  ),
  lectura('meeting.get', 'GET /meetings/{id}', 'Obtiene una reunión por id (GET /meetings/{id}).'),
  lectura(
    'commitment.list',
    'GET /commitments',
    'Lista los compromisos (GET /commitments), con filtros opcionales; usa requestId para ver los de un proyecto.',
  ),
  lectura(
    'commitment.get',
    'GET /commitments/{id}',
    'Obtiene un compromiso por id (GET /commitments/{id}).',
  ),

  // Gobierno: validaciones
  lectura(
    'validation.list',
    'GET /requests/{id}/validations',
    'Lista las validaciones de gobierno de una solicitud (GET /requests/{id}/validations).',
  ),

  // Control de área
  lectura(
    'area-control.indicators',
    'GET /area-control/indicators',
    'Obtiene los indicadores de control del área (GET /area-control/indicators).',
  ),
  lectura(
    'area-control.demand-summary',
    'GET /area-control/demand-summary',
    'Obtiene el resumen de demanda del área (GET /area-control/demand-summary).',
  ),
  lectura(
    'area-control.attention',
    'GET /area-control/attention',
    'Lista lo que requiere atención en el área (GET /area-control/attention).',
  ),

  // Actividades recurrentes
  lectura(
    'recurring.occurrences.list',
    'GET /recurring-activities/occurrences',
    'Lista las ocurrencias de actividades recurrentes (GET /recurring-activities/occurrences).',
  ),
  lectura(
    'recurring.occurrences.get',
    'GET /recurring-activities/occurrences/{id}',
    'Obtiene una ocurrencia de actividad recurrente (GET /recurring-activities/occurrences/{id}).',
  ),
  lectura(
    'recurring.list',
    'GET /recurring-activities',
    'Lista las actividades recurrentes (GET /recurring-activities).',
  ),
  lectura(
    'recurring.compliance',
    'GET /recurring-activities/compliance',
    'Obtiene el cumplimiento de actividades recurrentes (GET /recurring-activities/compliance).',
  ),
  lectura(
    'recurring.get',
    'GET /recurring-activities/{id}',
    'Obtiene una actividad recurrente por id (GET /recurring-activities/{id}).',
  ),
];
