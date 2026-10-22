import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un ValidationRecord (design §3.4). Separado del modelo Prisma. */
export class ValidationResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud.' })
  requestId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Gate asociado (tipicamente GC4).' })
  gateCheckId!: string | null;

  @ApiProperty({ type: String, description: 'Tipo de validacion (VALIDATION_TYPE).' })
  validationTypeCode!: string;

  @ApiProperty({ type: String, description: 'Caso de prueba.' })
  testCase!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Version de la solucion probada.' })
  version!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Ambiente.' })
  environment!: string | null;

  @ApiProperty({ type: String, description: 'Resultado (VALIDATION_RESULT).' })
  resultCode!: string;

  @ApiProperty({ type: Boolean, description: 'Defecto bloqueante.' })
  blocking!: boolean;

  @ApiProperty({ type: Boolean, description: 'Bloqueo resuelto.' })
  blockingResolved!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de resolucion del bloqueo.' })
  blockingResolvedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que resolvio el bloqueo.' })
  blockingResolvedByUserId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre de quien resolvio el bloqueo resuelto.',
  })
  blockingResolvedByName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'URL/nota de evidencia.' })
  evidenceRef!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Documento de evidencia.' })
  evidenceDocumentId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Version del documento de evidencia.' })
  evidenceDocumentVersionId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', description: 'Ejecutor.' })
  executedByUserId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre del ejecutor resuelto.',
  })
  executedByName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ejecucion.' })
  executedAt!: Date;

  @ApiProperty({ type: String, nullable: true, description: 'Notas.' })
  notes!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
