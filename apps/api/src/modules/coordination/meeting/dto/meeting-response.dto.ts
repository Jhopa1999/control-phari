import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
