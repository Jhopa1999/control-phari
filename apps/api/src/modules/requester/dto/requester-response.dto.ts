import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un Solicitante (maestro de solicitantes, SOL-02). */
export class RequesterResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre del solicitante.', example: 'Ana Perez' })
  name!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Area asociada (maestro de areas).' })
  areaId!: string;

  @ApiProperty({ type: String, description: 'Nombre del area asociada.', example: 'Finanzas' })
  areaName!: string;

  @ApiProperty({ type: Boolean, description: 'Estado activo.', example: true })
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
