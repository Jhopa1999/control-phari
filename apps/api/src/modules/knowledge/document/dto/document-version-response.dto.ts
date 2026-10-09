import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de una version de documento para el historial (design §3.4).
 * SIN contenido: el contenido se obtiene por /content. Append-only (solo
 * createdAt).
 */
export class DocumentVersionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Documento al que pertenece.' })
  documentId!: string;

  @ApiProperty({ type: Number, description: 'Numero de version correlativo.' })
  versionNumber!: number;

  @ApiProperty({ type: String, format: 'uuid', description: 'Autor de la version.' })
  authorUserId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
