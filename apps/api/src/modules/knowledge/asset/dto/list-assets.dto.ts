import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';
import { ASSET_STATUSES } from '../asset-status';

/** Columnas por las que se puede ordenar el catálogo de activos. */
export const ASSET_SORT_KEYS = ['createdAt', 'name', 'status'] as const;
export type AssetSortKey = (typeof ASSET_SORT_KEYS)[number];

/**
 * Query de listado de activos (design §3.2). Filtros opcionales que se
 * intersectan con el alcance (nunca lo amplian), búsqueda `q` por nombre,
 * orden y paginación. Sin `page`, `pageSize` ni `take` se devuelve el listado
 * completo del alcance con un tope de 1000 filas.
 */
export class ListAssetsDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    enum: ASSET_SORT_KEYS,
    description:
      'Columna de orden: createdAt (por defecto, descendente), name o status. Empata por id.',
  })
  @IsOptional()
  @IsIn(ASSET_SORT_KEYS as readonly string[], {
    message: 'sort debe ser createdAt, name o status.',
  })
  sort?: AssetSortKey;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 500,
    deprecated: true,
    description:
      'Obsoleto: usa pageSize. Máximo de resultados (primera página). Si llegan take y pageSize, gana pageSize.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
