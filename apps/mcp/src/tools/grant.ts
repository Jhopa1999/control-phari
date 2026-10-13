/**
 * Tools de concesiones (grants) del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - grant.list   -> GET    /grants
 *   - grant.create -> POST   /grants
 *   - grant.delete -> DELETE /grants/{id}
 *
 * Capa fina: parámetros de ruta/query reflejados con zod; cuerpo delegado al
 * backend y casteado al DTO del contrato.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreateGrantDto = components['schemas']['CreateGrantDto'];

const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools de concesiones en el server. */
export function registerGrantTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'grant.list',
    {
      description:
        'Lista concesiones (GET /grants), con filtros opcionales por estado ' +
        'activo, proceso y usuario.',
      inputSchema: {
        active: z.boolean().optional(),
        processId: z.string().optional(),
        userId: z.string().optional(),
      },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.GET('/grants', {
          params: {
            query: {
              active: args.active,
              processId: args.processId,
              userId: args.userId,
            },
          },
        }),
      ),
  );

  server.registerTool(
    'grant.create',
    {
      description:
        'Crea una concesión (POST /grants). El cuerpo debe cumplir ' +
        'CreateGrantDto; el backend valida los datos.',
      inputSchema: { body: bodySchema },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.POST('/grants', { body: args.body as CreateGrantDto }),
      ),
  );

  server.registerTool(
    'grant.delete',
    {
      description: 'Revoca una concesión por id (DELETE /grants/{id}).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.DELETE('/grants/{id}', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );
}
