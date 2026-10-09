import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { DATE_PATTERN } from '../period';

/**
 * Filtros opcionales de periodo para el Control del area (design §5.1/§7).
 * `from`/`to` opcionales con formato `YYYY-MM-DD`; la regla `from > to` -> 400 y
 * el default (mes en curso UTC) los resuelve `resolvePeriod` en el service.
 */
export class AreaControlQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Inicio del periodo (inclusivo), YYYY-MM-DD.',
    example: '2025-03-01',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Revisa el rango de fechas.' })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Fin del periodo (exclusivo), YYYY-MM-DD.',
    example: '2025-04-01',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Revisa el rango de fechas.' })
  to?: string;
}
