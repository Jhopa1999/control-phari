import {
  api,
  type AiAgentConfig,
  type AiConfig,
  type AiConnectionTest,
  type AiGlobalConfig,
  type UpdateAiAgentConfig,
  type UpdateAiGlobalConfig,
} from './api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Capa de consumo de la administracion de IA (rol ADMIN): configuracion global,
 * agentes por code y prueba de conexion con Bedrock. Solo usa el cliente tipado
 * del contrato OpenAPI; apps/web NO toca Prisma ni la BD. Mismo criterio que
 * lib/smtp-config.ts: el secret es write-only y nunca vuelve del backend.
 */

/**
 * Estado de la IA (GET /admin/ai/config): global + agentes + catalogo de modelos
 * permitidos. Nunca trae secretos (solo secretSet y accessKeyIdLast4).
 */
export async function getAiConfig(): Promise<AiConfig> {
  try {
    const { data, error, response } = await api.GET('/admin/ai/config');
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Guarda la configuracion global de IA (PATCH /admin/ai/config). */
export async function updateAiConfig(
  input: UpdateAiGlobalConfig,
): Promise<AiGlobalConfig> {
  try {
    const { data, error, response } = await api.PATCH('/admin/ai/config', {
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

/** Configuracion de un agente por code (GET /admin/ai/agents/{code}). */
export async function getAiAgent(code: string): Promise<AiAgentConfig> {
  try {
    const { data, error, response } = await api.GET('/admin/ai/agents/{code}', {
      params: { path: { code } },
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

/** Guarda un agente por code (PATCH /admin/ai/agents/{code}). */
export async function updateAiAgent(
  code: string,
  input: UpdateAiAgentConfig,
): Promise<AiAgentConfig> {
  try {
    const { data, error, response } = await api.PATCH('/admin/ai/agents/{code}', {
      params: { path: { code } },
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
 * Prueba de conexion de un agente (POST /admin/ai/agents/{code}/test). Devuelve
 * { ok, message }: un fallo de conexion con Bedrock se refleja en `ok:false` con
 * mensaje, NO como excepcion; solo los errores de transporte/HTTP (401/403/red)
 * lanzan ApiError. Mismo contrato que testSmtp.
 */
export async function testAiAgent(code: string): Promise<AiConnectionTest> {
  try {
    const { data, error, response } = await api.POST(
      '/admin/ai/agents/{code}/test',
      { params: { path: { code } } },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
