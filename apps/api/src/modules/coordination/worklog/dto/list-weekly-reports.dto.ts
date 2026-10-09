import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_PATTERN } from '../../date';

/**
 * Query de listado de semanales (design §3). `weekStart` acepta cualquier dia;
 * el service lo normaliza al lunes ISO para filtrar. Filtros opcionales que se
 * intersectan con el alcance.
 */
export class ListWeeklyReportsDto {
  @ApiPropertyOptional({ type: String, description: 'Filtra por semana (cualquier dia, YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  weekStart?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;
}
