import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Edicion de las secciones de texto de un semanal (design §3). Proceso/semana/
 * estado no se editan aqui (el estado via `/submit`).
 */
export class UpdateWeeklyReportDto {
  @ApiPropertyOptional({ type: String, description: 'Resultados/entregables.', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  results?: string;

  @ApiPropertyOptional({ type: String, description: 'Propuestas (texto; no muta prioridad).', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  proposals?: string;

  @ApiPropertyOptional({ type: String, description: 'Bloqueos/dependencias.', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  blockers?: string;

  @ApiPropertyOptional({ type: String, description: 'Compromisos proxima semana (texto; no crea Commitment).', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  commitmentsText?: string;

  @ApiPropertyOptional({ type: String, description: 'Decisiones para el jefe.', maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  decisions?: string;
}
