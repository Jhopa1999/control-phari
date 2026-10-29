import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Decisión sobre un documento pendiente de aprobación (solo jefe de área). */
export class ReviewDocumentDto {
  @ApiProperty({ enum: ['APROBAR', 'RECHAZAR'], description: 'Decisión.' })
  @IsIn(['APROBAR', 'RECHAZAR'], { message: 'Decisión inválida.' })
  decision!: 'APROBAR' | 'RECHAZAR';

  @ApiPropertyOptional({
    type: String,
    description: 'Motivo (obligatorio al rechazar).',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
