import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { UserInviteService } from './user-invite.service';

/**
 * Invitacion/activacion de usuarios. Protegido por JEFE_AREA (mismo rol que
 * crea usuarios). La activacion la completa POST /auth/reset-password con el
 * token USER_INVITATION emitido aqui.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA)
export class UserInviteController {
  constructor(private readonly userInviteService: UserInviteService) {}

  @Post(':id/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Emite y envia la invitacion de activacion para un usuario (solo JEFE_AREA). El reenvio invalida el enlace previo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Invitacion emitida y enviada.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  invite(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.userInviteService.invite(actor, id);
  }
}
