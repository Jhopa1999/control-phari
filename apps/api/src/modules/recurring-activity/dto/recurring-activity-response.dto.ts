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

  @ApiProperty({ type: Number, nullable: true, description: 'Dias de anticipacion propios (null = default ENV).' })
  anticipationDays!: number | null;

  @ApiProperty({ type: String, description: 'Tipo de responsable (ResponsibleKind): USER o AREA.' })
  responsibleKind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario responsable.' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Area responsable.' })
  responsibleAreaId!: string | null;

  @ApiProperty({ type: Boolean, description: 'Si false, el motor no genera nuevas ocurrencias.' })
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
