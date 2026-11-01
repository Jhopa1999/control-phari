/**
 * Tools de ESCRITURA de coordinación (hallazgos, reuniones y compromisos):
 * crear, editar y cambiar de estado. Quedan fuera el borrado y el cierre o
 * reapertura de reuniones. El backend valida los datos y los permisos; aquí
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
  escritura(
    'issue.create',
    'POST /issues',
    'Registra un hallazgo (POST /issues). El cuerpo debe cumplir el DTO de creación; el backend valida los datos.',
  ),
  escritura(
    'issue.update',
    'PATCH /issues/{id}',
    'Actualiza los datos de un hallazgo (PATCH /issues/{id}). El backend valida los datos.',
  ),
  escritura(
    'issue.transition',
    'POST /issues/{id}/transition',
    'Cambia el estado de un hallazgo (POST /issues/{id}/transition). El backend valida la transición.',
  ),

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
];
