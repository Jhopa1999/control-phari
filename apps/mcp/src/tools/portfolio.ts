/**
 * Tool de portafolio del MCP, mapeada 1:1 al contrato OpenAPI:
 *   - portfolio.get -> GET /portfolio
 *
 * Capa fina: parámetros de query reflejados con zod. La salida se serializa como
 * JSON.
 */
import { z } from 'zod';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

/** Registra la tool de portafolio en el server. */
export function registerPortfolioTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'portfolio.get',
    {
      description:
        'Obtiene la vista de portafolio (GET /portfolio), con filtros opcionales ' +
        'por banda, estado y proceso principal.',
      inputSchema: {
        band: z.string().optional(),
        state: z.string().optional(),
        mainProcessId: z.string().optional(),
      },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.GET('/portfolio', {
          params: {
            query: {
              band: args.band,
              state: args.state,
              mainProcessId: args.mainProcessId,
            },
          },
        }),
      ),
  );
}
