import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ISSUE_TYPE_CODES } from '../../catalog-codes';
import { RECORD_STATES } from '../../record-state';

/**
 * Query de listado de novedades (design §3). Filtros opcionales que se
 * intersectan con el alcance.
 */
export class ListIssuesDto {
  @ApiPropertyOptional({ enum: RECORD_STATES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(RECORD_STATES, { message: 'Estado invalido.' })
  state?: string;

  @ApiPropertyOptional({ enum: ISSUE_TYPE_CODES, description: 'Filtra por tipo.' })
  @IsOptional()
  @IsIn(ISSUE_TYPE_CODES, { message: 'Tipo de novedad invalido.' })
  typeCode?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;
}
