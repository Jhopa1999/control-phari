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
 * El cuerpo ya viene tipado del contrato (LoginRequestDto): no hay casts ni tipos
 * manuales de la peticion.
 */
export async function login(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  try {
    const { data, error, response } = await api.POST('/auth/login', {
      body: credentials,
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
