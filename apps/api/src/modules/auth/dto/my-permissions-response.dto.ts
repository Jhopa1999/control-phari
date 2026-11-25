import { ApiProperty } from '@nestjs/swagger';
import { RoleCode } from '../role-code';
import { ModuleKey } from '../module-matrix';
import { CapabilityKey } from '../capability-matrix';

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

/** Rol que puede hacer una acción, para decir a quién pedirla. */
export class MyCapabilityRoleDto {
  @ApiProperty({ enum: RoleCode, description: 'Código del rol.' })
  code!: RoleCode;

  @ApiProperty({ type: String, description: 'Nombre visible del rol.', example: 'Jefe de área' })
  name!: string;
}

/** Una acción del portal y si el actor puede hacerla según sus roles. */
export class MyCapabilityDto {
  @ApiProperty({
    enum: CapabilityKey,
    enumName: 'CapabilityKey',
    description: 'Clave estable de la acción.',
    example: 'request.triage',
  })
  key!: CapabilityKey;

  @ApiProperty({ type: String, description: 'Nombre de la acción.', example: 'Decidir el triage' })
  label!: string;

  @ApiProperty({ type: String, description: 'Qué implica la acción, en una frase.' })
  description!: string;

  @ApiProperty({ type: String, description: 'Agrupador para mostrar.', example: 'Demanda' })
  group!: string;

  @ApiProperty({
    enum: ['PROCESS', 'AREA', 'SYSTEM'],
    description:
      'Dónde aplica: en los procesos donde tienes rol, en toda el área o en la configuración del sistema.',
  })
  scope!: 'PROCESS' | 'AREA' | 'SYSTEM';

  @ApiProperty({ type: Boolean, description: 'true si alguno de tus roles la permite.' })
  allowed!: boolean;

  @ApiProperty({ type: [MyCapabilityRoleDto], description: 'Roles que pueden hacerla.' })
  allowedRoles!: MyCapabilityRoleDto[];
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

  @ApiProperty({
    enum: RoleCode,
    isArray: true,
    description: 'Codigos de rol efectivos del actor (incluye ADMIN si aplica).',
  })
  roleCodes!: RoleCode[];

  @ApiProperty({
    type: Boolean,
    description:
      'Si es true, la persona debe cambiar su contraseña antes de usar el portal: toda ruta salvo este endpoint y POST /auth/change-password responde 403 con code PASSWORD_CHANGE_REQUIRED.',
    example: false,
  })
  mustChangePassword!: boolean;

  @ApiProperty({
    type: [MyCapabilityDto],
    description:
      'Acciones del portal y si las puedes hacer según tus roles. Incluye todas, permitidas o no, en orden fijo.',
  })
  capabilities!: MyCapabilityDto[];
}
