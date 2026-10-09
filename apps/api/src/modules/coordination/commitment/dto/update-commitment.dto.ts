import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Edicion de un compromiso (design §3). El `state` NO se edita aqui (via
 * `/transition`).
 */
export class UpdateCommitmentDto {
  @ApiPropertyOptional({ type: String, description: 'Titulo.', maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ type: String, description: 'Vencimiento (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  dueDate?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Reunion fuente.' })
  @IsOptional()
  @IsUUID()
  sourceMeetingId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Persona asignada.' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Responsable.' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Solicitud relacionada.' })
  @IsOptional()
  @IsUUID()
  relatedRequestId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '"Proyecto" (Request) relacionado.' })
  @IsOptional()
  @IsUUID()
  relatedProjectRequestId?: string;

  @ApiPropertyOptional({ type: String, description: 'Resultado esperado.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  expectedResult?: string;

  @ApiPropertyOptional({ type: String, description: 'Resultado/evidencia.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  result?: string;

  @ApiPropertyOptional({ type: String, description: 'Bloqueos.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  blockers?: string;
}
