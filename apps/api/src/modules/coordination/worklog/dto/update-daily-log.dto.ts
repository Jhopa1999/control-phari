import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Edicion de la cabecera de un diario (design §3). Solo las notas del dia; el
 * proceso/fecha/estado no se editan aqui (el estado via `/submit`).
 */
export class UpdateDailyLogDto {
  @ApiPropertyOptional({ type: String, description: 'Notas del dia (texto libre).', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  dayNotes?: string;
}
