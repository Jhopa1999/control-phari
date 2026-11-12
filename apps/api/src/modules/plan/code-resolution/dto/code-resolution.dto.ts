import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Tipo de elemento que identifica un código visible. */
export const CODE_RESOLUTION_TYPES = ['REQUEST', 'PHASE', 'TASK'] as const;
export type CodeResolutionType = (typeof CODE_RESOLUTION_TYPES)[number];

/**
 * Resultado de resolver un ID visible (`PRY-0012`, `PRY-0012-F2`,
 * `PRY-0012-T07`). No incluye rutas de la interfaz: el cliente las construye
 * con estos datos y los módulos del actor.
 */
export class CodeResolutionDto {
  @ApiProperty({ enum: CODE_RESOLUTION_TYPES, description: 'Tipo de elemento encontrado.' })
  type!: CodeResolutionType;

  @ApiProperty({ type: String, format: 'uuid', description: 'Id del elemento encontrado.' })
  id!: string;

  @ApiProperty({ type: String, example: 'PRY-0012-T07', description: 'Código canónico en mayúsculas.' })
  code!: string;

  @ApiProperty({
    type: String,
    description: 'Título de la solicitud, nombre de la fase o título de la tarea.',
  })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud del elemento (igual a `id` si el tipo es REQUEST).' })
  requestId!: string;

  @ApiProperty({ type: String, example: 'PRY-0012', description: 'ID visible de la solicitud.' })
  requestCode!: string;

  @ApiProperty({ type: String, description: 'Título de la solicitud.' })
  requestTitle!: string;

  @ApiProperty({
    type: String,
    description:
      'Estado operativo de la solicitud (`Request.operationalState`); decide si el Plan es un destino válido.',
  })
  requestStatus!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Fase del elemento (solo PHASE y TASK).' })
  phaseId?: string;

  @ApiPropertyOptional({ type: String, description: 'Nombre de la fase (solo PHASE y TASK).' })
  phaseName?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Estado de la solicitud (REQUEST) o de la tarea (TASK). Las fases no tienen estado: se omite.',
  })
  status?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Nombre del proceso principal (solo REQUEST; null si aún no tiene proceso).',
  })
  processName?: string | null;
}

/** Detalle de una fase localizada por su ID visible, con la solicitud a la que pertenece. */
export class PhaseByCodeDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la fase.' })
  id!: string;

  @ApiProperty({ type: String, example: 'PRY-0012-F2', description: 'ID visible de la fase.' })
  code!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Plan al que pertenece la fase.' })
  planId!: string;

  @ApiProperty({ type: String, description: 'Nombre de la fase.' })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startDate!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endDate!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  deliverable!: string | null;

  @ApiProperty({ type: Number, description: 'Posición de la fase en el plan (0-based).' })
  order!: number;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud a la que pertenece el plan.' })
  requestId!: string;

  @ApiProperty({ type: String, example: 'PRY-0012', description: 'ID visible de la solicitud.' })
  requestCode!: string;

  @ApiProperty({ type: String, description: 'Título de la solicitud.' })
  requestTitle!: string;

  @ApiProperty({ type: String, description: 'Estado operativo de la solicitud.' })
  requestStatus!: string;
}
