import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un Triage (design §3.4). Separado del modelo Prisma. */
export class TriageResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud triada.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Decision (CONTINUAR/DEVOLVER/RECHAZAR).' })
  decision!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Ruta (code maestro).' })
  routeCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Tipo de demanda (code maestro).' })
  demandTypeCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Criticidad (code maestro).' })
  criticalityCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Tamano (code maestro).' })
  sizeCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Disponibilidad de datos (code maestro).' })
  dataAvailabilityCode!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Esfuerzo total (horas).' })
  totalEffortHours!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Responsable principal.' })
  mainResponsible!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Dependencias.' })
  dependencies!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Observaciones.' })
  notes!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de decision.' })
  decidedAt!: Date;

  @ApiProperty({ type: String, format: 'uuid', description: 'Usuario que decidio.' })
  decidedByUserId!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;
}
