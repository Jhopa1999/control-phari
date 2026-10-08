import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un Process (design 4.3). Separado del modelo Prisma. */
export class ProcessResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Codigo estable.', example: 'FIBI' })
  code!: string;

  @ApiProperty({ type: String, description: 'Nombre del proceso.', example: 'BI' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Marco asociado.', example: 'INS-006' })
  framework!: string | null;

  @ApiProperty({ type: String, description: 'Tipo de proceso.', example: 'PROCESS' })
  kind!: string;

  @ApiProperty({ type: Boolean, description: 'Estado activo.', example: true })
  active!: boolean;

  @ApiProperty({ type: Number, description: 'Orden de presentacion.', example: 1 })
  sortOrder!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
