import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { COMMITMENT_DUE_STATUSES } from '../../commitment/commitment-due';

/** Filtros de «Compromisos abiertos de mis reuniones». */
export class ListMeetingCommitmentsOpenDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Persona asignada.' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ enum: COMMITMENT_DUE_STATUSES, description: 'Semáforo de vencimiento.' })
  @IsOptional()
  @IsIn(COMMITMENT_DUE_STATUSES, { message: 'Estado de vencimiento invalido.' })
  dueStatus?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Reunión concreta.' })
  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;
}

/** Compromiso abierto de una reunión del actor (seguimiento). */
export class CommitmentFollowUpItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado (EN_CURSO o BLOQUEADO).' })
  state!: string;

  @ApiProperty({ type: String, description: 'Vencimiento (YYYY-MM-DD).' })
  dueDate!: string;

  @ApiProperty({ type: String, enum: COMMITMENT_DUE_STATUSES })
  dueStatus!: string;

  @ApiProperty({ type: Number, description: 'Días hasta el vencimiento (negativo = vencido).' })
  daysToDue!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Asignado (o responsable si no hay asignado).' })
  assignedUserName!: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  meetingId!: string;

  @ApiProperty({ type: String })
  meetingTitle!: string;

  @ApiProperty({ type: String, description: 'Fecha de la reunión (YYYY-MM-DD).' })
  meetingDate!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  processId!: string;

  @ApiProperty({ type: String })
  processName!: string;

  @ApiProperty({ type: String, nullable: true })
  expectedResult!: string | null;

  @ApiProperty({ type: String, nullable: true })
  blockers!: string | null;
}

export class CommitmentFollowUpCountsDto {
  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  vencido!: number;

  @ApiProperty({ type: Number })
  venceHoy!: number;

  @ApiProperty({ type: Number })
  proximo!: number;

  @ApiProperty({ type: Number })
  aTiempo!: number;
}

/** Compromisos abiertos de las reuniones donde el actor es responsable. */
export class MeetingCommitmentsOpenDto {
  @ApiProperty({ type: CommitmentFollowUpCountsDto, description: 'Contadores sobre el conjunto filtrado.' })
  counts!: CommitmentFollowUpCountsDto;

  @ApiProperty({ type: Boolean, description: 'true si se recortó la lista al tope (500).' })
  truncated!: boolean;

  @ApiProperty({ type: [CommitmentFollowUpItemDto] })
  items!: CommitmentFollowUpItemDto[];
}
