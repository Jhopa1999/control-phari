/**
 * Tools de gobierno (ciclo de control GC1-GC5) del MCP, mapeadas 1:1 al
 * contrato OpenAPI:
 *   - governance.gates.get             -> GET  /requests/{id}/gates
 *   - governance.gc4.request-validation-> POST /requests/{id}/gates/GC4/request-validation
 *   - governance.gc4.mark-ready        -> POST /requests/{id}/gates/GC4/mark-ready
 *   - governance.gc5.confirm-stabilization -> POST /requests/{id}/gates/GC5/confirm-stabilization
 *   - governance.gate.approve          -> POST /requests/{id}/gates/{gateCode}/approve
 *
 * Capa fina: parámetros de ruta reflejados con zod; cuerpo delegado al backend
 * y casteado al DTO del contrato. Mutaciones: capacidad review (JEFE_AREA/
 * LIDER_PROCESO). La secuencia de cierre es:
 *   EN_EJECUCION -(request-validation)-> EN_VALIDACION -(mark-ready)->
 *   LISTA_PARA_LIBERAR -(GC4 approve)-> EN_ESTABILIZACION
 *   -(confirm-stabilization)-> OPERATIVA -(GC5 approve)-> CERRADA.
 */
import { z } from 'zod';
import type { components } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

type AdvanceStageDto = components['schemas']['AdvanceStageDto'];
type ApproveGateDto = components['schemas']['ApproveGateDto'];

const bodySchema = z.record(z.string(), z.unknown());

/** Registra las tools del ciclo de gobierno en el server. */
export function registerGovernanceTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'governance.gates.get',
    {
      description:
        'Obtiene el tablero de los 5 gates GC1-GC5 de una solicitud ' +
        '(GET /requests/{id}/gates), con estado derivado, pendientes y resumen ' +
        'de validaciones de GC4. Solo lectura.',
      inputSchema: { id: z.string() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.GET('/requests/{id}/gates', {
            params: { path: { id: args.id } },
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'governance.gc4.request-validation',
    {
      description:
        'Preparacion GC4: mueve la solicitud de EN_EJECUCION a EN_VALIDACION ' +
        '(POST /requests/{id}/gates/GC4/request-validation). Rol JEFE_AREA/' +
        'LIDER_PROCESO. El cuerpo (AdvanceStageDto { note? }) es opcional. ' +
        '409 si el estado actual no es EN_EJECUCION.',
      inputSchema: { id: z.string(), body: bodySchema.optional() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/gates/GC4/request-validation', {
            params: { path: { id: args.id } },
            body: (args.body ?? {}) as AdvanceStageDto,
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'governance.gc4.mark-ready',
    {
      description:
        'Preparacion GC4: mueve la solicitud de EN_VALIDACION a ' +
        'LISTA_PARA_LIBERAR (POST /requests/{id}/gates/GC4/mark-ready). ' +
        'Recomputa §1.5: no debe haber validaciones bloqueantes sin resolver y, ' +
        'segun la ruta (COMPLETA/SIMPLIFICADA), exige una validacion ' +
        'funcional/aceptacion aprobatoria. Rol JEFE_AREA/LIDER_PROCESO. El ' +
        'cuerpo (AdvanceStageDto { note? }) es opcional. 409 si falta algo o el ' +
        'estado no es EN_VALIDACION.',
      inputSchema: { id: z.string(), body: bodySchema.optional() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/gates/GC4/mark-ready', {
            params: { path: { id: args.id } },
            body: (args.body ?? {}) as AdvanceStageDto,
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'governance.gc5.confirm-stabilization',
    {
      description:
        'Preparacion GC5: mueve la solicitud de EN_ESTABILIZACION a OPERATIVA ' +
        '(POST /requests/{id}/gates/GC5/confirm-stabilization). Rol JEFE_AREA/' +
        'LIDER_PROCESO. El cuerpo (AdvanceStageDto { note? }) es opcional. ' +
        '409 si el estado actual no es EN_ESTABILIZACION.',
      inputSchema: { id: z.string(), body: bodySchema.optional() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/gates/GC5/confirm-stabilization', {
            params: { path: { id: args.id } },
            body: (args.body ?? {}) as AdvanceStageDto,
          }),
        { resourceId: args.id },
      ),
  );

  server.registerTool(
    'governance.gate.approve',
    {
      description:
        'Aprueba un gate por la autoridad (POST /requests/{id}/gates/{gateCode}/' +
        'approve). Solo GC4 y GC5 mueven el estado (GC1-GC3 => 409): GC4 ' +
        'LISTA_PARA_LIBERAR -> EN_ESTABILIZACION; GC5 OPERATIVA -> CERRADA. GC4 ' +
        'recomputa la aprobabilidad §1.5 (409 si bloqueado). Rol JEFE_AREA/' +
        'LIDER_PROCESO. gateCode es "GC4" o "GC5". El cuerpo (ApproveGateDto ' +
        '{ authorityNote? }) es opcional.',
      inputSchema: { id: z.string(), gateCode: z.string(), body: bodySchema.optional() },
    },
    async (args) =>
      runApiTool(
        api,
        () =>
          api.client.POST('/requests/{id}/gates/{gateCode}/approve', {
            params: { path: { id: args.id, gateCode: args.gateCode } },
            body: (args.body ?? {}) as ApproveGateDto,
          }),
        { resourceId: args.id },
      ),
  );
}
