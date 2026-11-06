/**
 * Motivo de bloqueo de una tarea. Obligatorio en la interfaz y opcional en la API
 * (decisión de producto). Módulo puro.
 */
export const BLOCK_REASON_MAX = 500;
/** A partir de aquí el contador avisa. */
export const BLOCK_REASON_WARN_AT = 450;

export const BLOCK_REASON_REQUIRED_MESSAGE = 'Escribe el motivo del bloqueo.';

/** Motivo recortado, o el mensaje de error si queda vacío o supera el límite. */
export function validateBlockReason(
  raw: string,
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = raw.trim();
  if (reason === '') return { ok: false, error: BLOCK_REASON_REQUIRED_MESSAGE };
  if (reason.length > BLOCK_REASON_MAX) {
    return { ok: false, error: `El motivo admite hasta ${BLOCK_REASON_MAX} caracteres.` };
  }
  return { ok: true, reason };
}
