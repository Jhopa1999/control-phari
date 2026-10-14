import { api } from './api-client';
import type { LoginResponse } from './api-client';
import type { components } from '@plantilla-portales/api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Cuerpos de las peticiones derivados del contrato OpenAPI generado.
 * No se declaran interfaces manuales: la fuente es packages/api-client.
 */
export type ForgotPasswordInput = components['schemas']['ForgotPasswordDto'];
export type ResetPasswordInput = components['schemas']['ResetPasswordDto'];

/**
 * Solicita el reestablecimiento de contrasena (POST /auth/forgot-password).
 *
 * El backend responde 204 sin cuerpo, exista o no el usuario (no revela
 * existencia). Por eso el exito es la ausencia de `error`: no se exige `data`.
 * La UI muestra SIEMPRE un mensaje generico, independientemente del resultado.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<void> {
  try {
    const { error, response } = await api.POST('/auth/forgot-password', {
      body: input,
    });
    if (error) {
      throw toApiError(response.status);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/**
 * Define una nueva contrasena consumiendo un token (POST /auth/reset-password).
 * El mismo endpoint sirve para el reset de contrasena y para la activacion de
 * cuenta (el backend acepta ambos propositos de token).
 *
 * En exito el backend responde 200 con la MISMA sesion que el login
 * (`LoginResponse`: { accessToken, expiresIn, user }), de modo que el llamador
 * puede iniciar sesion directamente. Por eso el exito exige `data` (ausencia de
 * `error` y cuerpo presente), a diferencia de forgot-password. Los codigos de
 * fallo se traducen a mensajes de negocio en el componente: 400 (token invalido
 * o contrasena corta) y 410 (token caducado o ya usado) se diferencian por el
 * `ApiError.status`. `response?.status` es opcional porque un fallo de red deja
 * `response` indefinido y debe degradar al mensaje generico sin lanzar.
 */
export async function setPasswordWithToken(
  input: ResetPasswordInput,
): Promise<LoginResponse> {
  try {
    const { data, error, response } = await api.POST('/auth/reset-password', {
      body: input,
    });
    if (error || !data) {
      throw toApiError(response?.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
