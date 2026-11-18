import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un Area (design 4.3). Separado del modelo Prisma. */
export class AreaResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Codigo estable.', example: 'ANALITICA' })
  code!: string;

  @ApiProperty({ type: String, description: 'Nombre del area.', example: 'Analitica' })
  name!: string;

  @ApiProperty({ type: Boolean, description: 'Estado activo.', example: true })
  active!: boolean;

  @ApiProperty({ type: Number, description: 'Orden de presentacion.', example: 1 })
  sortOrder!: number;

  @ApiProperty({ type: Number, description: 'Procesos activos del área (los inactivos no cuentan). Si es mayor que 0, el área no se puede desactivar.', example: 3 })
  processCount!: number;

  @ApiProperty({ type: Number, description: 'Solicitantes activos del área.', example: 12 })
  requesterCount!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
