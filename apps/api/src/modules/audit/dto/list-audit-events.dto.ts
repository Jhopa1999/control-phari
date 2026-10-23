import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Tipos de objeto filtrables. DEBE mantenerse sincronizado con AuditObjectType
 * de audit.service.ts: cada fase que agrega un objectType nuevo tiene que
 * incluirlo aqui, o el filtro ?objectType= de GET /audit-events lo rechaza con
 * 400 pese a que el evento si se registra.
 */
export const OBJECT_TYPES = [
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
] as const;

/** Verbos de mutacion filtrables (design 1.2 / 4.2.1). */
export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE'] as const;

/**
 * Filtros y paginacion de GET /audit-events. Estilo page/pageSize 1-based; el
 * service acota pageSize a <= 100 y nunca devuelve ilimitado (design 4.2 /
 * Fase B). Los filtros opcionales INTERSECTAN el alcance por rol, nunca lo
 * amplian.
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
    enum: AUDIT_ACTIONS,
    description: 'Filtra por verbo de la mutacion.',
  })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: (typeof AUDIT_ACTIONS)[number];

  @ApiPropertyOptional({
    type: Number,
    description: 'Pagina a devolver (1-based). Por defecto 1.',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Tamano de pagina. Por defecto 25; el servidor lo acota a 100.',
    minimum: 1,
    maximum: 100,
    default: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
