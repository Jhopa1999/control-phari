import { api } from './api-client';

/**
 * Longitud mínima vigente de la contraseña (GET /auth/password-policy, pública).
 * Devuelve `null` si la llamada falla: la web no valida la longitud y decide el servidor.
 */
export async function getPasswordPolicy(): Promise<number | null> {
  try {
    const { data } = await api.GET('/auth/password-policy');
    return typeof data?.minLength === 'number' ? data.minLength : null;
  } catch {
    return null;
  }
}