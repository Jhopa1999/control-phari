import { ApiPropertyOptional } from '@nestjs/swagger';
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
 * Edicion de una novedad (design §3; AC-019: un registro por incidente, se
 * edita en vez de duplicar). El `state` NO se edita aqui (via `/transition`).
 */
export class UpdateIssueDto {
  @ApiPropertyOptional({ type: String, description: 'Titulo.', maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ enum: ISSUE_TYPE_CODES, description: 'Tipo de novedad.' })
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
