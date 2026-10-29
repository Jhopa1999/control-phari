import { ApiProperty } from '@nestjs/swagger';

/** Archivo de evidencia adjunto a una tarea. */
export class EvidenceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  taskId!: string;

  @ApiProperty({ type: String, description: 'Nombre original del archivo.' })
  fileName!: string;

  @ApiProperty({ type: String, description: 'Tipo MIME.' })
  contentType!: string;

  @ApiProperty({ type: Number, description: 'Tamano en bytes.' })
  sizeBytes!: number;

  @ApiProperty({ type: String, format: 'uuid' })
  uploadedByUserId!: string;

  @ApiProperty({ type: String, description: 'Nombre de quien subio el archivo.' })
  uploadedByName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

/** URL temporal de descarga de una evidencia. */
export class EvidenceDownloadDto {
  @ApiProperty({ type: String, description: 'URL prefirmada de descarga.' })
  url!: string;

  @ApiProperty({ type: Number, description: 'Segundos de vigencia de la URL.' })
  expiresInSeconds!: number;
}

/** Cuerpo multipart de la subida (documentacion OpenAPI). */
export class UploadEvidenceDto {
  @ApiProperty({ type: String, format: 'binary', description: 'Archivo de evidencia.' })
  file!: unknown;
}
