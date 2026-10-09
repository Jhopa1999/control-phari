import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un compromiso (design §3.4). `dueDate` como YYYY-MM-DD. */
export class CommitmentResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del compromiso.' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Titulo.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado (maestra RECORD_STATE).' })
  state!: string;

  @ApiProperty({ type: String, description: 'Vencimiento (YYYY-MM-DD).' })
  dueDate!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceMeetingId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedRequestId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedProjectRequestId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  expectedResult!: string | null;

  @ApiProperty({ type: String, nullable: true })
  result!: string | null;

  @ApiProperty({ type: String, nullable: true })
  blockers!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
