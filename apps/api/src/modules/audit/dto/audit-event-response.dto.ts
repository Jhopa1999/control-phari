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
    nullable: true,
    description:
      'Nombre de quien originó la mutación. Nulo si fue el sistema o si el usuario ya no existe.',
  })
  actorName!: string | null;

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

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'PRY-0012',
    description:
      'Código visible del objeto (PRY-0012, PRY-0012-F2, PRY-0012-T07, ACT-0007, DOC-0003). Nulo en objetos sin código (usuarios, áreas, procesos, catálogos), eliminados o de otros tipos.',
  })
  objectCode!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Nombre o título del objeto afectado. Nulo si el objeto ya no existe o su tipo no tiene etiqueta.',
  })
  objectLabel!: string | null;
  @ApiProperty({ type: String, format: 'date-time', description: 'Momento del evento.' })
  createdAt!: Date;
}
