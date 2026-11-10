import { ApiProperty } from '@nestjs/swagger';

/** Tarea del plan que impide quitar un proceso participante. */
export class PlanParticipantBlockingTaskDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la tarea.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Título de la tarea.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Nombre de la persona responsable de la tarea.' })
  responsibleName!: string;
}

/** Proceso activo (o participante) con su situación en la solicitud del plan. */
export class PlanParticipantProcessDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador del proceso.' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Código del proceso.' })
  code!: string;

  @ApiProperty({ type: String, description: 'Nombre del proceso.' })
  name!: string;

  @ApiProperty({ type: Boolean, description: 'Es el proceso principal (líder): participa siempre y no se quita.' })
  isMain!: boolean;

  @ApiProperty({ type: Boolean, description: 'Interviene hoy en la solicitud.' })
  isParticipant!: boolean;

  @ApiProperty({
    type: Boolean,
    description:
      'Se puede quitar hoy: participa, no es el principal y ninguna tarea del plan lo impide.',
  })
  canRemove!: boolean;

  @ApiProperty({
    type: [PlanParticipantBlockingTaskDto],
    description:
      'Tareas del plan asignadas a personas que dejarían de ser elegibles si se quita este proceso (vacío si no impide nada).',
  })
  removalBlockedBy!: PlanParticipantBlockingTaskDto[];
}

/** Procesos que intervienen en la solicitud de un plan y su capacidad de cambio. */
export class PlanParticipantsResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud del plan.' })
  requestId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Proceso principal de la solicitud.' })
  mainProcessId!: string | null;

  @ApiProperty({
    type: [PlanParticipantProcessDto],
    description: 'Procesos activos y los que ya participan, con el principal primero.',
  })
  processes!: PlanParticipantProcessDto[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Procesos agregados por esta operación (vacío en la consulta).',
  })
  addedProcessIds!: string[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Procesos quitados por esta operación (vacío en la consulta).',
  })
  removedProcessIds!: string[];
}
