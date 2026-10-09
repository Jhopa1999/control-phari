import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Tipos de objeto filtrables. DEBE mantenerse sincronizado con AuditObjectType
 * de audit.service.ts: cada fase que agrega un objectType nuevo tiene que
 * incluirlo aqui, o el filtro ?objectType= de GET /audit-events lo rechaza con
 * 400 pese a que el evento si se registra.
 */
const OBJECT_TYPES = [
  'PROCESS',
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
] as const;

/**
 * Filtros opcionales para GET /audit-events. `take` lo acota el service a <=
 * 500 (design 4.2); aqui se valida como entero positivo.
 */
export class ListAuditEventsDto {
  @ApiPropertyOptional({
    enum: OBJECT_TYPES,
    description: 'Filtra por tipo de objeto.',
  })
  @IsOptional()
  @IsIn(OBJECT_TYPES)
  objectType?: (typeof OBJECT_TYPES)[number];

  @ApiPropertyOptional({
    type: Number,
    description: 'Maximo de eventos a devolver (el servidor acota a 500).',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
