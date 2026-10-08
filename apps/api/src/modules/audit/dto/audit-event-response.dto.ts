import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de un AuditEvent (design 4.3). before/after como object
 * nullable en swagger. Separado del modelo Prisma.
 */
export class AuditEventResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador del evento.' })
  id!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Usuario que origino la mutacion (null si fue el sistema).',
  })
  actorUserId!: string | null;

  @ApiProperty({ type: String, description: 'Verbo de la mutacion.', example: 'CREATE' })
  action!: string;

  @ApiProperty({ type: String, description: 'Tipo de objeto afectado.', example: 'GRANT' })
  objectType!: string;

  @ApiProperty({ type: String, description: 'Id del objeto afectado.' })
  objectId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Proceso de alcance del evento (null si no aplica).',
  })
  scopeProcessId!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Estado previo (null en CREATE).',
  })
  before!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Estado posterior (null en DELETE fisico).',
  })
  after!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Momento del evento.' })
  createdAt!: Date;
}
