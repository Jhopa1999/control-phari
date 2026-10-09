import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP del contenido Markdown de una version (design §3.3/§3.4). Es el
 * unico DTO que incluye el `content`; lo usa el cliente para preview y para
 * armar la descarga `.md` (Blob) del lado del frontend.
 */
export class DocumentContentResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Documento.' })
  documentId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Version del contenido.' })
  versionId!: string;

  @ApiProperty({ type: Number, description: 'Numero de version.' })
  versionNumber!: number;

  @ApiProperty({ type: String, description: 'Titulo del documento.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Contenido Markdown.' })
  content!: string;
}
