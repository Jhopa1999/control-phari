/**
 * Error de dominio con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 * Reutilizable por los wrappers tipados (me, team, audit, dev-actors), con el
 * mismo criterio que lib/catalog.ts.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Traduce un codigo HTTP a un mensaje de negocio entendible, sin exponer
 * detalles internos. 403/404 se comunican como falta de acceso o inexistencia
 * sin revelar datos (design 5.5).
 */
export function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 401:
      return 'No hay un usuario actual. Selecciona un usuario para continuar.';
    case 403:
      return 'No tienes acceso a esta accion.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'Ya existe un registro con esos datos.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/**
 * Normaliza cualquier fallo (HTTP o de red) a un ApiError entendible.
 */
export function toApiError(status: number | undefined): ApiError {
  if (status === undefined) {
    return new ApiError('No fue posible comunicarse con el servidor.');
  }
  return new ApiError(messageForStatus(status), status);
}
