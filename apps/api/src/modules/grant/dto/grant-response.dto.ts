import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de un Grant (design 4.3). Separado del modelo Prisma. */
export class GrantResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Usuario asignado.' })
  userId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Rol concedido.' })
  roleId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del grant.' })
  processId!: string;

  @ApiProperty({ type: Boolean, description: 'Estado activo (false = revocado).', example: true })
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
