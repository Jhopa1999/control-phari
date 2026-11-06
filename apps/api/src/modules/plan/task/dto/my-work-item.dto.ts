import { ApiProperty } from '@nestjs/swagger';

/** Predecesora pendiente de una tarea de "Mi trabajo". */
export class MyWorkPendingPredecessorDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la predecesora.' })
  taskId!: string;
  @ApiProperty({ type: String, description: 'Titulo de la predecesora.' })
  title!: string;
}

/**
 * Item de "Mi trabajo" (design §3.4, SCR-02): una tarea del actor con su
 * contexto de plan/Request/fase.
 */
export class MyWorkItemDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la tarea.' })
  taskId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la tarea.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado de la tarea (TaskStatus).' })
  status!: string;

  @ApiProperty({ type: Number, description: 'Progreso 0-100.' })
  progress!: number;

  @ApiProperty({ type: Boolean, description: 'Indica si la tarea es un hito.' })
  isMilestone!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de inicio.' })
  startDate!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de fin/vencimiento.' })
  endDate!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', description: 'Fase a la que pertenece.' })
  phaseId!: string;

  @ApiProperty({ type: String, description: 'Nombre de la fase.' })
  phaseName!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Plan al que pertenece.' })
  planId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud del plan.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la solicitud.' })
  requestTitle!: string;

  @ApiProperty({
    type: () => [MyWorkPendingPredecessorDto],
    description: 'Predecesoras directas aun no terminadas (orden por titulo); [] si no hay.',
  })
  pendingPredecessors!: MyWorkPendingPredecessorDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo vigente del bloqueo; null si la tarea no esta BLOQUEADA o se bloqueo sin motivo.',
  })
  blockedReason!: string | null;

  @ApiProperty({ type: String, description: 'Estado operativo de la solicitud (p. ej. CERRADA).' })
  requestOperationalState!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Fecha de compromiso vigente: la del plan si la tiene; si no, el compromiso inicial de la solicitud.',
  })
  requestCommitmentDate!: Date | null;
}
