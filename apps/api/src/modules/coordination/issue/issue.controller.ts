import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IssueService } from './issue.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { ListIssuesDto } from './dto/list-issues.dto';
import { TransitionDto } from '../dto/transition.dto';
import { IssueResponseDto } from './dto/issue-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de novedades (design §3). Los 3 roles tienen el modulo; el alcance
 * (404 fuera) y la maquina de estado (400 salto invalido) se aplican en el
 * service. Rutas estaticas (`/issues`) y parametricas (`/issues/:id`,
 * `/issues/:id/transition`) no colisionan (literal antes del `:id`).
 */
@ApiTags('issues')
@Controller('issues')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Get()
  @ApiOperation({ summary: 'Lista novedades en alcance (filtros opcionales).' })
  @ApiResponse({ status: 200, description: 'Novedades.', type: [IssueResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListIssuesDto,
  ) {
    return this.issueService.list(actor, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una novedad (tipo por defecto BLOQUEO).' })
  @ApiBody({ type: CreateIssueDto })
  @ApiResponse({ status: 201, description: 'Novedad creada.', type: IssueResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Proceso o referencia fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateIssueDto,
  ) {
    return this.issueService.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una novedad.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Novedad.', type: IssueResponseDto })
  @ApiResponse({ status: 404, description: 'Novedad fuera de alcance.' })
  get(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.issueService.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita una novedad (un registro por incidente, AC-019).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateIssueDto })
  @ApiResponse({ status: 200, description: 'Novedad actualizada.', type: IssueResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Novedad o referencia fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.issueService.update(actor, id, dto);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transiciona el estado de una novedad (maquina minima).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: TransitionDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: IssueResponseDto })
  @ApiResponse({ status: 400, description: 'Transicion no permitida.' })
  @ApiResponse({ status: 404, description: 'Novedad fuera de alcance.' })
  transition(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    return this.issueService.transition(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra una novedad en alcance (204 sin body).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Novedad borrada.' })
  @ApiResponse({ status: 404, description: 'Novedad fuera de alcance.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.issueService.remove(actor, id);
  }
}
