import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { AdminUsersService } from './admin-users.service';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { SetAdminFlagDto } from './dto/set-admin-flag.dto';
/**
 * Gestion del rol de SISTEMA ADMIN sobre usuarios (design e.4). Protegido a
 * nivel de clase por @Roles(ADMIN): un JEFE_AREA NO puede autopromoverse (por
 * eso NO se añade isAdmin a UpdateUserDto del modulo user).
 */
@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}
  @Get()
  @ApiOperation({
    summary: 'Lista usuarios con su flag isAdmin (solo ADMIN).',
  })
  @ApiResponse({ status: 200, description: 'Usuarios.', type: [AdminUserResponseDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(): Promise<AdminUserResponseDto[]> {
    return this.adminUsersService.listUsers();
  }
  @Patch(':id/admin-flag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Promueve/degrada a un usuario como ADMIN de sistema (solo ADMIN). No permite degradar al ultimo admin activo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: SetAdminFlagDto })
  @ApiResponse({ status: 200, description: 'Flag actualizado.' })
  @ApiResponse({ status: 400, description: 'No puede degradar al ultimo administrador activo.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async setAdminFlag(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAdminFlagDto,
  ): Promise<void> {
    await this.adminUsersService.setAdminFlag(actor, id, dto.isAdmin);
  }
}
