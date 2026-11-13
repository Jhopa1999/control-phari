import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de una DEFINICION de actividad recurrente (FEAT-002, design §2). */
export class RecurringActivityResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Titulo de la actividad.' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Descripcion/alcance.' })
  description!: string | null;

  @ApiProperty({ type: String, description: 'Tipo de actividad (catalogo RECURRING_ACTIVITY_TYPE).' })
  activityType!: string;

  @ApiProperty({ type: String, description: 'Cadencia logica (Recurrence).' })
  cadence!: string;

  @ApiProperty({ type: Number, description: 'Cada cuantos periodos se repite (>= 1).' })
  intervalCount!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Primer dia objetivo / ancla.' })
  startDate!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fin opcional (inclusive).' })
  endDate!: Date | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Horizonte tecnico de generacion en dias (null = default ENV). No editable desde el portal.', deprecated: true })
  anticipationDays!: number | null;

  @ApiProperty({ type: String, description: 'Tipo de responsable (ResponsibleKind): USER o AREA.' })
  responsibleKind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario responsable.' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Area responsable.' })
  responsibleAreaId!: string | null;

  @ApiProperty({ type: Boolean, description: 'Si false, el motor no genera nuevas ocurrencias.' })
  active!: boolean;

  @ApiProperty({ type: Number, description: 'Esfuerzo estimado en horas por ocurrencia.' })
  estimatedHours!: number;

  @ApiProperty({ type: Number, description: 'Dias antes del dia objetivo en que la ocurrencia se habilita.' })
  prepDays!: number;

  @ApiProperty({ type: Boolean, description: 'Si true, completar exige al menos un adjunto.' })
  requiresEvidence!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
