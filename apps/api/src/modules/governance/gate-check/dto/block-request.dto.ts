import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para bloquear la Request (design §5, D-B7): `blockReason` obligatorio.
 * Flag transversal; NO cambia el operationalState.
 */
export class BlockRequestDto {
  @ApiProperty({
    type: String,
    description: 'Motivo del bloqueo.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  blockReason!: string;
}

/** Entrada para desbloquear la Request (design §5): nota opcional. */
export class UnblockRequestDto {
  @ApiPropertyOptional({ type: String, description: 'Nota opcional.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
