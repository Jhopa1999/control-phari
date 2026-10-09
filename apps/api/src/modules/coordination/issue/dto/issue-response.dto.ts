import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de una novedad (design §3.4). Fechas de columna como
 * `YYYY-MM-DD`; FKs opcionales como null.
 */
export class IssueResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso de la novedad.' })
  processId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Autor (quien reporta).' })
  reportedByUserId!: string;

  @ApiProperty({ type: String, description: 'Fecha de alta (YYYY-MM-DD).' })
  date!: string;

  @ApiProperty({ type: String, description: 'Tipo (maestra ISSUE_TYPE).' })
  typeCode!: string;

  @ApiProperty({ type: String, description: 'Estado (maestra RECORD_STATE).' })
  state!: string;

  @ApiProperty({ type: String, description: 'Titulo.' })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedRequestId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedTaskId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  relatedAssetRef!: string | null;

  @ApiProperty({ type: String, nullable: true })
  detail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  impact!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  resolverUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Fecha objetivo (YYYY-MM-DD).' })
  targetDate!: string | null;

  @ApiProperty({ type: String, nullable: true })
  resolution!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
