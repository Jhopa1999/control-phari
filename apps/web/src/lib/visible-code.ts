/**
 * Código visible completo que acepta el filtro «Código del objeto» de
 * Auditoría: solicitud (PRY-0012), fase (PRY-0012-F2), tarea (PRY-0012-T07),
 * activo (ACT-0007) o documento (DOC-0003). Misma forma que valida el servidor.
 * Módulo sin dependencias para poder probarlo sin navegador (e2e/web-lib.spec.ts).
 */
export const AUDIT_OBJECT_CODE_PATTERN = /^(?:PRY-\d{4,}(?:-(?:F\d+|T\d+))?|ACT-\d{4,}|DOC-\d{4,})$/;

/** True si el texto (ya sin espacios) es un código completo válido. */
export function isAuditObjectCode(value: string): boolean {
  return AUDIT_OBJECT_CODE_PATTERN.test(value.trim());
}