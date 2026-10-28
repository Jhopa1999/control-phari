import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de una OCURRENCIA de actividad recurrente (FEAT-002, design §2). */
export class OccurrenceResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico de la ocurrencia.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Definicion a la que pertenece.' })
  activityId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la definicion (contexto).' })
  activityTitle!: string;

  @ApiProperty({ type: String, description: 'Tipo de actividad de la definicion.' })
  activityType!: string;

  @ApiProperty({ type: String, description: 'Cadencia de la definicion (Recurrence).' })
  cadence!: string;

  @ApiProperty({ type: String, description: 'Tipo de responsable de la definicion (USER/AREA).' })
  responsibleKind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario responsable de la definicion.' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Area responsable de la definicion.' })
  responsibleAreaId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Dia objetivo de la ocurrencia.' })
  targetDate!: Date;

  @ApiProperty({ type: String, description: 'Estado de la ocurrencia (OccurrenceStatus).' })
  status!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Etiqueta legible del periodo (p. ej. "2024-W03").' })
  periodLabel!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha/hora de completado.' })
  completedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que completo.' })
  completedByUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Comentario/evidencia de completado (opcional).' })
  completionComment!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
