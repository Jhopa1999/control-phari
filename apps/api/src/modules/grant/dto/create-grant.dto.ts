import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { RoleCode } from '../../auth/role-code';

/**
 * Entrada para POST /grants (design 4.3). `roleCode` se recibe como code (no
 * uuid) por legibilidad y se resuelve a roleId en el service (design 4.2.1).
 */
export class CreateGrantDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del usuario a asignar.' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: RoleCode, description: 'Rol a conceder.' })
  @IsEnum(RoleCode)
  roleCode!: RoleCode;

  @ApiProperty({ type: String, format: 'uuid', description: 'Id del proceso del grant.' })
  @IsUUID()
  processId!: string;
}
