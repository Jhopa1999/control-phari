import { ApiProperty } from '@nestjs/swagger';

/** Un campo que cambió en una modificación de la tarea. */
export class TaskHistoryChangeDto {
  @ApiProperty({
    type: String,
    description:
      'Campo modificado: status, progress, accepted, title, phase, responsible, isMilestone, ' +
      'startDate, endDate, estimateHours, description, acceptanceCriteria, evidenceUrl o ' +
      'frameworkPhaseRequired.',
    example: 'status',
  })
  field!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Valor anterior como texto (fase y responsable ya vienen con su nombre; las fechas en ISO).',
    example: 'POR_HACER',
  })
  from!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Valor nuevo como texto.',
    example: 'EN_CURSO',
  })
  to!: string | null;
}

/** Una entrada de la traza de cambios de una tarea (de la más reciente a la más antigua). */
export class TaskHistoryEntryDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador del evento.' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha y hora del cambio.' })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    description: 'Tipo de evento: CREATE (tarea creada), UPDATE (cambio) o DELETE.',
    example: 'UPDATE',
  })
  action!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Quién hizo el cambio.' })
  actorUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre de quien hizo el cambio.' })
  actorName!: string | null;

  @ApiProperty({
    type: [TaskHistoryChangeDto],
    description: 'Campos que cambiaron en este evento (vacío cuando la tarea se crea).',
  })
  changes!: TaskHistoryChangeDto[];
}
