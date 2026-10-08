import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de un CatalogItem.
 *
 * Es un DTO propio del contrato OpenAPI, separado del tipo interno generado por
 * Prisma: la forma de persistencia (Prisma) no debe filtrarse al contrato HTTP.
 * Hoy ambos coinciden en forma, por eso no se necesita una capa de mappers.
 */
export class CatalogItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Maestra a la que pertenece la opcion.', example: 'PRIORITY' })
  catalog!: string;

  @ApiProperty({ type: String, description: 'Codigo estable de la opcion.', example: 'HIGH' })
  code!: string;

  @ApiProperty({ type: String, description: 'Texto visible al usuario.', example: 'Alta' })
  label!: string;

  @ApiProperty({ type: Boolean, description: 'Indica si la opcion esta activa.', example: true })
  active!: boolean;

  @ApiProperty({ type: Number, description: 'Orden dentro del catalogo.', example: 1 })
  sortOrder!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
