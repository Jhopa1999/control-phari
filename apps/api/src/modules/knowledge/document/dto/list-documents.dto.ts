import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';
import { DOC_STATUSES } from '../doc-status';

/** Columnas por las que se puede ordenar el listado de documentos. */
export const DOCUMENT_SORT_KEYS = ['createdAt', 'title', 'status'] as const;
export type DocumentSortKey = (typeof DOCUMENT_SORT_KEYS)[number];

/**
 * Query de listado de documentos (design §3.3). Filtros opcionales que se
 * intersectan con el alcance (heredado del activo), `q` en el título, orden y
 * paginación (`page`/`pageSize`; `take` queda como alias obsoleto). Sin página
 * ni `take` se devuelve el listado completo con un tope de 1000 filas. Los
 * listados NUNCA incluyen el contenido.
 */
export class ListDocumentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por activo.' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso (del activo).' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por solicitud (del activo).' })
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filtra por categoría (maestra DOC_CATEGORY).', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryCode?: string;

  @ApiPropertyOptional({ enum: DOC_STATUSES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(DOC_STATUSES as readonly string[], { message: 'Estado invalido.' })
  status?: string;

  @ApiPropertyOptional({
    enum: DOCUMENT_SORT_KEYS,
    description:
      'Columna de orden: createdAt (por defecto, descendente), title o status. Empata por id.',
  })
  @IsOptional()
  @IsIn(DOCUMENT_SORT_KEYS as readonly string[], {
    message: 'sort debe ser createdAt, title o status.',
  })
  sort?: DocumentSortKey;

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
