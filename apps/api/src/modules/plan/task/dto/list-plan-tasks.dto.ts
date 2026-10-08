import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TaskStatus } from '../../task-status';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Filtros opcionales para listar tareas de un plan (design §3.4). */
export class ListPlanTasksDto {
  @ApiPropertyOptional({ enum: TaskStatus, description: 'Filtrar por estado.' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtrar por fase.' })
  @IsOptional()
  @IsUUID()
  phaseId?: string;

  @ApiPropertyOptional({ type: String, description: 'Solo mis tareas ("true"/"false").' })
  @IsOptional()
  @IsBooleanString()
  mine?: string;

  @ApiPropertyOptional({ type: String, description: 'Busqueda por titulo.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  q?: string;
}
