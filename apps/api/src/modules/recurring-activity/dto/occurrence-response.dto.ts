import { ApiProperty } from '@nestjs/swagger';
import { OccurrenceDisplayStatus } from '../occurrence-display';

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

  @ApiProperty({ type: String, nullable: true, description: 'Que se realizo (texto de completado).' })
  completionComment!: string | null;

  @ApiProperty({
    enum: OccurrenceDisplayStatus,
    enumName: 'OccurrenceDisplayStatus',
    description:
      'Estado de presentacion derivado (PROGRAMADA, PENDIENTE, EN_CURSO, VENCE_HOY, VENCIDA, COMPLETADA, COMPLETADA_TARDE, CANCELADA).',
  })
  displayStatus!: OccurrenceDisplayStatus;

  @ApiProperty({ type: Boolean, description: 'Se puede tomar ahora (ventana abierta y pendiente).' })
  canStart!: boolean;

  @ApiProperty({ type: Boolean, description: 'Se puede completar ahora (ventana abierta y no terminal).' })
  canComplete!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'Dia desde el que se habilita (targetDate - prepDays).' })
  opensOn!: Date;

  @ApiProperty({ type: Number, description: 'Horas estimadas (snapshot de la definicion al generarse).' })
  estimatedHours!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Horas reales declaradas al completar.' })
  actualHours!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Cuando se tomo la ocurrencia.' })
  startedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Quien tomo la ocurrencia.' })
  startedByUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre de quien tomo la ocurrencia.' })
  startedByName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre de quien completo la ocurrencia.' })
  completedByName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre de la persona o area responsable.' })
  responsibleName!: string | null;

  @ApiProperty({ type: Boolean, description: 'La definicion exige al menos un adjunto para completar.' })
  requiresEvidence!: boolean;

  @ApiProperty({ type: Number, description: 'Cada cuantos periodos se repite la definicion.' })
  intervalCount!: number;

  @ApiProperty({ type: Number, description: 'Dias de preparacion de la definicion.' })
  prepDays!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Cuando se cancelo (si CANCELADA).' })
  cancelledAt!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo de cancelacion (si CANCELADA).' })
  cancelReason!: string | null;

  @ApiProperty({ type: Number, description: 'Cantidad de adjuntos de la ocurrencia.' })
  evidenceCount!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
