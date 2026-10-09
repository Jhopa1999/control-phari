import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN } from '../../date';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear la cabecera de un registro diario (design §3.4). El autor
 * es el actor (no se acepta del body; §11 D10). `date` formato `YYYY-MM-DD`
 * (revalidado round-trip en el service). El alcance/duplicado los resuelve el
 * service (409 por persona+proceso+fecha).
 */
export class CreateDailyLogDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del diario (requerido).' })
  @IsUUID()
  processId!: string;

  @ApiProperty({
    type: String,
    description: 'Dia del registro en formato YYYY-MM-DD.',
    example: '2025-03-10',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date!: string;

  @ApiPropertyOptional({ type: String, description: 'Notas del dia (texto libre).', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  dayNotes?: string;
}
