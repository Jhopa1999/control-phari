import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear una Request (design §3.4). Solo `title` y `mainProcessId`
 * son requeridos (confirmados); el resto de la ficha es opcional (campos P). El
 * estado operativo NO se acepta: lo fija el flujo (REGISTRADA).
 */
export class CreateRequestDto {
  @ApiProperty({
    type: String,
    description: 'Titulo de la solicitud (requerido).',
    example: 'Automatizar reporte mensual de BI',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Proceso principal (requerido, participa siempre: BR-001).',
  })
  @IsUUID()
  mainProcessId!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Procesos participantes adicionales. El principal se materializa siempre.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  participantProcessIds?: string[];

  @ApiPropertyOptional({ type: String, description: 'Area solicitante.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  requesterArea?: string;

  @ApiPropertyOptional({ type: String, description: 'Nombre del solicitante.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  requesterName?: string;

  @ApiPropertyOptional({ type: String, description: 'Dueno funcional.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  functionalOwner?: string;

  @ApiPropertyOptional({ type: String, description: 'Resultado esperado.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  expectedResult?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fecha objetivo.',
  })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Compromiso inicial (se conserva en edicion, BR-017).',
  })
  @IsOptional()
  @IsDateString()
  initialCommitmentDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Ficha/enlace de referencia.', maxLength: 2048 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048)
  referenceUrl?: string;
}
