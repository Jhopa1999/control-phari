import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GrantService } from './grant.service';
import { CreateGrantDto } from './dto/create-grant.dto';
import { ListGrantsDto } from './dto/list-grants.dto';
import { GrantResponseDto } from './dto/grant-response.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de Grant. La jerarquia de asignacion/alcance se aplica en el
 * servicio (canAssignRole + alcance por proceso): ADMIN, JEFE_AREA y
 * LIDER_PROCESO pueden entrar al endpoint, y el servicio decide que roles
 * puede conceder/revocar cada actor y sobre que procesos. La lectura se filtra
 * por alcance (ADMIN ve todo; el resto solo sus procesos).
 */
@ApiTags('grants')
@Controller('grants')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.ADMIN, RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class GrantController {
  constructor(private readonly grantService: GrantService) {}

  @Get()
  @ApiOperation({ summary: 'Lista grants del alcance del actor (ADMIN ve todos).' })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'processId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Listado de grants.', type: [GrantResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  findMany(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListGrantsDto,
  ) {
    return this.grantService.findMany(actor, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Concede un grant (segun jerarquia y alcance del actor).' })
  @ApiBody({ type: CreateGrantDto })
  @ApiResponse({ status: 201, description: 'Grant creado o reactivado.', type: GrantResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Usuario o proceso inexistente.' })
  @ApiResponse({ status: 409, description: 'El grant ya existe y esta activo.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateGrantDto,
  ) {
    return this.grantService.create(actor, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoca un grant (soft; segun jerarquia y alcance del actor).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Grant revocado (devuelve el actualizado).', type: GrantResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Grant no encontrado.' })
  revoke(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.grantService.revoke(actor, id);
  }
}
