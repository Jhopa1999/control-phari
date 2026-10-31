/** Tools de auditoría. */
import type { ToolSpec } from '../spec.js';

export const AUDIT_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'audit.events.list',
    operation: 'GET /audit-events',
    access: 'read',
    description:
      'Lista eventos de auditoría (GET /audit-events), paginados. objectType ' +
      'filtra por tipo de objeto, action por verbo de la mutación; page ' +
      '(desde 1) y pageSize (1..100) paginan el resultado.',
  },
];
