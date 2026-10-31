/**
 * Tools con comportamiento propio que el motor genérico no cubre. Se mantienen
 * a mano, pero declaran su `ToolSpec` (operación, acceso, descripción) para que
 * el guard de cobertura las trate igual que al resto del catálogo:
 *   - health.check: ruta PÚBLICA; no dispara login ni re-login.
 *   - dev.actors.list: mensaje neutro ante 404 (solo existe en dev-header).
 */
import type { McpContext } from '../server.js';
import { okJson } from './shared.js';
import { toMcpError, exceptionToMcpError } from '../errors.js';
import { callWithRelogin } from '../api.js';
import { deriveAnnotations, parseOperation } from './spec.js';
import type { ToolSpec } from './spec.js';

export const HEALTH_CHECK_SPEC: ToolSpec = {
  name: 'health.check',
  operation: 'GET /health',
  access: 'read',
  description:
    'Verifica el estado del backend (GET /health). Ruta pública: no envía ' +
    'cabecera de identidad ni dispara login.',
};

export const DEV_ACTORS_LIST_SPEC: ToolSpec = {
  name: 'dev.actors.list',
  operation: 'GET /dev/actors',
  access: 'read',
  description:
    'Lista los actores de desarrollo (GET /dev/actors). Solo está disponible ' +
    'cuando el backend corre en modo dev-header.',
};

/** Specs de las tools manuales (para el guard de cobertura). */
export const MANUAL_SPECS: ReadonlyArray<ToolSpec> = [
  HEALTH_CHECK_SPEC,
  DEV_ACTORS_LIST_SPEC,
];

/** Registra las tools manuales en el server. */
export function registerManualTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    HEALTH_CHECK_SPEC.name,
    {
      description: HEALTH_CHECK_SPEC.description,
      inputSchema: {},
      annotations: deriveAnnotations(
        HEALTH_CHECK_SPEC.access,
        parseOperation(HEALTH_CHECK_SPEC.operation).method,
      ),
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
    DEV_ACTORS_LIST_SPEC.name,
    {
      description: DEV_ACTORS_LIST_SPEC.description,
      inputSchema: {},
      annotations: deriveAnnotations(
        DEV_ACTORS_LIST_SPEC.access,
        parseOperation(DEV_ACTORS_LIST_SPEC.operation).method,
      ),
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
