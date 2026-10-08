import { ApiProperty } from '@nestjs/swagger';

/** Predecesora embebida en una tarea (design §3.4). */
export class TaskPredecessorDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la tarea predecesora.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Titulo de la predecesora.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado de la predecesora (TaskStatus).' })
  status!: string;

  @ApiProperty({ type: Boolean, description: 'Aceptacion de la predecesora.' })
  accepted!: boolean;
}

/** Contrato HTTP de una tarea (design §3.4). */
export class TaskResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Fase a la que pertenece.' })
  phaseId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Proceso de contexto (informativo).' })
  processId!: string | null;

  @ApiProperty({ type: String, description: 'Titulo de la tarea.' })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Responsable de la tarea.' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de inicio.' })
  startDate!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de fin/vencimiento.' })
  endDate!: Date | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Estimacion en horas.' })
  estimateHours!: number | null;

  @ApiProperty({ type: Boolean, description: 'Indica si la tarea es un hito.' })
  isMilestone!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Descripcion/alcance.' })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Criterios de aceptacion.' })
  acceptanceCriteria!: string | null;

  @ApiProperty({ type: String, description: 'Estado de la tarea (TaskStatus).' })
  status!: string;

  @ApiProperty({ type: Number, description: 'Progreso 0-100.' })
  progress!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Fase de framework requerida (texto informativo).' })
  frameworkPhaseRequired!: string | null;

  @ApiProperty({ type: Boolean, description: 'Aceptacion de la tarea.' })
  accepted!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de aceptacion.' })
  acceptedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que acepto.' })
  acceptedByUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Evidencia como URL/texto.' })
  evidenceUrl!: string | null;

  @ApiProperty({ type: [TaskPredecessorDto], description: 'Predecesoras directas de la tarea.' })
  predecessors!: TaskPredecessorDto[];

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
