import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * Entrada para registrar una validacion/evidencia (design §5, marco §7).
 * Registrar NO aprueba ningun gate ni cambia estado (BR-008). `validationTypeCode`
 * y `resultCode` se validan contra catalogo en el service (400). Si viene
 * `evidenceDocumentVersionId`, su documentId debe coincidir con `evidenceDocumentId`.
 */
export class CreateValidationDto {
  @ApiProperty({
    type: String,
    description: 'Tipo de validacion (catalogo VALIDATION_TYPE).',
    maxLength: 100,
  })
  @Transform(upper)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  validationTypeCode!: string;

  @ApiProperty({ type: String, description: 'Caso de prueba.', minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  testCase!: string;

  @ApiPropertyOptional({ type: String, description: 'Version de la solucion probada.', maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  version?: string;

  @ApiPropertyOptional({ type: String, description: 'Ambiente.', maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  environment?: string;

  @ApiProperty({
    type: String,
    description: 'Resultado (catalogo VALIDATION_RESULT).',
    maxLength: 100,
  })
  @Transform(upper)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  resultCode!: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Defecto bloqueante si/no (default false).' })
  @IsOptional()
  @IsBoolean()
  blocking?: boolean;

  @ApiProperty({ type: String, format: 'uuid', description: 'Ejecutor de la prueba.' })
  @IsUUID()
  executedByUserId!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ejecucion (ISO).' })
  @IsISO8601()
  executedAt!: string;

  @ApiPropertyOptional({ type: String, description: 'URL/nota de evidencia.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  evidenceRef?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Documento de evidencia (Fase 6).' })
  @IsOptional()
  @IsUUID()
  evidenceDocumentId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Version concreta del documento de evidencia (inmutable).',
  })
  @IsOptional()
  @IsUUID()
  evidenceDocumentVersionId?: string;

  @ApiPropertyOptional({ type: String, description: 'Notas.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
