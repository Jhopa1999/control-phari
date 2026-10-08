import { ApiProperty } from '@nestjs/swagger';
import { RoleCode } from '../role-code';
import { ModuleKey } from '../module-matrix';

/** Un grant activo del actor, tal como lo expone /me/permissions. */
export class MyGrantDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del proceso del grant.' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Codigo del proceso.', example: 'FIBI' })
  processCode!: string;

  @ApiProperty({ type: String, description: 'Nombre del proceso.', example: 'BI' })
  processName!: string;

  @ApiProperty({ enum: RoleCode, description: 'Rol del grant.' })
  roleCode!: RoleCode;

  @ApiProperty({ type: String, description: 'Etiqueta visible del rol.', example: 'Lider de proceso' })
  roleName!: string;
}

/**
 * Respuesta de GET /me/permissions (design 3.3). Rol(es), procesos con alcance
 * y modulos permitidos derivados de MODULE_MATRIX.
 */
export class MyPermissionsResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del usuario actual.' })
  userId!: string;

  @ApiProperty({ type: String, description: 'Nombre del usuario actual.', example: 'Ana Jefa' })
  name!: string;

  @ApiProperty({ type: String, description: 'Identificador funcional.', example: 'jefe@demo.local' })
  identifier!: string;

  @ApiProperty({ type: [MyGrantDto], description: 'Grants activos del usuario.' })
  grants!: MyGrantDto[];

  @ApiProperty({
    type: [String],
    description: 'Claves de modulo permitidas para el/los rol(es) del actor.',
    example: ['permissions', 'audit', 'admin'],
  })
  allowedModules!: ModuleKey[];
}
