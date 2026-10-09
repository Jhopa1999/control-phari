import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para registrar un faltante de un gate (design §5): `description`
 * obligatoria; `ownerUserId` y `reviewDate` opcionales.
 */
export class CreatePendingItemDto {
  @ApiProperty({
    type: String,
    description: 'Lo que falta.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Responsable de resolverlo.' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Fecha de revision (ISO).' })
  @IsOptional()
  @IsISO8601()
  reviewDate?: string;
}
