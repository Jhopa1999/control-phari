import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskStatus } from '../../task-status';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para cambiar el estado de una tarea (design §3.4/§2.7). `status`
 * requerido; `progress` 0-100 y `evidenceUrl` opcionales. La transicion valida,
 * el gate de predecesoras y el permiso los aplica el service.
 */
export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus, description: 'Nuevo estado de la tarea.' })
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @ApiPropertyOptional({ type: Number, description: 'Progreso 0-100.', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ type: String, description: 'Evidencia como URL/texto.', maxLength: 2048 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048)
  evidenceUrl?: string;
}
