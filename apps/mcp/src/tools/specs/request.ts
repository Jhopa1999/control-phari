/** Tools de solicitudes (requests), triage, prioridad, aprobación y portafolio. */
import type { ToolSpec } from '../spec.js';

export const REQUEST_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'request.list',
    operation: 'GET /requests',
    access: 'read',
    description:
      'Lista solicitudes (GET /requests), con filtros opcionales por proceso ' +
      'principal y estado.',
  },
  {
    name: 'request.get',
    operation: 'GET /requests/{id}',
    access: 'read',
    description: 'Obtiene una solicitud por id (GET /requests/{id}).',
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
      'por banda, estado y proceso principal.',
  },
];
