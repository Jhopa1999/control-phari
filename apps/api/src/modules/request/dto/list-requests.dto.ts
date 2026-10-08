import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RequestState } from '../request-state';

/**
 * Filtros opcionales para GET /requests (design §3.4). `@IsEnum(RequestState)`
 * valida SOLO el filtro de lectura; la integridad de la escritura del estado la
 * garantiza RequestStateService, no este DTO.
 */
export class ListRequestsDto {
  @ApiPropertyOptional({ enum: RequestState, description: 'Filtra por estado operativo.' })
  @IsOptional()
  @IsEnum(RequestState)
  state?: RequestState;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso principal.' })
  @IsOptional()
  @IsUUID()
  mainProcessId?: string;
}
