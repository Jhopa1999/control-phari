import { ApiProperty } from '@nestjs/swagger';
import { COMMITMENT_DUE_STATUSES } from '../commitment-due';

/** Compromiso abierto de la persona, para la sección «Compromisos» de Mi trabajo. */
export class CommitmentMyWorkItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado (maestra RECORD_STATE).' })
  state!: string;

  @ApiProperty({ type: String, description: 'Vencimiento (YYYY-MM-DD).' })
  dueDate!: string;

  @ApiProperty({ type: String, enum: COMMITMENT_DUE_STATUSES })
  dueStatus!: string;

  @ApiProperty({ type: Number, description: 'Días hasta el vencimiento (negativo = vencido).' })
  daysToDue!: number;

  @ApiProperty({ type: String, format: 'uuid' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Nombre del proceso.' })
  processName!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceMeetingId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Título del acta de origen.' })
  sourceMeetingTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  expectedResult!: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'La persona puede completarlo desde Mi trabajo (transición COMPLETADO).',
  })
  canComplete!: boolean;
}

/** Compromisos de la persona: vencidos y que vencen hoy, más contadores. */
export class CommitmentMyWorkDto {
  @ApiProperty({ type: Number, description: 'Compromisos abiertos de la persona (todos).' })
  total!: number;

  @ApiProperty({ type: Number, description: 'Abiertos vencidos.' })
  overdueCount!: number;

  @ApiProperty({ type: Number, description: 'Abiertos que vencen hoy.' })
  dueTodayCount!: number;

  @ApiProperty({ type: Number, description: 'Abiertos con vencimiento posterior a hoy.' })
  upcomingCount!: number;

  @ApiProperty({
    type: [CommitmentMyWorkItemDto],
    description: 'Vencidos (más antiguos primero) y los que vencen hoy.',
  })
  items!: CommitmentMyWorkItemDto[];
}
