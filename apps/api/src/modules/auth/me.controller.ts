import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from './current-actor.decorator';
import { CurrentActor as CurrentActorType } from './current-actor';
import { CurrentUserGuard } from './current-user.guard';
import { allowedModulesFor } from './module-matrix';
import { MyPermissionsResponseDto } from './dto/my-permissions-response.dto';

/**
 * Endpoint "Mis permisos" (SCR-23 / design 3.3). Requiere actor valido
 * (cualquier rol) y devuelve rol(es), procesos con alcance y modulos permitidos
 * derivados de MODULE_MATRIX, misma fuente que usa el frontend para el menu.
 */
@ApiTags('me')
@Controller('me')
@UseGuards(CurrentUserGuard)
export class MeController {
  @Get('permissions')
  @ApiOperation({ summary: 'Permisos del usuario actual (rol, alcance y modulos).' })
  @ApiResponse({ status: 200, description: 'Permisos del actor.', type: MyPermissionsResponseDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  getPermissions(@CurrentActor() actor: CurrentActorType): MyPermissionsResponseDto {
    return {
      userId: actor.userId,
      name: actor.name,
      identifier: actor.identifier,
      grants: actor.grants.map((grant) => ({
        processId: grant.processId,
        processCode: grant.processCode,
        processName: grant.processName,
        roleCode: grant.roleCode,
        roleName: grant.roleName,
      })),
      allowedModules: allowedModulesFor(actor.roleCodes),
    };
  }
}
