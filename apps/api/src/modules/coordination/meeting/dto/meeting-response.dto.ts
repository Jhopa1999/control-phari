import { ApiProperty } from '@nestjs/swagger';

/** Compromiso listado dentro del acta de la reunión. */
export class MeetingCommitmentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado (maestra RECORD_STATE).' })
  state!: string;

  @ApiProperty({ type: String, description: 'Vencimiento (YYYY-MM-DD).' })
  dueDate!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  expectedResult!: string | null;

  @ApiProperty({ type: String, nullable: true })
  result!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre de la persona asignada.' })
  assignedUserName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre del responsable del compromiso.' })
  responsibleUserName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['VENCIDO', 'VENCE_HOY', 'PROXIMO', 'A_TIEMPO'],
    description: 'Semáforo de vencimiento; null si el compromiso ya terminó.',
  })
  dueStatus!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Días hasta el vencimiento (negativo = vencido).' })
  daysToDue!: number | null;
}

/** Contrato HTTP de una reunion (design §3.4). Incluye los ids de participantes. */
export class MeetingResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso de la reunion.' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Titulo.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado (maestra RECORD_STATE).' })
  state!: string;

  @ApiProperty({ type: String, description: 'Fecha de la reunion (YYYY-MM-DD).' })
  meetingDate!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Hora HH:mm (texto).' })
  meetingTime!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Duración en minutos (múltiplo de 15); null si no se registró.' })
  durationMinutes!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Hora de fin HH:mm (hora + duración); null si falta alguna o cruza la medianoche.' })
  meetingEndTime!: string | null;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Participantes.' })
  participantUserIds!: string[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedRequestId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedProjectRequestId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  agenda!: string | null;

  @ApiProperty({ type: String, nullable: true })
  decisions!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: Boolean, description: 'El acta está cerrada (COMPLETADO/ARCHIVADO): no admite cambios.' })
  closed!: boolean;

  @ApiProperty({ type: Number, description: 'Compromisos derivados del acta.' })
  commitmentsTotal!: number;

  @ApiProperty({ type: Number, description: 'Compromisos del acta aún abiertos (no completados ni archivados).' })
  commitmentsOpen!: number;

  @ApiProperty({
    type: [MeetingCommitmentDto],
    description: 'Compromisos del acta (lista del acta, visible para quien ve la reunión).',
  })
  commitments!: MeetingCommitmentDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
