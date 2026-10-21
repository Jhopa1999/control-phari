import { ApiProperty } from '@nestjs/swagger';

/**
 * Item del historial de solicitudes de un activo (FEAT-002): una solicitud que
 * tiene este activo como base. Vista reducida de solo lectura; refleja el
 * historial de cambios por activo que distintas solicitudes generan en el
 * tiempo.
 */
export class AssetRequestHistoryItemDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la solicitud.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Titulo de la solicitud.' })
  title!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de registro.' })
  registeredAt!: Date;

  @ApiProperty({ type: String, description: 'Estado operativo (read-only, derivado).' })
  operationalState!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso principal.' })
  mainProcessId!: string;
}
