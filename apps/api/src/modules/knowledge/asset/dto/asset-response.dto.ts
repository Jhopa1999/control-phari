import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de un activo generico (design §3.4/§e). FKs y atributos
 * opcionales como null. El estado es un AssetStatus (texto). `processId` es el
 * proceso PROPIETARIO; `visibleProcessIds` contiene SOLO los procesos de la
 * tabla puente (NO incluye al propietario), siempre un array (nunca null).
 */
export class AssetResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso propietario del activo.' })
  processId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Solicitud de origen.' })
  requestId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Dueno/responsable.' })
  ownerUserId!: string | null;

  @ApiProperty({ type: String, description: 'Nombre del activo.' })
  name!: string;

  @ApiProperty({ type: String, description: 'Estado (AssetStatus).' })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  documentationRef!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Descripcion general del activo.' })
  generalDescription!: string | null;

  @ApiProperty({ type: String, nullable: true })
  dependencies!: string | null;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Procesos que pueden ver/usar el activo (sin incluir al propietario).',
  })
  visibleProcessIds!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
