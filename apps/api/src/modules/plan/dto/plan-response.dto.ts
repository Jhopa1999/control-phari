import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un plan (design §3.4). */
export class PlanResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud del plan.' })
  requestId!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Inicio del periodo.' })
  periodStart!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fin del periodo.' })
  periodEnd!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de compromiso.' })
  commitmentDate!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Riesgos.' })
  risks!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Mitigaciones.' })
  mitigations!: string | null;

  @ApiProperty({ type: String, description: 'Estado del plan (PlanStatus).' })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de envio a autorizacion.' })
  submittedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que envio.' })
  submittedByUserId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre de quien envio resuelto.',
  })
  submittedByName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de autorizacion.' })
  authorizedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que autorizo.' })
  authorizedByUserId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre de quien autorizo resuelto.',
  })
  authorizedByName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo de la ultima devolucion.' })
  returnReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
