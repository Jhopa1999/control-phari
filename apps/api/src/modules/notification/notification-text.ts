/**
 * Textos de notificaciones y correos con ID visible (PRY-0012, PRY-0012-T07).
 * Funciones puras: el código va SIEMPRE al principio de la referencia y la
 * referencia se coloca antes de cualquier texto libre del usuario, así un
 * recorte por longitud nunca elimina el código.
 */

/** Topes de la tabla `notifications` (title 255, message 1000). */
export const NOTIFICATION_MAX_TITLE = 255;
export const NOTIFICATION_MAX_MESSAGE = 1000;

/** Referencia legible a una solicitud o tarea: `PRY-0012 «Título»`. */
export function entityRef(code: string | null | undefined, title: string): string {
  return code ? `${code} «${title}»` : `«${title}»`;
}

/** Sufijo para títulos cortos: `Plan devuelto · PRY-0012`. */
export function withCode(text: string, code: string | null | undefined): string {
  return code ? `${text} · ${code}` : text;
}

/**
 * Recorta `text` a `max` caracteres sin partir palabras: corta en el último
 * espacio y añade «…» (el total nunca supera `max`). Si no hay espacios usa un
 * corte duro.
 */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const limit = Math.max(max - 1, 0);
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  // Evita quedarse con una palabra suelta al principio si el espacio está muy atrás.
  const cut = lastSpace >= Math.floor(limit * 0.5) ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}
