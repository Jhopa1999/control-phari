import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TRIAGE_DECISIONS } from '../../request-state.service';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para registrar el triage de una Request (design §3.4). `decision` es
 * el unico campo requerido confirmado (BR-004); los codes maestros se validan
 * contra CatalogItem activo en el service.
 */
export class CreateTriageDto {
  @ApiProperty({
    description: 'Decision del triage.',
    enum: TRIAGE_DECISIONS,
  })
  @IsIn(TRIAGE_DECISIONS)
  decision!: (typeof TRIAGE_DECISIONS)[number];

  @ApiPropertyOptional({ type: String, description: 'Ruta (maestra TRIAGE_ROUTE).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  routeCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Tipo de demanda (maestra DEMAND_TYPE).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  demandTypeCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Criticidad (maestra CRITICALITY).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  criticalityCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Tamano (maestra TRIAGE_SIZE).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  sizeCode?: string;

  @ApiPropertyOptional({ type: String, description: 'Disponibilidad de datos (maestra DATA_AVAILABILITY).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  dataAvailabilityCode?: string;

  @ApiPropertyOptional({ type: Number, description: 'Esfuerzo total (horas).', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalEffortHours?: number;

  @ApiPropertyOptional({ type: String, description: 'Responsable principal.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  mainResponsible?: string;

  @ApiPropertyOptional({ type: String, description: 'Dependencias.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  dependencies?: string;

  @ApiPropertyOptional({ type: String, description: 'Observaciones.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
