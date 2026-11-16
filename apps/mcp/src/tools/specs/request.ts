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
      'UpdateRequestDto; el backend valida los datos. Quién edita depende del ' +
      'estado: en Registrada y Devuelta, quien la registró, el líder del proceso ' +
      'o el jefe; en los estados siguientes solo líder o jefe (403 para los demás); ' +
      'desde Comprometida hasta antes del cierre exige changeJustification (mínimo ' +
      '10 caracteres, 400 si falta). Cerrada responde 409. Editar una solicitud ' +
      'Devuelta no cambia su estado: usa request.resubmit para reenviarla.',
  },
  {
    name: 'request.resubmit',
    operation: 'POST /requests/{id}/resubmit',
    access: 'write',
    description:
      'Reenvía a triage una solicitud devuelta (POST /requests/{id}/resubmit): ' +
      'pasa de Devuelta a Registrada, conserva el historial de triages y avisa al ' +
      'jefe. Lo hace quien registró la solicitud, el líder del proceso o el jefe ' +
      '(403 para los demás); 409 si no está Devuelta. El cuerpo es opcional y ' +
      'admite los mismos campos que request.update para corregir la ficha en el ' +
      'mismo paso. Antes de reenviar, revisa con el usuario el motivo de la ' +
      'devolución (currentTriageReason en request.get).',
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
      'cuerpo debe cumplir CreateTriageDto; el backend valida los datos. ' +
      'Con decision DEVOLVER o RECHAZAR el campo reason (motivo, mínimo 10 ' +
      'caracteres) es obligatorio: el solicitante lo ve en la ficha y en una ' +
      'notificación; con CONTINUAR no se envía.',
  },
  {
    name: 'request.priority.create',
    operation: 'POST /requests/{id}/priority',
    access: 'write',
    description:
      'Registra la evaluación de prioridad de una solicitud ' +
      '(POST /requests/{id}/priority). El cuerpo debe cumplir ' +
      'CreatePriorityEvaluationDto; el backend valida los datos. Los ocho ' +
      'criterios (impact, alignment, riskControl, urgency, scope, ' +
      'dataAvailability, feasibility, reuse) son obligatorios, enteros de 1 a ' +
      '5, sin valores por defecto: si falta alguno responde 400. Evalúa cada ' +
      'criterio con el usuario antes de guardar.',
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
      'procesos más las que creó) y sin parámetros devuelve todos los estados. ' +
      'El vencimiento (dueStatus, daysToTarget) se mide contra referenceDate: el ' +
      'compromiso del plan autorizado (referenceSource=PLAN) o, sin plan autorizado, ' +
      'la fecha objetivo de la solicitud, que es solo una expectativa inicial ' +
      '(referenceSource=SOLICITUD). requestedGapDays informa cuánto se aparta el plan ' +
      'de lo solicitado y scheduleVarianceDays cuánto se corrió el pronóstico ' +
      '(forecastDate) respecto al compromiso; ninguno de los dos es un vencimiento.',
  },
];
