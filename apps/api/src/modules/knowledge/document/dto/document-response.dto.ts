import { ApiProperty } from '@nestjs/swagger';

/**
 * Resumen de la version vigente embebido en el documento (design §3.4). SIN
 * contenido: el contenido grande solo viaja por los endpoints /content.
 */
export class DocumentCurrentVersionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: Number, description: 'Numero de version correlativo.' })
  versionNumber!: number;

  @ApiProperty({ type: String, format: 'uuid', description: 'Autor de la version.' })
  authorUserId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

/**
 * Contrato HTTP de un documento (design §3.4). Metadatos + resumen de la
 * version vigente (`currentVersion`); nunca incluye el contenido.
 */
export class DocumentResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Activo del documento.' })
  assetId!: string;

  @ApiProperty({ type: String, description: 'Titulo.' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Categoria (maestra DOC_CATEGORY).' })
  categoryCode!: string | null;

  @ApiProperty({ type: String, description: 'Estado (DocStatus).' })
  status!: string;

  @ApiProperty({
    type: DocumentCurrentVersionDto,
    nullable: true,
    description: 'Resumen de la version vigente (sin contenido).',
  })
  currentVersion!: DocumentCurrentVersionDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
