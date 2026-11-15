import { HttpException, HttpStatus } from '@nestjs/common';

/** Texto legible del tiempo de espera, p. ej. «3 minutos» o «menos de un minuto». */
export function waitLabel(seconds: number): string {
  if (seconds < 60) return 'menos de un minuto';
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

/**
 * 429 del login. Lleva `retryAfterSeconds` para que el controller emita la
 * cabecera `Retry-After`. El mensaje es genérico: no revela si el usuario existe.
 */
export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Demasiados intentos fallidos. Inténtalo de nuevo en ${waitLabel(retryAfterSeconds)}.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
