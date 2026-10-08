import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear una fase (design §3.4). `name` requerido; `order` opcional
 * (si falta, el service la coloca al final). Fechas opcionales en el modelo; la
 * guia las exige para enviar.
 */
export class CreatePhaseDto {
  @ApiProperty({ type: String, description: 'Nombre de la fase.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de inicio.' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de fin.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Entregable de la fase.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  deliverable?: string;

  @ApiPropertyOptional({ type: Number, description: 'Posicion 0-based (si falta, al final).', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
