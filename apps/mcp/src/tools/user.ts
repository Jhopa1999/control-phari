/**
 * Tools de usuarios del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - user.list   -> GET   /users
 *   - user.get    -> GET   /users/{id}
 *   - user.create -> POST  /users
 *   - user.update -> PATCH /users/{id}
 *
 * Capa fina: parámetros de ruta reflejados con zod; cuerpo delegado al backend
 * y casteado al DTO del contrato.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreateUserDto = components['schemas']['CreateUserDto'];
type UpdateUserDto = components['schemas']['UpdateUserDto'];

const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools de usuarios en el server. */
export function registerUserTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'user.list',
    {
      description: 'Lista los usuarios (GET /users).',
      inputSchema: {},
    },
    async () => runApiTool(api, () => api.client.GET('/users')),
  );

  server.registerTool(
    'user.get',
    {
      description: 'Obtiene un usuario por id (GET /users/{id}).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/users/{id}', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'user.create',
    {
      description:
        'Crea un usuario (POST /users). El cuerpo debe cumplir CreateUserDto; ' +
        'el backend valida los datos.',
      inputSchema: { body: bodySchema },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.POST('/users', { body: args.body as CreateUserDto }),
      ),
  );

  server.registerTool(
    'user.update',
    {
      description:
        'Actualiza un usuario (PATCH /users/{id}). El cuerpo debe cumplir ' +
        'UpdateUserDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/users/{id}', {
            params: { path: { id: args.id } },
            body: args.body as UpdateUserDto,
          }),
        { resourceId: args.id },
      ),
  );
}
