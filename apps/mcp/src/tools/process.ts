/**
 * Tools de procesos del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - process.list   -> GET   /processes
 *   - process.get    -> GET   /processes/{id}
 *   - process.create -> POST  /processes
 *   - process.update -> PATCH /processes/{id}
 *
 * Capa fina: parámetros de ruta/query reflejados con zod; cuerpo delegado al
 * backend y casteado al DTO del contrato.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreateProcessDto = components['schemas']['CreateProcessDto'];
type UpdateProcessDto = components['schemas']['UpdateProcessDto'];

const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools de procesos en el server. */
export function registerProcessTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'process.list',
    {
      description:
        'Lista procesos (GET /processes), con filtros opcionales por tipo ' +
        '(kind) y estado activo.',
      inputSchema: {
        kind: z.enum(['PROCESS', 'COORDINATION']).optional(),
        active: z.boolean().optional(),
      },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.GET('/processes', {
          params: { query: { kind: args.kind, active: args.active } },
        }),
      ),
  );

  server.registerTool(
    'process.get',
    {
      description: 'Obtiene un proceso por id (GET /processes/{id}).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/processes/{id}', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'process.create',
    {
      description:
        'Crea un proceso (POST /processes). El cuerpo debe cumplir ' +
        'CreateProcessDto; el backend valida los datos.',
      inputSchema: { body: bodySchema },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.POST('/processes', {
          body: args.body as CreateProcessDto,
        }),
      ),
  );

  server.registerTool(
    'process.update',
    {
      description:
        'Actualiza un proceso (PATCH /processes/{id}). El cuerpo debe cumplir ' +
        'UpdateProcessDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/processes/{id}', {
            params: { path: { id: args.id } },
            body: args.body as UpdateProcessDto,
          }),
        { resourceId: args.id },
      ),
  );
}
