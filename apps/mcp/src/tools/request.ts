/**
 * Tools de solicitudes (requests) del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - request.list            -> GET   /requests
 *   - request.get             -> GET   /requests/{id}
 *   - request.create          -> POST  /requests
 *   - request.update          -> PATCH /requests/{id}
 *   - request.triage.get      -> GET   /requests/{id}/triage
 *   - request.triage.create   -> POST  /requests/{id}/triage
 *   - request.priority.create -> POST  /requests/{id}/priority
 *   - request.approval.get    -> GET   /requests/{id}/approval
 *   - request.approval.create -> POST  /requests/{id}/approval
 *
 * Capa fina: parámetros de ruta/query reflejados con zod; cuerpo delegado al
 * backend y casteado al DTO del contrato.
 */
import { z } from 'zod';
import type { components, paths } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreateRequestDto = components['schemas']['CreateRequestDto'];
type UpdateRequestDto = components['schemas']['UpdateRequestDto'];
type CreateTriageDto = components['schemas']['CreateTriageDto'];
type CreatePriorityEvaluationDto =
  components['schemas']['CreatePriorityEvaluationDto'];
type CreateApprovalDto = components['schemas']['CreateApprovalDto'];

type RequestListQuery = NonNullable<paths['/requests']['get']['parameters']['query']>;

const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools de solicitudes en el server. */
export function registerRequestTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'request.list',
    {
      description:
        'Lista solicitudes (GET /requests), con filtros opcionales por proceso ' +
        'principal y estado.',
      inputSchema: {
        mainProcessId: z.string().optional(),
        state: z.string().optional(),
      },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.GET('/requests', {
          params: {
            query: {
              mainProcessId: args.mainProcessId,
              state: args.state as RequestListQuery['state'],
            },
          },
        }),
      ),
  );

  server.registerTool(
    'request.get',
    {
      description: 'Obtiene una solicitud por id (GET /requests/{id}).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/requests/{id}', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'request.create',
    {
      description:
        'Crea una solicitud (POST /requests). El cuerpo debe cumplir ' +
        'CreateRequestDto; el backend valida los datos.',
      inputSchema: { body: bodySchema },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.POST('/requests', { body: args.body as CreateRequestDto }),
      ),
  );

  server.registerTool(
    'request.update',
    {
      description:
        'Actualiza una solicitud (PATCH /requests/{id}). El cuerpo debe cumplir ' +
        'UpdateRequestDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/requests/{id}', {
            params: { path: { id: args.id } },
            body: args.body as UpdateRequestDto,
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'request.triage.get',
    {
      description:
        'Obtiene el contexto de triage de una solicitud ' +
        '(GET /requests/{id}/triage, TriageContextResponseDto).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/requests/{id}/triage', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'request.triage.create',
    {
      description:
        'Registra el triage de una solicitud (POST /requests/{id}/triage). El ' +
        'cuerpo debe cumplir CreateTriageDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/triage', {
            params: { path: { id: args.id } },
            body: args.body as CreateTriageDto,
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'request.priority.create',
    {
      description:
        'Registra la evaluación de prioridad de una solicitud ' +
        '(POST /requests/{id}/priority). El cuerpo debe cumplir ' +
        'CreatePriorityEvaluationDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/priority', {
            params: { path: { id: args.id } },
            body: args.body as CreatePriorityEvaluationDto,
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'request.approval.get',
    {
      description:
        'Obtiene la aprobación de una solicitud (GET /requests/{id}/approval).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/requests/{id}/approval', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'request.approval.create',
    {
      description:
        'Registra la aprobación de una solicitud (POST /requests/{id}/approval). ' +
        'El cuerpo debe cumplir CreateApprovalDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/approval', {
            params: { path: { id: args.id } },
            body: args.body as CreateApprovalDto,
          }),
        { resourceId: args.id },
      ),
  );
}
