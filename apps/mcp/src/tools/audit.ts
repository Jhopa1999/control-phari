/**
 * Tool de auditoría del MCP, mapeada 1:1 al contrato OpenAPI:
 *   - audit.events.list -> GET /audit-events
 *
 * Parámetros de query:
 *   - take: entero positivo acotado a 500. El contrato lo tipa como number sin
 *     límite; aquí se aplica una restricción LOCAL más estricta (el backend
 *     también acota a 500). Es una restricción de forma, no de dominio.
 *   - objectType: enum equivalente al del contrato OpenAPI (OBJECT_TYPES del
 *     DTO). La salvaguarda de abajo rompe el typecheck del MCP A PROPÓSITO si el
 *     contrato diverge; cuando eso ocurre, hay que actualizar este z.enum para
 *     volver a igualarlo (es justo lo que se hace aquí).
 */
import { z } from 'zod';
import type { paths } from '@plantilla-portales/api-client';
import type { McpContext } from '../server.js';
import { runApiTool } from './shared.js';

/**
 * Valores de objectType que admite esta tool. Debe coincidir EXACTAMENTE con el
 * enum del contrato OpenAPI (OBJECT_TYPES del DTO): la salvaguarda de abajo lo
 * garantiza en compilación.
 */
const OBJECT_TYPES = [
  'PROCESS',
  'AREA',
  'USER',
  'GRANT',
  'CATALOG_ITEM',
  'REQUEST',
  'TRIAGE',
  'PRIORITY_EVALUATION',
  'APPROVAL',
  'PLAN',
  'PLAN_PHASE',
  'TASK',
  'TASK_DEPENDENCY',
  'MONTHLY_AVAILABILITY',
  'ASSIGNMENT',
  'DAILY_LOG',
  'DAILY_LOG_ACTIVITY',
  'WEEKLY_REPORT',
  'ISSUE',
  'MEETING',
  'COMMITMENT',
  'ASSET',
  'DOCUMENT',
  'DOCUMENT_VERSION',
  'GATE_CHECK',
  'GATE_PENDING_ITEM',
  'VALIDATION_RECORD',
  'RECURRING_ACTIVITY',
  'RECURRING_ACTIVITY_OCCURRENCE',
] as const;

/** Tipo del enum objectType tal como lo declara el contrato OpenAPI. */
type ContractObjectType = NonNullable<
  NonNullable<paths['/audit-events']['get']['parameters']['query']>['objectType']
>;

/** objectType local (los literales del z.enum de abajo). */
type LocalObjectType = (typeof OBJECT_TYPES)[number];

/**
 * SALVAGUARDA DE EQUIVALENCIA BIDIRECCIONAL (en tiempo de compilación):
 * si el enum del contrato deja de coincidir EXACTAMENTE con OBJECT_TYPES, el
 * tipo _EquivalenceDiff deja de ser `never` y Expect<...> FALLA el typecheck:mcp
 * a propósito (su constraint `T extends never` se viola). Esto obliga a revisar
 * y actualizar el z.enum cuando el contrato cambie (comportamiento deseado, no
 * un fallo). Hoy OBJECT_TYPES iguala el enum del contrato (29 valores).
 */
// Valores que están en un lado pero no en el otro; `never` si son equivalentes.
type _EquivalenceDiff =
  | Exclude<ContractObjectType, LocalObjectType>
  | Exclude<LocalObjectType, ContractObjectType>;
// Expect<T> solo compila si T es `never`; si _EquivalenceDiff no es never, rompe.
type Expect<T extends never> = T;
// Se exporta para que `noUnusedLocals` no lo elimine; su único fin es que el
// typecheck evalúe la constraint `extends never` de Expect.
export type EquivalenceGuard = Expect<_EquivalenceDiff>;

/** Registra la tool de auditoría en el server. */
export function registerAuditTools(ctx: McpContext): void {
  const { server, api } = ctx;

  server.registerTool(
    'audit.events.list',
    {
      description:
        'Lista eventos de auditoría (GET /audit-events). take acota el máximo ' +
        '(1..500); objectType filtra por tipo de objeto.',
      inputSchema: {
        take: z.number().int().positive().max(500).optional(),
        objectType: z.enum(OBJECT_TYPES).optional(),
      },
    },
    async (args) =>
      runApiTool(api, () =>
        api.client.GET('/audit-events', {
          params: { query: { take: args.take, objectType: args.objectType } },
        }),
      ),
  );
}
