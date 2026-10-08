import { ApiProperty } from '@nestjs/swagger';

/** Proceso participante materializado de una Request (design §1.2). */
export class RequestParticipantResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador del participante.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso participante.' })
  processId!: string;
}

/**
 * Contrato HTTP de una Request (design §3.4). Separado del modelo Prisma.
 * `currentTriageDecision` refleja el unico Triage (1:1 efectivo); `currentScore`
 * y `priorityLabel` reflejan SIEMPRE la ultima PriorityEvaluation.
 */
export class RequestResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Titulo de la solicitud.' })
  title!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de registro.' })
  registeredAt!: Date;

  @ApiProperty({ type: String, nullable: true, description: 'Area solicitante.' })
  requesterArea!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre del solicitante.' })
  requesterName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Dueno funcional.' })
  functionalOwner!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha objetivo.' })
  targetDate!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Ficha/enlace de referencia.' })
  referenceUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Resultado esperado.' })
  expectedResult!: string | null;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso principal.' })
  mainProcessId!: string;

  @ApiProperty({ type: String, description: 'Estado operativo (read-only, derivado).' })
  operationalState!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Compromiso inicial (se conserva en edicion).',
  })
  initialCommitmentDate!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Justificacion del ultimo cambio.' })
  changeJustification!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decision del triage vigente (CONTINUAR/DEVOLVER/RECHAZAR) o null.',
  })
  currentTriageDecision!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Score de la ultima evaluacion de prioridad (0-100) o null.',
  })
  currentScore!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Etiqueta de umbral derivada del score vigente o null.',
  })
  priorityLabel!: string | null;

  @ApiProperty({
    type: [RequestParticipantResponseDto],
    description: 'Procesos participantes (incluye el principal, BR-001).',
  })
  participants!: RequestParticipantResponseDto[];

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
