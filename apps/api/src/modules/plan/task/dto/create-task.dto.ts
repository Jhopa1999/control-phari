import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear una tarea (design §3.4). `title` requerido; el resto
 * opcional. Reglas cruzadas (hito, responsable/proceso existentes y en alcance)
 * las aplica el service -> 400/404. No incluye `status`/`progress`/`accepted*`
 * (se cambian por acciones propias).
 */
export class CreateTaskDto {
  @ApiProperty({ type: String, description: 'Titulo de la tarea.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Responsable de la tarea.' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Proceso de contexto (informativo).' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de inicio planificada.' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de fin/vencimiento.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: Number, description: 'Estimacion en horas (hito => 0).', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimateHours?: number;

  @ApiPropertyOptional({ type: Boolean, description: 'Indica si la tarea es un hito.' })
  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;

  @ApiPropertyOptional({ type: String, description: 'Descripcion/alcance.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ type: String, description: 'Criterios de aceptacion.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ type: String, description: 'Fase de framework requerida (texto informativo).', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  frameworkPhaseRequired?: string;

  @ApiPropertyOptional({ type: String, description: 'Evidencia como URL/texto.', maxLength: 2048 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048)
  evidenceUrl?: string;
}
