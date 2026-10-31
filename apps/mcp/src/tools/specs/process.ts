/** Tools de procesos. */
import type { ToolSpec } from '../spec.js';

export const PROCESS_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'process.list',
    operation: 'GET /processes',
    access: 'read',
    description:
      'Lista procesos (GET /processes), con filtros opcionales por tipo ' +
      '(kind) y estado activo.',
  },
  {
    name: 'process.get',
    operation: 'GET /processes/{id}',
    access: 'read',
    description: 'Obtiene un proceso por id (GET /processes/{id}).',
  },
  {
    name: 'process.create',
    operation: 'POST /processes',
    access: 'write',
    description:
      'Crea un proceso (POST /processes). El cuerpo debe cumplir ' +
      'CreateProcessDto; el backend valida los datos.',
  },
  {
    name: 'process.update',
    operation: 'PATCH /processes/{id}',
    access: 'write',
    description:
      'Actualiza un proceso (PATCH /processes/{id}). El cuerpo debe cumplir ' +
      'UpdateProcessDto; el backend valida los datos.',
  },
];
