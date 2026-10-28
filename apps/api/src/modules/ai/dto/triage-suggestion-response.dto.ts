import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Bandas de prioridad orientadoras (marco FCGR §4); NO enum ALTA/MEDIA/BAJA. */
export const PRIORITY_BANDS = ['P1', 'P2', 'P3', 'P4'] as const;
export type PriorityBand = (typeof PRIORITY_BANDS)[number];

/**
 * Candidato a duplicado sugerido por la IA. `requestId` debe ser un UUID; el
 * service ademas descarta los que no estaban en el contexto de la solicitud (la
 * IA no puede inventar solicitudes fuera de alcance).
 */
export class DuplicateCandidateDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'ID de la solicitud candidata a duplicado.' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la solicitud candidata.', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ type: Number, description: 'Confianza del parecido (0..1).', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ApiProperty({ type: String, description: 'Motivo breve del parecido.', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/**
 * Salida de la sugerencia de triage (design 5.1). Es una SUGERENCIA: no persiste
 * nada y el humano confirma. Los cinco `suggested*Code` son codes de maestra
 * (TRIAGE_ROUTE, DEMAND_TYPE, CRITICALITY, TRIAGE_SIZE, DATA_AVAILABILITY) o
 * null si la IA no propuso uno valido. `tentativePriorityBand` es una señal
 * (P1..P4), no el score oficial.
 */
export class TriageSuggestionResponseDto {
  @ApiProperty({ type: String, nullable: true, description: 'Code sugerido de TRIAGE_ROUTE o null.' })
  @IsOptional()
  @IsString()
  suggestedRouteCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Code sugerido de DEMAND_TYPE o null.' })
  @IsOptional()
  @IsString()
  suggestedDemandTypeCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Code sugerido de CRITICALITY o null.' })
  @IsOptional()
  @IsString()
  suggestedCriticalityCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Code sugerido de TRIAGE_SIZE o null.' })
  @IsOptional()
  @IsString()
  suggestedSizeCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Code sugerido de DATA_AVAILABILITY o null.' })
  @IsOptional()
  @IsString()
  suggestedDataAvailabilityCode!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: PRIORITY_BANDS,
    description: 'Banda de prioridad tentativa (P1..P4) o null. Señal, no score oficial.',
  })
  @IsOptional()
  @IsIn(PRIORITY_BANDS)
  tentativePriorityBand!: PriorityBand | null;

  @ApiProperty({ type: String, description: 'Justificacion breve de la banda.', maxLength: 600 })
  @IsString()
  @MaxLength(600)
  priorityRationale!: string;

  @ApiProperty({ type: [DuplicateCandidateDto], description: 'Posibles duplicados sugeridos.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DuplicateCandidateDto)
  possibleDuplicates!: DuplicateCandidateDto[];

  @ApiProperty({
    type: [String],
    description: 'Informacion faltante detectada (y notas de codes no validos).',
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  missingInformation!: string[];

  @ApiProperty({ type: String, description: 'ID del modelo que genero la sugerencia.' })
  @IsString()
  model!: string;

  @ApiProperty({ type: String, description: 'Code del agente que genero la sugerencia.' })
  @IsString()
  agentCode!: string;
}
