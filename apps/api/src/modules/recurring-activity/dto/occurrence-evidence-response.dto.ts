import { ApiProperty } from '@nestjs/swagger';

/** Archivo adjunto a una ocurrencia de actividad recurrente. */
export class OccurrenceEvidenceResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador del adjunto.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Ocurrencia a la que pertenece.' })
  occurrenceId!: string;

  @ApiProperty({ type: String, description: 'Nombre original del archivo.' })
  fileName!: string;

  @ApiProperty({ type: String, description: 'Tipo MIME.' })
  contentType!: string;

  @ApiProperty({ type: Number, description: 'Tamano en bytes.' })
  sizeBytes!: number;

  @ApiProperty({ type: String, format: 'uuid', description: 'Usuario que subio el archivo.' })
  uploadedByUserId!: string;

  @ApiProperty({ type: String, description: 'Nombre de quien subio el archivo.' })
  uploadedByName!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de subida.' })
  createdAt!: Date;
}
