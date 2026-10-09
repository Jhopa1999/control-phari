import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';
import { ISSUE_TYPE_CODES } from '../../catalog-codes';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear una novedad (design §3.4). `typeCode` por defecto BLOQUEO
 * (si se informa, debe estar en ISSUE_TYPE). `reportedByUserId` = actor. Estado
 * inicial EN_CURSO (default de columna). Relaciones opcionales validadas en el
 * service.
 */
export class CreateIssueDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso de la novedad (requerido).' })
  @IsUUID()
  processId!: string;

  @ApiProperty({
    type: String,
    description: 'Fecha de alta en formato YYYY-MM-DD.',
    example: '2025-03-10',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date!: string;

  @ApiProperty({ type: String, description: 'Titulo de la novedad (requerido).', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ enum: ISSUE_TYPE_CODES, description: 'Tipo (por defecto BLOQUEO).' })
  @IsOptional()
  @IsIn(ISSUE_TYPE_CODES, { message: 'Tipo de novedad invalido.' })
  typeCode?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Solicitud relacionada.' })
  @IsOptional()
  @IsUUID()
  relatedRequestId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Tarea relacionada.' })
  @IsOptional()
  @IsUUID()
  relatedTaskId?: string;

  @ApiPropertyOptional({ type: String, description: 'Activo relacionado (texto).', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  relatedAssetRef?: string;

  @ApiPropertyOptional({ type: String, description: 'Detalle.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  detail?: string;

  @ApiPropertyOptional({ type: String, description: 'Impacto.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  impact?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Responsable de resolucion.' })
  @IsOptional()
  @IsUUID()
  resolverUserId?: string;

  @ApiPropertyOptional({ type: String, description: 'Fecha objetivo (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  targetDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Resolucion/evidencia.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}
