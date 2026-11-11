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
    description:
      'Lista las tareas de un plan (GET /plans/{planId}/tasks). Cada tarea trae ' +
      'su ID visible (code, p. ej. PRY-0012-T07), el de su fase (phaseCode) y el ' +
      'de la solicitud (requestCode). El filtro q busca por título o por ese ID ' +
      'visible (completo, parcial o forma corta T07/F2).',
  },
  {
    name: 'plan.participants.get',
    operation: 'GET /requests/{requestId}/plan/participants',
    access: 'read',
    description:
      'Consulta los procesos que intervienen en la solicitud de un plan ' +
      '(GET /requests/{requestId}/plan/participants): procesos activos y ' +
      'participantes, cuál es el principal, si cada uno se puede quitar y qué ' +
      'tareas lo impiden. Solo lectura; exclusivo del jefe de área.',
  },
  {
    name: 'plan.participants.update',
    operation: 'PUT /requests/{requestId}/plan/participants',
    access: 'destructive',
    description:
      'Corrige los procesos que intervienen en la solicitud de un plan ' +
      '(PUT /requests/{requestId}/plan/participants). El cuerpo es ' +
      'UpdatePlanParticipantsDto { participantProcessIds: [uuid] }: reemplaza ' +
      'los procesos participantes ADEMÁS del principal (que no se quita). ' +
      'Agregar habilita al instante a su gente como responsables; quitar se ' +
      'rechaza (409) si hay tareas asignadas a personas que dejarían de ser ' +
      'elegibles. No reabre el triage. Exclusivo del jefe de área; se audita.',
  },
  {
    name: 'plan.responsible-candidates',
    operation: 'GET /plans/{planId}/responsible-candidates',
    access: 'read',
    description:
      'Lista los candidatos a responsable de las tareas de un plan ' +
      '(GET /plans/{planId}/responsible-candidates): las personas con grant ' +
      'activo en alguno de los procesos que intervienen en la solicitud del ' +
      'plan (decididos en el triage). Solo lectura; el backend impone la misma ' +
      'regla al asignar un responsable.',
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
    description:
      'Obtiene una tarea por id (GET /tasks/{id}), con sus predecesoras, el ' +
      'motivo de bloqueo vigente (blockedReason), el nombre de la fase y la ' +
      'solicitud (phaseName, requestId, requestTitle) y si exige evidencia y la ' +
      'tiene (evidenceRequired, hasEvidence). Incluye los IDs visibles code, ' +
      'phaseCode y requestCode (p. ej. PRY-0012-T07).',
  },
  {
    name: 'task.get_by_code',
    operation: 'GET /tasks/by-code/{code}',
    access: 'read',
    description:
      'Obtiene una tarea por su ID visible (GET /tasks/by-code/{code}), por ejemplo ' +
      'PRY-0012-T07, sin distinguir mayusculas. Devuelve lo mismo que task.get ' +
      '(code, phaseCode, requestCode, predecesoras, estado, evidencia...). Usala ' +
      'cuando el usuario cite la tarea por su ID visible en vez de por su UUID.',
  },
  {
    name: 'task.history',
    operation: 'GET /tasks/{id}/history',
    access: 'read',
    description:
      'Traza de cambios de una tarea (GET /tasks/{id}/history): del evento mas ' +
      'reciente al mas antiguo, con quien lo hizo, la fecha y hora, y cada campo ' +
      'que cambio (estado, avance, responsable, fase, fechas, aceptacion...) con ' +
      'su valor anterior y nuevo.',
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
      'debe cumplir UpdateTaskStatusDto { status, progress?, evidenceUrl?, ' +
      'blockedReason? }; blockedReason (max 500, opcional) solo es valido con ' +
      'status BLOQUEADA (con otro estado el backend responde 400) y se limpia ' +
      'al salir de ese estado. REGLA DE CIERRE: pasar a EN_REVISION exige avance 100 % ' +
      '(el del mismo PATCH o el guardado) y, si la tarea tiene criterios de aceptacion o ' +
      'fase de gobierno (evidenceRequired), evidencia: evidenceUrl con texto o al menos un ' +
      'archivo; si falta algo responde 409 con el detalle. Pasar a TERMINADA (aprobar) y ' +
      'reabrir (TERMINADA a EN_CURSO) solo puede hacerlo un lider de proceso o el jefe de ' +
      'area; un integrante, aunque sea el responsable, recibe 403. Devolver (EN_REVISION a ' +
      'EN_CURSO) no cambia. Para ver que tareas esperan aprobacion usa task.pending-review. ' +
      'El backend valida los datos.',
  },
  {
    name: 'task.progress.update',
    operation: 'PATCH /tasks/{id}/progress',
    access: 'write',
    description:
      'Actualiza solo el avance (0 a 100) de una tarea sin cambiar su estado ' +
      '(PATCH /tasks/{id}/progress). El cuerpo debe cumplir UpdateTaskProgressDto ' +
      '{ progress }. El backend solo lo admite con la tarea En curso, Bloqueada o ' +
      'En revision, y exige ser jefe, lider o el responsable de la tarea.',
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
