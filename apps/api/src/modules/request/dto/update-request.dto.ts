import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para editar la ficha de una Request (design §3.4). NO incluye
 * `operationalState`, `registeredAt` ni `initialCommitmentDate` (se conservan,
 * BR-017); el estado nunca se edita por DTO (BR-022). `changeJustification`
 * documenta el cambio (BR-017).
 */
export class UpdateRequestDto {
  @ApiPropertyOptional({ type: String, description: 'Titulo de la solicitud.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Procesos participantes adicionales (el principal se mantiene).',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  participantProcessIds?: string[];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Solicitante del maestro de solicitantes. El área y el nombre se toman de su registro.',
  })
  @IsOptional()
  @IsUUID()
  requesterId?: string;

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

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha objetivo.' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Ficha/enlace de referencia.', maxLength: 2048 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048)
  referenceUrl?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Justificacion del cambio (BR-017).',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  changeJustification?: string;
}
