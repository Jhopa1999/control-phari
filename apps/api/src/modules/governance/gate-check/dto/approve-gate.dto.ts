import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Entrada para aprobar un gate (design §5): justificacion opcional. */
export class ApproveGateDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Justificacion de la autoridad.',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  authorityNote?: string;
}
