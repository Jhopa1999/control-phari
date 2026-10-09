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
import { CommitmentService } from './commitment.service';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';
import { ListCommitmentsDto } from './dto/list-commitments.dto';
import { TransitionDto } from '../dto/transition.dto';
import { CommitmentResponseDto } from './dto/commitment-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de compromisos (design §3). Los 3 roles tienen el modulo; alcance en
 * el service (404 fuera) y maquina de estado (400 salto invalido). Rutas
 * estaticas (`/commitments`) y parametricas no colisionan.
 */
@ApiTags('commitments')
@Controller('commitments')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class CommitmentController {
  constructor(private readonly commitmentService: CommitmentService) {}

  @Get()
  @ApiOperation({ summary: 'Lista compromisos en alcance (filtros opcionales).' })
  @ApiResponse({ status: 200, description: 'Compromisos.', type: [CommitmentResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListCommitmentsDto,
  ) {
    return this.commitmentService.list(actor, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un compromiso (vencimiento requerido).' })
  @ApiBody({ type: CreateCommitmentDto })
  @ApiResponse({ status: 201, description: 'Compromiso creado.', type: CommitmentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Proceso o referencia fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateCommitmentDto,
  ) {
    return this.commitmentService.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un compromiso.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Compromiso.', type: CommitmentResponseDto })
  @ApiResponse({ status: 404, description: 'Compromiso fuera de alcance.' })
  get(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commitmentService.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un compromiso.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateCommitmentDto })
  @ApiResponse({ status: 200, description: 'Compromiso actualizado.', type: CommitmentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 404, description: 'Compromiso o referencia fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommitmentDto,
  ) {
    return this.commitmentService.update(actor, id, dto);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transiciona el estado de un compromiso (maquina minima).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: TransitionDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: CommitmentResponseDto })
  @ApiResponse({ status: 400, description: 'Transicion no permitida.' })
  @ApiResponse({ status: 404, description: 'Compromiso fuera de alcance.' })
  transition(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    return this.commitmentService.transition(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra un compromiso en alcance (204 sin body).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Compromiso borrado.' })
  @ApiResponse({ status: 404, description: 'Compromiso fuera de alcance.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commitmentService.remove(actor, id);
  }
}
