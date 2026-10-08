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
 * API REST de Grant. Concesion/revocacion = Plano B (solo JEFE_AREA); lectura
 * filtrada por el alcance del jefe (design 4.2). El lider NO concede grants.
 */
@ApiTags('grants')
@Controller('grants')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA)
export class GrantController {
  constructor(private readonly grantService: GrantService) {}

  @Get()
  @ApiOperation({ summary: 'Lista grants del alcance del jefe (solo JEFE_AREA).' })
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
  @ApiOperation({ summary: 'Concede un grant (solo JEFE_AREA).' })
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
  @ApiOperation({ summary: 'Revoca un grant (soft; solo JEFE_AREA).' })
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
