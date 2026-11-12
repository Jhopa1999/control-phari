/** Tools de solicitudes (requests), triage, prioridad, aprobación y portafolio. */
import type { ToolSpec } from '../spec.js';

export const REQUEST_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'request.list',
    operation: 'GET /requests',
    access: 'read',
    description:
      'Lista solicitudes (GET /requests), con filtros opcionales por proceso ' +
      'principal y estado. Alcance: jefe y líder ven todas; el integrante, las de ' +
      'sus procesos más las que él creó.',
  },
  {
    name: 'request.get',
    operation: 'GET /requests/{id}',
    access: 'read',
    description:
      'Obtiene una solicitud por id (GET /requests/{id}). Incluye su ID visible ' +
      '(code, p. ej. PRY-0012).',
  },
  {
    name: 'request.get_by_code',
    operation: 'GET /requests/by-code/{code}',
    access: 'read',
    description:
      'Obtiene una solicitud por su ID visible (GET /requests/by-code/{code}), por ' +
      'ejemplo PRY-0012, sin distinguir mayúsculas. Devuelve lo mismo que ' +
      'request.get. Solo acepta el código de solicitud (400 si es de fase o ' +
      'tarea); 404 si no existe o está fuera del alcance del usuario. Úsala ' +
      'cuando el usuario cite el proyecto por su ID visible en vez de por su UUID.',
  },
  {
    name: 'code.resolve',
    operation: 'GET /codes/{code}',
    access: 'read',
    description:
      'Resuelve cualquier ID visible completo (GET /codes/{code}): solicitud ' +
      '(PRY-0012), fase (PRY-0012-F2) o tarea (PRY-0012-T07), sin distinguir ' +
      'mayúsculas. Devuelve type (REQUEST, PHASE o TASK), id, code, title y los ' +
      'datos de su solicitud (requestId, requestCode, requestTitle, ' +
      'requestStatus), más phaseId/phaseName en fase y tarea. No acepta la forma ' +
      'corta (T07, F2): si el usuario la cita, usa el proyecto en contexto para ' +
      'armar el código completo. 400 si el formato es inválido; 404 si no existe ' +
      'o está fuera del alcance. Úsala primero cuando no sepas qué tipo de ID es.',
  },
  {
    name: 'request.create',
    operation: 'POST /requests',
    access: 'write',
    description:
      'Crea una solicitud (POST /requests). El cuerpo debe cumplir ' +
      'CreateRequestDto; el backend valida los datos.',
  },
  {
    name: 'request.update',
    operation: 'PATCH /requests/{id}',
    access: 'write',
    description:
      'Actualiza una solicitud (PATCH /requests/{id}). El cuerpo debe cumplir ' +
      'UpdateRequestDto; el backend valida los datos.',
  },
  {
    name: 'request.triage.get',
    operation: 'GET /requests/{id}/triage',
    access: 'read',
    description:
      'Obtiene el contexto de triage de una solicitud ' +
      '(GET /requests/{id}/triage, TriageContextResponseDto).',
  },
  {
    name: 'request.triage.create',
    operation: 'POST /requests/{id}/triage',
    access: 'write',
    description:
      'Registra el triage de una solicitud (POST /requests/{id}/triage). El ' +
      'cuerpo debe cumplir CreateTriageDto; el backend valida los datos.',
  },
  {
    name: 'request.priority.create',
    operation: 'POST /requests/{id}/priority',
    access: 'write',
    description:
      'Registra la evaluación de prioridad de una solicitud ' +
      '(POST /requests/{id}/priority). El cuerpo debe cumplir ' +
      'CreatePriorityEvaluationDto; el backend valida los datos.',
  },
  {
    name: 'request.approval.get',
    operation: 'GET /requests/{id}/approval',
    access: 'read',
    description:
      'Obtiene la aprobación de una solicitud (GET /requests/{id}/approval).',
  },
  {
    name: 'request.approval.create',
    operation: 'POST /requests/{id}/approval',
    access: 'write',
    description:
      'Registra la aprobación de una solicitud (POST /requests/{id}/approval). ' +
      'El cuerpo debe cumplir CreateApprovalDto; el backend valida los datos.',
  },
  {
    name: 'portfolio.get',
    operation: 'GET /portfolio',
    access: 'read',
    description:
      'Obtiene la vista de portafolio (GET /portfolio), con filtros opcionales ' +
      'por banda, estado y proceso principal; cada filtro admite varios valores ' +
      '(arreglo, se combinan con O; entre filtros es Y; máximo 50 por filtro). ' +
      'Mismo alcance que request.list (jefe y líder ven todas; el integrante, sus ' +
      'procesos más las que creó) y sin parámetros devuelve todos los estados.',
  },
];
