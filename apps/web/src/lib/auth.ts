import { api, type LoginResponse } from './api-client';
import { ApiError, toApiError } from './api-error';
export { ApiError };
export type { LoginResponse };
/**
 * Credenciales de login. Los nombres (identifier/password) corresponden al DTO
 * real del backend (LoginUserDto de entrada); NO es logica de negocio, solo la
 * forma del cuerpo de la peticion.
 */
export interface LoginCredentials {
  identifier: string;
  password: string;
}
/**
 * Autentica contra POST /auth/login reutilizando la respuesta tipada del
 * cliente (LoginResponseDto).
 *
 * Nota de contrato: el schema OpenAPI generado declara `requestBody?: never`
 * para esta operacion (laguna del contrato generado: el cuerpo
 * { identifier, password } no quedo tipado). Mientras no se regenere el
 * contrato (requiere el pipeline del backend, fuera de alcance de esta tarea),
 * el cuerpo se pasa con un unico cast localizado y comentado. No se duplica el
 * contrato a mano: la respuesta sigue siendo la tipada del cliente.
 */
export async function login(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  try {
    const { data, error, response } = await api.POST('/auth/login', {
      // Workaround por la laguna del contrato (requestBody?: never). Unico
      // punto con tipo forzado; evita `any` y queda acotado a esta llamada.
      body: credentials as never,
    });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
