import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { DATE_PATTERN } from '../../coordination/date';
import { AUDIT_OBJECT_CODE_PATTERN, normalizeVisibleCode } from '../../plan/visible-code';

/**
 * Tipos de objeto filtrables. DEBE mantenerse sincronizado con AuditObjectType
 * de audit.service.ts: cada fase que agrega un objectType nuevo tiene que
 * incluirlo aqui, o el filtro ?objectType= de GET /audit-events lo rechaza con
 * 400 pese a que el evento si se registra.
 */
export const OBJECT_TYPES = [
  'PROCESS',
  'AREA',
  'REQUESTER',
  'PROJECT_CLOSURE',
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

/** Verbos de mutacion filtrables (design 1.2 / 4.2.1). */
export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'REVOKE',
  'LOGIN_FAILED',
  'PASSWORD_RESET_THROTTLED',
  'PASSWORD_CHANGE_REQUIRED',
  'PASSWORD_CHANGE_CLEARED',
  'PASSWORD_CHANGED',
] as const;

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
    type: String,
    maxLength: 20,
    example: 'PRY-0012-T07',
    description:
      'Filtra por el código visible del objeto: PRY-0012, PRY-0012-F2, PRY-0012-T07, ACT-0007 o DOC-0003 (sin distinguir mayúsculas). Un código que no existe devuelve la lista vacía.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeVisibleCode(value) : value,
  )
  @IsString()
  @MaxLength(20)
  @Matches(AUDIT_OBJECT_CODE_PATTERN, {
    message: 'El código del objeto debe ser como PRY-0012, PRY-0012-T07, ACT-0007 o DOC-0003.',
  })
  objectCode?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Filtra por el usuario que originó el evento. Solo intersecta el alcance por rol: nunca muestra eventos fuera de él.',
  })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-03-01',
    description:
      'Fecha inicial (YYYY-MM-DD), inclusiva desde las 00:00 en hora del servidor. Debe ser anterior o igual a `to`; el rango máximo es de 366 días.',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha inicial debe tener el formato YYYY-MM-DD.' })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-03-31',
    description: 'Fecha final (YYYY-MM-DD), inclusiva hasta el fin de ese día en hora del servidor.',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha final debe tener el formato YYYY-MM-DD.' })
  to?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Filtra por proceso de alcance del evento. Se intersecta con el alcance por rol: nunca lo amplía.',
  })
  @IsOptional()
  @IsUUID()
  processId?: string;

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
