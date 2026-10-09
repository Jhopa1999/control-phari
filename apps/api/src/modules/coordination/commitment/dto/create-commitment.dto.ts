import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
 * Entrada para crear un compromiso (design §3.4). `dueDate` requerido. Estado
 * inicial EN_CURSO (default de columna). `sourceMeetingId` solo RELACIONA (sin
 * auto-creacion, §11 D7). Relaciones opcionales validadas en el service.
 */
export class CreateCommitmentDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del compromiso (requerido).' })
  @IsUUID()
  processId!: string;

  @ApiProperty({ type: String, description: 'Titulo (requerido).', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiProperty({
    type: String,
    description: 'Vencimiento en formato YYYY-MM-DD.',
    example: '2025-03-20',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  dueDate!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Reunion fuente (solo relaciona).' })
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
