import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ASSET_STATUSES } from '../asset-status';

/**
 * Query de listado de activos (design §3.2). Filtros opcionales que se
 * intersectan con el alcance (nunca lo amplian).
 */
export class ListAssetsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por solicitud.' })
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({ enum: ASSET_STATUSES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(ASSET_STATUSES as readonly string[], { message: 'Estado invalido.' })
  status?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 500, description: 'Maximo de resultados.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
