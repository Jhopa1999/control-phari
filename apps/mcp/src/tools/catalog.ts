/**
 * Tools de catálogo del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - catalog.list   -> GET   /catalog-items
 *   - catalog.get    -> GET   /catalog-items/{id}
 *   - catalog.create -> POST  /catalog-items
 *   - catalog.update -> PATCH /catalog-items/{id}
 *
 * Capa fina: los parámetros de ruta/query se reflejan con zod; el cuerpo se
 * delega al backend (el MCP no valida dominio) y se castea al DTO del contrato.
 * La validación real la hace apps/api.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreateCatalogItemDto = components['schemas']['CreateCatalogItemDto'];
type UpdateCatalogItemDto = components['schemas']['UpdateCatalogItemDto'];

/** Cuerpo delegado al backend: el MCP no valida dominio, solo lo transporta. */
const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools de catálogo en el server. */
export function registerCatalogTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'catalog.list',
    {
      description:
        'Lista elementos de catálogo (GET /catalog-items), con filtros ' +
        'opcionales por estado activo y por maestra.',
      inputSchema: {
        active: z.boolean().optional(),
        catalog: z.string().optional(),
      },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.GET('/catalog-items', {
          params: { query: { active: args.active, catalog: args.catalog } },
        }),
      ),
  );

  server.registerTool(
    'catalog.get',
    {
      description: 'Obtiene un elemento de catálogo por id (GET /catalog-items/{id}).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/catalog-items/{id}', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'catalog.create',
    {
      description:
        'Crea un elemento de catálogo (POST /catalog-items). El cuerpo debe ' +
        'cumplir CreateCatalogItemDto; el backend valida los datos.',
      inputSchema: { body: bodySchema },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.POST('/catalog-items', {
          body: args.body as CreateCatalogItemDto,
        }),
      ),
  );

  server.registerTool(
    'catalog.update',
    {
      description:
        'Actualiza un elemento de catálogo (PATCH /catalog-items/{id}). El ' +
        'cuerpo debe cumplir UpdateCatalogItemDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/catalog-items/{id}', {
            params: { path: { id: args.id } },
            body: args.body as UpdateCatalogItemDto,
          }),
        { resourceId: args.id },
      ),
  );
}
