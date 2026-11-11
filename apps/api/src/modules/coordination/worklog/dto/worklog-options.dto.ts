import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Valores de `scope` de las opciones de imputación. */
export const WORKLOG_OPTIONS_SCOPES = ['mine', 'all'] as const;

/**
 * Query de `GET /worklog/options`: qué proyectos y tareas puede imputar quien
 * llama en el diario de un proceso y una fecha. Es la misma regla que aplica el
 * servidor al guardar una actividad.
 */
export class WorklogOptionsQueryDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Proceso del diario. El proyecto debe pertenecer a él (principal o participante).',
  })
  @IsUUID()
  processId!: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Fecha del diario (YYYY-MM-DD). Referencia para la ventana de gracia de los proyectos cerrados. Por defecto, hoy.',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description:
      'Texto a buscar en código y título del proyecto y de la tarea, fase y proyecto de la tarea. Sin él, se devuelve el listado completo hasta el tope.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Incluye también las tareas TERMINADA (por defecto se ocultan).',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeTerminated?: boolean;

  @ApiPropertyOptional({
    type: String,
    enum: WORKLOG_OPTIONS_SCOPES,
    description:
      '`mine` (por defecto): proyectos con tareas propias y solo tareas propias. `all`: solo la aplica el jefe de área (proyectos y tareas de todo su alcance). El líder siempre recibe además las tareas ajenas de los procesos que lidera; el integrante, nunca.',
  })
  @IsOptional()
  @IsIn(WORKLOG_OPTIONS_SCOPES)
  scope?: (typeof WORKLOG_OPTIONS_SCOPES)[number];
}

/** Proyecto (solicitud con plan) que se puede imputar. */
export class WorklogProjectOptionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, description: 'ID visible (PRY-0012).' })
  code!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado operativo de la solicitud.' })
  state!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fecha de cierre (solo proyectos CERRADA dentro de la ventana de gracia).',
  })
  closedAt!: Date | null;

  @ApiProperty({ type: Boolean, description: 'Tiene tareas propias imputables.' })
  hasMyTasks!: boolean;
}

/** Tarea que se puede imputar. */
export class WorklogTaskOptionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, description: 'ID visible (PRY-0012-T07).' })
  code!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado de la tarea.' })
  status!: string;

  @ApiProperty({ type: String })
  phaseName!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proyecto al que pertenece.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'ID visible del proyecto.' })
  requestCode!: string;

  @ApiProperty({ type: String, description: 'Título del proyecto.' })
  requestTitle!: string;

  @ApiProperty({ type: Boolean, description: 'La tarea es del usuario que consulta.' })
  isMine!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Responsable de la tarea.' })
  responsibleName!: string | null;
}

export class WorklogOptionsResponseDto {
  @ApiProperty({ type: [WorklogProjectOptionDto] })
  projects!: WorklogProjectOptionDto[];

  @ApiProperty({ type: [WorklogTaskOptionDto] })
  tasks!: WorklogTaskOptionDto[];

  @ApiProperty({ type: Boolean, description: 'Hay más proyectos que el tope (200). Usa `q` para acotar.' })
  projectsTruncated!: boolean;

  @ApiProperty({ type: Boolean, description: 'Hay más tareas que el tope (200). Usa `q` para acotar.' })
  tasksTruncated!: boolean;
}
