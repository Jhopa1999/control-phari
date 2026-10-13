import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Marcadores fijos del documento portable del plan (design §4.1). */
export const PLAN_DOCUMENT_KIND = 'control-phari-plan';
export const PLAN_DOCUMENT_FORMAT_VERSION = '1.0';

/**
 * Cabecera del plan dentro del documento (design §4.1). Nunca incluye campos de
 * flujo (`status`/`submitted*`/`authorized*`/`returnReason`): solo periodos y
 * riesgos/mitigaciones.
 */
export class PlanDocumentHeaderDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Inicio del periodo.' })
  @IsOptional()
  @IsDateString()
  periodStart?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Fin del periodo.' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Fecha de compromiso.' })
  @IsOptional()
  @IsDateString()
  commitmentDate?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Riesgos del plan.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  risks?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mitigaciones del plan.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  mitigations?: string | null;
}

/**
 * Tarea del documento (design §4.1). `ref` es la referencia local unica usada
 * por las dependencias. No lleva ids de BD, responsable, proceso ni campos de
 * ejecucion/flujo (§4.3).
 */
export class PlanDocumentTaskDto {
  @ApiProperty({ type: String, description: 'Referencia local unica dentro del documento.', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  ref!: string;

  @ApiProperty({ type: String, description: 'Titulo de la tarea.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ type: Boolean, description: 'Indica si la tarea es un hito.' })
  @IsBoolean()
  isMilestone!: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Estimacion en horas (hito => 0).', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimateHours?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Fecha de inicio planificada.' })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Fecha de fin/vencimiento.' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Descripcion/alcance.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Criterios de aceptacion.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  acceptanceCriteria?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Fase de framework requerida.', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  frameworkPhaseRequired?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Evidencia como URL/texto.', maxLength: 2048 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048)
  evidenceUrl?: string | null;
}

/**
 * Fase del documento con sus tareas anidadas (design §4.1). `order` entrante es
 * informativo: el import lo recalcula 0-based contiguo del indice del array.
 */
export class PlanDocumentPhaseDto {
  @ApiProperty({ type: Number, description: 'Orden 0-based de la fase.', minimum: 0 })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiProperty({ type: String, description: 'Nombre de la fase.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Fecha de inicio de la fase.' })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Fecha de fin de la fase.' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Entregable de la fase.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  deliverable?: string | null;

  @ApiProperty({ type: [PlanDocumentTaskDto], description: 'Tareas de la fase.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanDocumentTaskDto)
  tasks!: PlanDocumentTaskDto[];
}

/** Dependencia dirigida del documento, expresada con referencias locales (§4.1). */
export class PlanDocumentDependencyDto {
  @ApiProperty({ type: String, description: 'ref de la tarea dependiente.', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  dependentRef!: string;

  @ApiProperty({ type: String, description: 'ref de la tarea predecesora.', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  predecessorRef!: string;
}

/**
 * Documento portable del plan (design §4.1). Sirve de respuesta tipada del
 * export y de entrada validada del import. `kind`/`formatVersion` fijos: un
 * valor distinto -> 400 por el pipe estricto del proyecto.
 */
export class PlanDocumentDto {
  @ApiProperty({ type: String, description: 'Marcador de tipo de documento.', enum: [PLAN_DOCUMENT_KIND] })
  @Equals(PLAN_DOCUMENT_KIND)
  kind!: typeof PLAN_DOCUMENT_KIND;

  @ApiProperty({ type: String, description: 'Version del formato del documento.', enum: [PLAN_DOCUMENT_FORMAT_VERSION] })
  @Equals(PLAN_DOCUMENT_FORMAT_VERSION)
  formatVersion!: typeof PLAN_DOCUMENT_FORMAT_VERSION;

  @ApiProperty({ type: PlanDocumentHeaderDto, description: 'Cabecera del plan.' })
  @ValidateNested()
  @Type(() => PlanDocumentHeaderDto)
  plan!: PlanDocumentHeaderDto;

  @ApiProperty({ type: [PlanDocumentPhaseDto], description: 'Fases ordenadas con sus tareas.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanDocumentPhaseDto)
  phases!: PlanDocumentPhaseDto[];

  @ApiProperty({ type: [PlanDocumentDependencyDto], description: 'Dependencias entre tareas por referencia local.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanDocumentDependencyDto)
  dependencies!: PlanDocumentDependencyDto[];
}
