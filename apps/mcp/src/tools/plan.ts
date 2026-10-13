/**
 * Tools de planes y tareas del MCP, mapeadas 1:1 al contrato OpenAPI:
 *   - plan.get           -> GET   /requests/{requestId}/plan
 *   - plan.create        -> POST  /requests/{requestId}/plan
 *   - plan.export        -> GET   /requests/{requestId}/plan/export
 *   - plan.import        -> POST  /requests/{requestId}/plan/import
 *   - plan.submit        -> POST  /requests/{requestId}/plan/submit
 *   - plan.authorize     -> POST  /requests/{requestId}/plan/authorize
 *   - plan.return        -> POST  /requests/{requestId}/plan/return
 *   - plan.tasks.list    -> GET   /plans/{planId}/tasks
 *   - task.create        -> POST  /phases/{phaseId}/tasks
 *   - task.get           -> GET   /tasks/{id}
 *   - task.update        -> PATCH /tasks/{id}
 *   - task.status.update -> PATCH /tasks/{id}/status
 *   - task.accept        -> PATCH /tasks/{id}/accept
 *
 * Capa fina: parámetros de ruta reflejados con zod; cuerpo delegado al backend
 * y casteado al DTO del contrato.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type CreatePlanDto = components['schemas']['CreatePlanDto'];
type PlanDocumentDto = components['schemas']['PlanDocumentDto'];
type SubmitPlanDto = components['schemas']['SubmitPlanDto'];
type AuthorizePlanDto = components['schemas']['AuthorizePlanDto'];
type ReturnPlanDto = components['schemas']['ReturnPlanDto'];
type CreateTaskDto = components['schemas']['CreateTaskDto'];
type UpdateTaskDto = components['schemas']['UpdateTaskDto'];
type UpdateTaskStatusDto = components['schemas']['UpdateTaskStatusDto'];
type AcceptTaskDto = components['schemas']['AcceptTaskDto'];

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
    'plan.export',
    {
      description:
        'Exporta el plan de una solicitud a un documento JSON portable ' +
        '(GET /requests/{requestId}/plan/export, PlanDocumentDto). Solo lectura.',
      inputSchema: { requestId: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/requests/{requestId}/plan/export', {
            params: { path: { requestId: args.requestId } },
          }),
        { resourceId: args.requestId },
      ),
  );

  server.registerTool(
    'plan.import',
    {
      description:
        'Importa (reemplaza) el contenido del plan de una solicitud desde un ' +
        'documento (POST /requests/{requestId}/plan/import). Solo opera sobre ' +
        'planes en BORRADOR o DEVUELTO. El cuerpo debe cumplir PlanDocumentDto: ' +
        '{ kind: "control-phari-plan", formatVersion: "1.0", plan: {periodStart, ' +
        'periodEnd, commitmentDate, risks, mitigations}, phases: [{ order, name, ' +
        'startDate, endDate, deliverable, tasks: [{ ref, title, isMilestone, ' +
        'estimateHours, startDate, endDate, description, acceptanceCriteria, ' +
        'frameworkPhaseRequired, evidenceUrl }] }], dependencies: [{ dependentRef, ' +
        'predecessorRef }] }. El backend valida refs, ciclos e hitos.',
      inputSchema: { requestId: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{requestId}/plan/import', {
            params: { path: { requestId: args.requestId } },
            body: args.body as PlanDocumentDto,
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
    'plan.authorize',
    {
      description:
        'Autoriza el plan de una solicitud ' +
        '(POST /requests/{requestId}/plan/authorize). El plan pasa a AUTORIZADO y ' +
        'la solicitud a En ejecucion. El cuerpo (AuthorizePlanDto) es opcional. ' +
        'Requiere que el plan este en autorizacion y rol con permiso de review.',
      inputSchema: { requestId: z.string(), body: bodySchema.optional() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{requestId}/plan/authorize', {
            params: { path: { requestId: args.requestId } },
            body: args.body as AuthorizePlanDto,
          }),
        { resourceId: args.requestId },
      ),
  );

  server.registerTool(
    'plan.return',
    {
      description:
        'Devuelve el plan de una solicitud con un motivo ' +
        '(POST /requests/{requestId}/plan/return -> DEVUELTO). El cuerpo debe ' +
        'cumplir ReturnPlanDto { reason }; el backend valida los datos.',
      inputSchema: { requestId: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{requestId}/plan/return', {
            params: { path: { requestId: args.requestId } },
            body: args.body as ReturnPlanDto,
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
    'task.create',
    {
      description:
        'Crea una tarea en una fase (POST /phases/{phaseId}/tasks). El cuerpo ' +
        'debe cumplir CreateTaskDto { title (requerido), responsibleUserId, ' +
        'processId, startDate, endDate, estimateHours, isMilestone (hito => ' +
        'estimateHours 0), description, acceptanceCriteria, frameworkPhaseRequired, ' +
        'evidenceUrl }; el backend valida los datos.',
      inputSchema: { phaseId: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/phases/{phaseId}/tasks', {
            params: { path: { phaseId: args.phaseId } },
            body: args.body as CreateTaskDto,
          }),
        { resourceId: args.phaseId },
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
    'task.update',
    {
      description:
        'Edita la ficha de una tarea (PATCH /tasks/{id}). No cambia estado ni ' +
        'aceptacion. El cuerpo debe cumplir UpdateTaskDto (campos parciales de ' +
        'CreateTaskDto: title, responsibleUserId, processId, startDate, endDate, ' +
        'estimateHours, isMilestone, description, acceptanceCriteria, ' +
        'frameworkPhaseRequired, evidenceUrl); el backend valida los datos.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/tasks/{id}', {
            params: { path: { id: args.id } },
            body: args.body as UpdateTaskDto,
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

  server.registerTool(
    'task.accept',
    {
      description:
        'Acepta o retira la aceptacion de una tarea (PATCH /tasks/{id}/accept). ' +
        'Precondicion: la tarea debe estar TERMINADA. Rol JEFE_AREA/LIDER_PROCESO ' +
        '(capacidad plan). El cuerpo debe cumplir AcceptTaskDto { accepted: boolean } ' +
        '(true acepta; false retira la aceptacion); el backend valida los datos. ' +
        'La aceptacion es requisito del gate de predecesoras para iniciar las ' +
        'tareas dependientes.',
      inputSchema: { id: z.string(), body: bodySchema },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.PATCH('/tasks/{id}/accept', {
            params: { path: { id: args.id } },
            body: args.body as AcceptTaskDto,
          }),
        { resourceId: args.id },
      ),
  );
}
