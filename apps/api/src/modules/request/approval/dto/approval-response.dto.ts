import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de una decision de aprobacion (design §3.4). */
export class ApprovalResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud revisada.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Decision (APROBAR/DEVOLVER).' })
  decision!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo (si DEVOLVER).' })
  reason!: string | null;

  @ApiProperty({ type: String, description: 'Estado anterior a la decision.' })
  previousState!: string;

  @ApiProperty({ type: String, description: 'Estado resultante.' })
  resultingState!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de la decision.' })
  decidedAt!: Date;

  @ApiProperty({ type: String, format: 'uuid', description: 'Usuario que decidio.' })
  decidedByUserId!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;
}
