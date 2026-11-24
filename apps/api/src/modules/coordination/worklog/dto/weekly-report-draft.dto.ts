import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';
import { DATE_PATTERN } from '../../date';

/**
 * Consulta del borrador del semanal. `weekStart` acepta cualquier día de la
 * semana (`YYYY-MM-DD`); el servicio lo ancla al lunes ISO, igual que el alta.
 */
export class WeeklyReportDraftQueryDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del semanal.' })
  @IsUUID()
  processId!: string;

  @ApiProperty({
    type: String,
    description: 'Día de la semana (cualquiera) en formato YYYY-MM-DD; se ancla al lunes.',
    example: '2025-03-12',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  weekStart!: string;
}

/** De dónde sale el borrador: cuántos diarios y actividades se usaron. */
export class WeeklyReportDraftSourcesDto {
  @ApiProperty({ type: Number, description: 'Diarios del actor en la semana y el proceso.' })
  dailyLogs!: number;

  @ApiProperty({ type: Number, description: 'Actividades de esos diarios.' })
  activities!: number;
}

/**
 * Borrador determinista del semanal. No se guarda: la web lo vuelca al
 * formulario y el autor decide si guarda. `proposals` y `decisions` siempre van
 * vacías (no hay de dónde derivarlas).
 */
export class WeeklyReportDraftDto {
  @ApiProperty({ type: String, description: 'Actividades de la semana agrupadas por solicitud, con horas.' })
  results!: string;

  @ApiProperty({ type: String, description: 'Vacío: el borrador no propone.' })
  proposals!: string;

  @ApiProperty({ type: String, description: 'Actividades bloqueadas de la semana y novedades abiertas del proceso.' })
  blockers!: string;

  @ApiProperty({ type: String, description: 'Compromisos abiertos del actor que vencen la semana siguiente.' })
  commitmentsText!: string;

  @ApiProperty({ type: String, description: 'Vacío: el borrador no decide.' })
  decisions!: string;

  @ApiProperty({ type: WeeklyReportDraftSourcesDto })
  sources!: WeeklyReportDraftSourcesDto;
}
