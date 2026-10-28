import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/**
 * Filtros del panel de cumplimiento GET /recurring-activities/compliance
 * (FEAT-003). Delimitan la ventana de analisis (por dia objetivo) y, opcional,
 * acotan por responsable. El alcance efectivo lo decide el service: ADMIN sin
 * restriccion; JEFE_AREA acotado a sus areas.
 */
export class ComplianceQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Dia objetivo desde (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Dia objetivo hasta (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Filtra por usuario responsable de la definicion.',
  })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Filtra por area responsable de la definicion.',
  })
  @IsOptional()
  @IsUUID()
  responsibleAreaId?: string;
}
