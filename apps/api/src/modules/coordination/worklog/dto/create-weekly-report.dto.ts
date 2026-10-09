import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN } from '../../date';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un registro semanal (design §3.4). `weekStart` acepta
 * CUALQUIER dia de la semana en formato `YYYY-MM-DD`; el service SIEMPRE lo
 * normaliza al lunes ISO antes de persistir/buscar duplicado (nunca 400 por
 * no-lunes, Finding 3). Autor = actor. Secciones de texto opcionales que NO
 * mutan nada (AC-018).
 */
export class CreateWeeklyReportDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del semanal (requerido).' })
  @IsUUID()
  processId!: string;

  @ApiProperty({
    type: String,
    description: 'Dia de la semana (cualquiera) en formato YYYY-MM-DD; se ancla al lunes.',
    example: '2025-03-12',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  weekStart!: string;

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
