/** Tools de concesiones (grants). */
import type { ToolSpec } from '../spec.js';

export const GRANT_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'grant.list',
    operation: 'GET /grants',
    access: 'read',
    description:
      'Lista concesiones (GET /grants), con filtros opcionales por estado ' +
      'activo, proceso y usuario.',
  },
  {
    name: 'grant.create',
    operation: 'POST /grants',
    access: 'write',
    description:
      'Crea una concesión (POST /grants). El cuerpo debe cumplir ' +
      'CreateGrantDto; el backend valida los datos.',
  },
  {
    name: 'grant.delete',
    operation: 'DELETE /grants/{id}',
    access: 'destructive',
    description: 'Revoca una concesión por id (DELETE /grants/{id}).',
  },
];
