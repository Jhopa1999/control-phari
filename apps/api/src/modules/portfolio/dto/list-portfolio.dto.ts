import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { RequestState } from '../../request/request-state';

/** Bandas de prioridad validas para el filtro (incl. SIN_PRIORIZAR). */
export const PORTFOLIO_BANDS = [
  'P1',
  'P2',
  'P3',
  'P4',
  'SIN_PRIORIZAR',
] as const;

/**
 * Filtros opcionales de GET /portfolio (design §5.3). Mismos tipos que
 * `ListRequestsDto`; INTERSECTAN con el alcance, nunca lo amplian (patron
 * `capacity.listAssignments`).
 */
export class ListPortfolioDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso principal.' })
  @IsOptional()
  @IsUUID()
  mainProcessId?: string;

  @ApiPropertyOptional({ enum: RequestState, description: 'Filtra por estado operativo.' })
  @IsOptional()
  @IsEnum(RequestState)
  state?: RequestState;

  @ApiPropertyOptional({
    enum: PORTFOLIO_BANDS,
    description: 'Filtra por banda de prioridad o SIN_PRIORIZAR.',
  })
  @IsOptional()
  @IsIn(PORTFOLIO_BANDS)
  band?: (typeof PORTFOLIO_BANDS)[number];
}
