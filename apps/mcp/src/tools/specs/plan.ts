/** Tools de planes y tareas. */
import type { ToolSpec } from '../spec.js';

export const PLAN_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'plan.get',
    operation: 'GET /requests/{requestId}/plan',
    access: 'read',
    description:
      'Obtiene el plan de una solicitud (GET /requests/{requestId}/plan).',
  },
  {
    name: 'plan.create',
    operation: 'POST /requests/{requestId}/plan',
    access: 'write',
    description:
      'Crea el plan de una solicitud (POST /requests/{requestId}/plan). El ' +
      'cuerpo debe cumplir CreatePlanDto; el backend valida los datos.',
  },
  {
    name: 'plan.export',
    operation: 'GET /requests/{requestId}/plan/export',
    access: 'read',
    description:
      'Exporta el plan de una solicitud a un documento JSON portable ' +
      '(GET /requests/{requestId}/plan/export, PlanDocumentDto). Solo lectura.',
  },
  {
    name: 'plan.import',
    operation: 'POST /requests/{requestId}/plan/import',
    access: 'destructive',
    description:
      'Importa (reemplaza) el contenido del plan de una solicitud desde un ' +
      'documento (POST /requests/{requestId}/plan/import). Solo opera sobre ' +
      'planes en BORRADOR o DEVUELTO. El cuerpo debe cumplir PlanDocumentDto: ' +
      '{ kind: "control-phari-plan", formatVersion: "1.0", plan: {periodStart, ' +
      'periodEnd, commitmentDate, risks, mitigations}, phases: [{ order, name, ' +
      'startDate, endDate, deliverable, tasks: [{ ref, title, isMilestone, ' +
      'estimateHours, startDate, endDate, description, acceptanceCriteria, ' +
      'frameworkPhaseRequired, evidenceUrl }] }], dependencies: [{ dependentRef, ' +
      'predecessorRef }] }. El backend valida refs, ciclos e hitos.',
  },
  {
    name: 'plan.submit',
    operation: 'POST /requests/{requestId}/plan/submit',
    access: 'write',
    optionalBody: true,
    description:
      'Envía el plan de una solicitud a autorización ' +
      '(POST /requests/{requestId}/plan/submit). El cuerpo (SubmitPlanDto) es ' +
      'opcional; el backend valida los datos.',
  },
  {
    name: 'plan.authorize',
    operation: 'POST /requests/{requestId}/plan/authorize',
    access: 'write',
    optionalBody: true,
    description:
      'Autoriza el plan de una solicitud ' +
      '(POST /requests/{requestId}/plan/authorize). El plan pasa a AUTORIZADO y ' +
      'la solicitud a En ejecucion. El cuerpo (AuthorizePlanDto) es opcional. ' +
      'Requiere que el plan este en autorizacion y rol con permiso de review.',
  },
  {
    name: 'plan.return',
    operation: 'POST /requests/{requestId}/plan/return',
    access: 'write',
    description:
      'Devuelve el plan de una solicitud con un motivo ' +
      '(POST /requests/{requestId}/plan/return -> DEVUELTO). El cuerpo debe ' +
      'cumplir ReturnPlanDto { reason }; el backend valida los datos.',
  },
  {
    name: 'plan.tasks.list',
    operation: 'GET /plans/{planId}/tasks',
    access: 'read',
    description: 'Lista las tareas de un plan (GET /plans/{planId}/tasks).',
  },
  {
    name: 'task.create',
    operation: 'POST /phases/{phaseId}/tasks',
    access: 'write',
    description:
      'Crea una tarea en una fase (POST /phases/{phaseId}/tasks). El cuerpo ' +
      'debe cumplir CreateTaskDto { title (requerido), responsibleUserId, ' +
      'processId, startDate, endDate, estimateHours, isMilestone (hito => ' +
      'estimateHours 0), description, acceptanceCriteria, frameworkPhaseRequired, ' +
      'evidenceUrl }; el backend valida los datos.',
  },
  {
    name: 'task.get',
    operation: 'GET /tasks/{id}',
    access: 'read',
    description: 'Obtiene una tarea por id (GET /tasks/{id}).',
  },
  {
    name: 'task.update',
    operation: 'PATCH /tasks/{id}',
    access: 'write',
    description:
      'Edita la ficha de una tarea (PATCH /tasks/{id}). No cambia estado ni ' +
      'aceptacion. El cuerpo debe cumplir UpdateTaskDto (campos parciales de ' +
      'CreateTaskDto: title, responsibleUserId, processId, startDate, endDate, ' +
      'estimateHours, isMilestone, description, acceptanceCriteria, ' +
      'frameworkPhaseRequired, evidenceUrl); el backend valida los datos.',
  },
  {
    name: 'task.status.update',
    operation: 'PATCH /tasks/{id}/status',
    access: 'write',
    description:
      'Actualiza el estado de una tarea (PATCH /tasks/{id}/status). El cuerpo ' +
      'debe cumplir UpdateTaskStatusDto; el backend valida los datos.',
  },
  {
    name: 'task.accept',
    operation: 'PATCH /tasks/{id}/accept',
    access: 'write',
    description:
      'Acepta o retira la aceptacion de una tarea (PATCH /tasks/{id}/accept). ' +
      'Precondicion: la tarea debe estar TERMINADA. Rol JEFE_AREA/LIDER_PROCESO ' +
      '(capacidad plan). El cuerpo debe cumplir AcceptTaskDto { accepted: boolean } ' +
      '(true acepta; false retira la aceptacion); el backend valida los datos. ' +
      'La aceptacion es requisito del gate de predecesoras para iniciar las ' +
      'tareas dependientes.',
  },
];
