/** Tools de auditoría. */
import type { ToolSpec } from '../spec.js';

export const AUDIT_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'audit.events.list',
    operation: 'GET /audit-events',
    access: 'read',
    description:
      'Lista eventos de auditoría (GET /audit-events), paginados. objectType ' +
      'filtra por tipo de objeto, action por verbo (CREATE, UPDATE, DELETE, ' +
      'REVOKE, LOGIN_FAILED para fallos de inicio de sesión y ' +
      'PASSWORD_RESET_THROTTLED para solicitudes de contraseña bloqueadas por ' +
      'límite; PASSWORD_CHANGE_REQUIRED, PASSWORD_CHANGE_CLEARED y ' +
      'PASSWORD_CHANGED para la exigencia, el retiro y el cambio de contraseña); page ' +
      '(desde 1) y pageSize (1..100) paginan el resultado. objectCode filtra por ' +
      'el código visible del objeto (PRY-0012, PRY-0012-F2, PRY-0012-T07, ' +
      'ACT-0007, DOC-0003); un código inexistente devuelve la lista vacía. Cada ' +
      'evento trae objectCode y objectLabel (código y nombre del objeto; nulos ' +
      'si no aplica o ya no existe).',
  },
];
