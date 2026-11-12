/**
 * Tools de ESCRITURA que el asistente puede proponer: coordinación (hallazgos,
 * reuniones y compromisos), planes, fases, dependencias, activos y documentos.
 * Crean, editan o cambian de estado lo no decisorio. Quedan fuera el borrado,
 * el cierre o reapertura de reuniones, el cambio de estado de activos y
 * documentos, y la aprobación. El backend valida los datos y los permisos; aquí
 * solo se declara el nombre, la operación y la descripción.
 */
import type { ToolSpec } from '../spec.js';

function escritura(
  name: string,
  operation: string,
  description: string,
): ToolSpec {
  return { name, operation, access: 'write', description };
}

export const ESCRITURA_SPECS: ReadonlyArray<ToolSpec> = [
  // Hallazgos


  // Reuniones
  escritura(
    'meeting.create',
    'POST /meetings',
    'Registra una reunión (POST /meetings). El cuerpo debe cumplir el DTO de creación; el backend valida los datos.',
  ),
  escritura(
    'meeting.update',
    'PATCH /meetings/{id}',
    'Actualiza los datos de una reunión (PATCH /meetings/{id}). El backend valida los datos.',
  ),

  // Compromisos
  escritura(
    'commitment.create',
    'POST /commitments',
    'Registra un compromiso (POST /commitments). El cuerpo debe cumplir el DTO de creación; el backend valida los datos.',
  ),
  escritura(
    'commitment.update',
    'PATCH /commitments/{id}',
    'Actualiza los datos de un compromiso (PATCH /commitments/{id}). El backend valida los datos.',
  ),
  escritura(
    'commitment.transition',
    'POST /commitments/{id}/transition',
    'Cambia el estado de un compromiso (POST /commitments/{id}/transition). El backend valida la transición.',
  ),

  // Planes, fases y dependencias
  escritura(
    'plan.update',
    'PATCH /requests/{requestId}/plan',
    'Edita los datos del plan de una solicitud (PATCH /requests/{requestId}/plan). No cambia el estado del plan; el backend valida los datos.',
  ),
  escritura(
    'phase.create',
    'POST /plans/{planId}/phases',
    'Crea una fase en un plan (POST /plans/{planId}/phases). Sin order, se agrega al final; el backend valida los datos.',
  ),
  escritura(
    'phase.update',
    'PATCH /plans/{planId}/phases/{phaseId}',
    'Edita nombre, fechas o entregable de una fase (PATCH /plans/{planId}/phases/{phaseId}). El backend valida los datos.',
  ),
  escritura(
    'phase.reorder',
    'PATCH /plans/{planId}/phases/reorder',
    'Reordena las fases de un plan (PATCH /plans/{planId}/phases/reorder). El backend protege la fase inicial con tareas.',
  ),
  escritura(
    'task.dependency.add',
    'POST /tasks/{id}/dependencies',
    'Añade una tarea predecesora a una tarea (POST /tasks/{id}/dependencies). El backend valida que no sea la misma tarea, que sea del mismo plan y que no cree ciclos ni duplicados.',
  ),

  // Activos y documentos (en borrador)
  escritura(
    'asset.create',
    'POST /assets',
    'Crea un activo; nace en BORRADOR (POST /assets). Solo el jefe de área; el backend valida los datos.',
  ),
  escritura(
    'asset.update',
    'PATCH /assets/{id}',
    'Edita los atributos de un activo, no su estado (PATCH /assets/{id}). Solo el jefe de área.',
  ),
  escritura(
    'document.create',
    'POST /documents',
    'Crea un documento con su versión 1 en Markdown (POST /documents). El backend valida los datos y el alcance.',
  ),
  escritura(
    'document.update',
    'PATCH /documents/{id}',
    'Edita los metadatos de un documento: título y categoría, no el estado ni el contenido (PATCH /documents/{id}).',
  ),
  escritura(
    'document.version.create',
    'POST /documents/{id}/versions',
    'Crea una nueva versión del documento con contenido Markdown (POST /documents/{id}/versions). Editar el contenido siempre genera una versión nueva.',
  ),
];
