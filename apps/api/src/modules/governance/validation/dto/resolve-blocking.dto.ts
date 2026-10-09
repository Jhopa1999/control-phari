import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para resolver un defecto bloqueante de un ValidationRecord (design §5,
 * D-C5): nota opcional. Resolver NO aprueba gate ni cambia estado (BR-008).
 */
export class ResolveBlockingDto {
  @ApiPropertyOptional({ type: String, description: 'Nota de resolucion.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
