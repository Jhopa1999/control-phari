/**
 * Tools de planes y tareas del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - plan.get           -> GET   /requests/{requestId}/plan
 *   - plan.create        -> POST  /requests/{requestId}/plan
 *   - plan.submit        -> POST  /requests/{requestId}/plan/submit
 *   - plan.tasks.list    -> GET   /plans/{planId}/tasks
 *   - task.get           -> GET   /tasks/{id}
 *   - task.status.update -> PATCH /tasks/{id}/status
 *
 * Capa fina: parámetros de ruta reflejados con zod; cuerpo delegado al backend
 * y casteado al DTO del contrato.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreatePlanDto = components['schemas']['CreatePlanDto'];
type SubmitPlanDto = components['schemas']['SubmitPlanDto'];
type UpdateTaskStatusDto = components['schemas']['UpdateTaskStatusDto'];

const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools de planes y tareas en el server. */
export function registerPlanTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'plan.get',
    {
      description:
        'Obtiene el plan de una solicitud (GET /requests/{requestId}/plan).',
      inputSchema: { requestId: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/requests/{requestId}/plan', {
            params: { path: { requestId: args.requestId } },
          }),
        { resourceId: args.requestId },
      ),
  );

  server.registerTool(
    'plan.create',
    {
      description:
        'Crea el plan de una solicitud (POST /requests/{requestId}/plan). El ' +
        'cuerpo debe cumplir CreatePlanDto; el backend valida los datos.',
      inputSchema: { requestId: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{requestId}/plan', {
            params: { path: { requestId: args.requestId } },
            body: args.body as CreatePlanDto,
          }),
        { resourceId: args.requestId },
      ),
  );

  server.registerTool(
    'plan.submit',
    {
      description:
        'Envía el plan de una solicitud a autorización ' +
        '(POST /requests/{requestId}/plan/submit). El cuerpo (SubmitPlanDto) es ' +
        'opcional; el backend valida los datos.',
      inputSchema: { requestId: z.string(), body: bodySchema.optional() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{requestId}/plan/submit', {
            params: { path: { requestId: args.requestId } },
            body: args.body as SubmitPlanDto,
          }),
        { resourceId: args.requestId },
      ),
  );

  server.registerTool(
    'plan.tasks.list',
    {
      description: 'Lista las tareas de un plan (GET /plans/{planId}/tasks).',
      inputSchema: { planId: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/plans/{planId}/tasks', {
            params: { path: { planId: args.planId } },
          }),
        { resourceId: args.planId },
      ),
  );

  server.registerTool(
    'task.get',
    {
      description: 'Obtiene una tarea por id (GET /tasks/{id}).',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/tasks/{id}', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'task.status.update',
    {
      description:
        'Actualiza el estado de una tarea (PATCH /tasks/{id}/status). El cuerpo ' +
        'debe cumplir UpdateTaskStatusDto; el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/tasks/{id}/status', {
            params: { path: { id: args.id } },
            body: args.body as UpdateTaskStatusDto,
          }),
        { resourceId: args.id },
      ),
  );
}
