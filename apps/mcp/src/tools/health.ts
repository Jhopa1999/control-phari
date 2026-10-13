/**
 * Tools de salud e identidad del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - health.check     -> GET /health          (ruta PÚBLICA, sin identidad)
 *   - me.permissions   -> GET /me/permissions  (usa la identidad del modo)
 *   - dev.actors.list  -> GET /dev/actors       (solo útil en backend dev-header)
 *
 * Capa fina: sin lógica de negocio ni validación de dominio. Tipos derivados del
 * contrato; la salida se serializa como JSON.
 */
import type { McpContext } from '../server.js';
import { okJson, runApiTool } from './shared.js';
import { toMcpError, exceptionToMcpError } from '../errors.js';
import { callWithRelogin } from '../api.js';

/** Registra las tools de salud e identidad en el server. */
export function registerHealthTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'health.check',
    {
      description:
        'Verifica el estado del backend (GET /health). Ruta pública: no envía ' +
        'cabecera de identidad ni dispara login.',
      inputSchema: {},
    },
    async () => {
      // Ruta pública: aunque el middleware de identidad inyecte la cabecera, el
      // backend no la exige aquí; nunca dispara login (no hay 401 esperado).
      try {
        const result = await api.client.GET('/health');
        const error = toMcpError(result);
        if (error) {
          return error;
        }
        return okJson(result.data);
      } catch (error: unknown) {
        return exceptionToMcpError(error);
      }
    },
  );

  server.registerTool(
    'me.permissions',
    {
      description:
        'Devuelve los permisos del actor actual (GET /me/permissions). Usa la ' +
        'identidad del modo configurado; en jwt vía login puede disparar el ' +
        'login perezoso.',
      inputSchema: {},
    },
    async () =>
      runApiTool(api, () => api.client.GET('/me/permissions')),
  );

  server.registerTool(
    'dev.actors.list',
    {
      description:
        'Lista los actores de desarrollo (GET /dev/actors). Solo está disponible ' +
        'cuando el backend corre en modo dev-header.',
      inputSchema: {},
    },
    async () => {
      // Mensaje neutro ante 404: la ruta solo existe en backend dev-header.
      try {
        const result = await callWithRelogin(api, () =>
          api.client.GET('/dev/actors'),
        );
        if (result.response.status === 404) {
          return {
            content: [
              {
                type: 'text',
                text:
                  'Recurso no encontrado (/dev/actors solo está disponible ' +
                  'cuando el backend corre en modo dev-header).',
              },
            ],
            isError: true,
          };
        }
        const error = toMcpError(result);
        if (error) {
          return error;
        }
        return okJson(result.data);
      } catch (error: unknown) {
        return exceptionToMcpError(error);
      }
    },
  );
}
