import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_PATTERN } from '../../date';

/**
 * Query de listado de diarios (design §3). Filtros opcionales que se intersectan
 * con el `where` de alcance (nunca lo amplian).
 */
export class ListDailyLogsDto {
  @ApiPropertyOptional({ type: String, description: 'Filtra por dia (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por autor.' })
  @IsOptional()
  @IsUUID()
  authorUserId?: string;
}
