/**
 * Textos de espera del bloqueo por intentos (429). Módulo puro, sin alias `@/`,
 * para que e2e/web-lib.spec.ts lo cargue en Node.
 */

/** «N minutos», «1 minuto» o «menos de un minuto»; sin dato, «unos minutos». */
export function waitLabel(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return 'unos minutos';
  }
  if (seconds < 60) return 'menos de un minuto';
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

/** Cuenta regresiva «m:ss» para el botón bloqueado. */
export function countdownLabel(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
