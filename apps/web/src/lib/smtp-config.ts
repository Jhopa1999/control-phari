import {
  api,
  type AdminUser,
  type SmtpConfig,
  type SmtpTestResult,
  type UpdateSmtpConfig,
} from './api-client';
import { ApiError, toApiError } from './api-error';
export { ApiError };
/**
 * Capa de consumo de la administracion de sistema (rol ADMIN): configuracion
 * SMTP en runtime y gestion de administradores. Solo usa el cliente tipado del
 * contrato OpenAPI; apps/web NO toca Prisma ni la BD.
 */
/** Estado de la configuracion SMTP (GET /admin/smtp-config). Nunca trae password. */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  try {
    const { data, error, response } = await api.GET('/admin/smtp-config');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
/** Guarda la configuracion SMTP (PATCH /admin/smtp-config). */
export async function updateSmtpConfig(
  input: UpdateSmtpConfig,
): Promise<SmtpConfig> {
  try {
    const { data, error, response } = await api.PATCH('/admin/smtp-config', {
      body: input,
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
/**
 * Prueba de envio (POST /admin/smtp-config/test). Devuelve { ok, message }: un
 * fallo de SMTP se refleja en `ok:false` con mensaje, NO como excepcion; solo
 * los errores de transporte/HTTP (401/403/red) lanzan ApiError.
 */
export async function testSmtp(to: string): Promise<SmtpTestResult> {
  try {
    const { data, error, response } = await api.POST('/admin/smtp-config/test', {
      body: { to },
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
/** Lista usuarios con su flag isAdmin (GET /admin/users). Solo ADMIN. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  try {
    const { data, error, response } = await api.GET('/admin/users');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
/**
 * Promueve/degrada a un usuario como ADMIN (PATCH /admin/users/{id}/admin-flag).
 * Responde 200 sin body: el exito es la ausencia de `error`.
 */
export async function setAdminFlag(id: string, isAdmin: boolean): Promise<void> {
  try {
    const { error, response } = await api.PATCH('/admin/users/{id}/admin-flag', {
      params: { path: { id } },
      body: { isAdmin },
    });
    if (error) {
      throw toApiError(response.status);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
