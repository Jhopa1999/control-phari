import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
import { DOC_STATUSES } from '../doc-status';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Query de listado de documentos (design §3.3). Filtros opcionales que se
 * intersectan con el alcance (heredado del activo). `q` busca en el titulo. Los
 * listados NUNCA incluyen el contenido.
 */
export class ListDocumentsDto {
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

  @ApiPropertyOptional({ enum: DOC_STATUSES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(DOC_STATUSES as readonly string[], { message: 'Estado invalido.' })
  status?: string;

  @ApiPropertyOptional({ type: String, description: 'Busqueda por texto en el titulo.', maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 500, description: 'Maximo de resultados.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
