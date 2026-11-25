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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HeaderResponse, setPaginationHeaders } from '../../../common/pagination/pagination';
import { PAGINATION_RESPONSE_HEADERS } from '../../../common/pagination/pagination-openapi';
import { CommitmentService } from './commitment.service';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';
import { ListCommitmentsDto } from './dto/list-commitments.dto';
import { TransitionDto } from '../dto/transition.dto';
import { CommitmentResponseDto } from './dto/commitment-response.dto';
import { CommitmentMyWorkDto } from './dto/commitment-my-work.dto';
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
  @ApiOperation({
    summary:
      'Lista compromisos en alcance con filtros opcionales (estado, vista abiertos/vencidos/terminados, persona, acta, solicitud), búsqueda q (título, resultado esperado, acta o solicitud relacionada), orden por vencimiento (dir) y paginación page/pageSize. Sin page ni pageSize devuelve el listado completo con un tope de 1000 filas. La respuesta es siempre un arreglo; el total tras filtros llega en la cabecera X-Total-Count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Compromisos (la página pedida o hasta 1000 filas).',
    type: [CommitmentResponseDto],
    headers: PAGINATION_RESPONSE_HEADERS,
  })
  @ApiResponse({ status: 400, description: 'Filtros o paginación inválidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  async list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListCommitmentsDto,
    @Res({ passthrough: true }) res: HeaderResponse,
  ): Promise<CommitmentResponseDto[]> {
    const result = await this.commitmentService.list(actor, filters);
    setPaginationHeaders(res, result);
    return result.rows;
  }

  @Post()
  @ApiOperation({ summary: 'Crea un compromiso (vencimiento requerido).' })
  @ApiBody({ type: CreateCommitmentDto })
  @ApiResponse({ status: 201, description: 'Compromiso creado.', type: CommitmentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o proceso inexistente (jefe de área).' })
  @ApiResponse({
    status: 403,
    description:
      'El actor no pertenece al proceso indicado, o ligó el compromiso a un acta que no dirige (responsable, líder del proceso o jefe).',
  })
  @ApiResponse({ status: 404, description: 'Proceso o referencia fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateCommitmentDto,
  ) {
    return this.commitmentService.create(actor, dto);
  }

  @Get('my-work')
  @ApiOperation({
    summary:
      'Compromisos abiertos de la persona (vencidos, de hoy, próximos y posteriores) para Mi trabajo.',
  })
  @ApiResponse({ status: 200, description: 'Compromisos de Mi trabajo.', type: CommitmentMyWorkDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  myWork(@CurrentActor() actor: CurrentActorType) {
    return this.commitmentService.myWork(actor);
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
  @ApiResponse({
    status: 403,
    description:
      'Compromiso de un acta que el actor no dirige: solo puede registrar resultado y bloqueos.',
  })
  @ApiResponse({ status: 404, description: 'Compromiso o referencia fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommitmentDto,
  ) {
    return this.commitmentService.update(actor, id, dto);
  }

  @Post(':id/transition')
  @ApiOperation({
    summary:
      'Transiciona el estado de un compromiso (maquina minima). Al pasar a BLOQUEADO admite blockedReason (hasta 500 caracteres), que se guarda en los bloqueos del compromiso.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: TransitionDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: CommitmentResponseDto })
  @ApiResponse({ status: 400, description: 'Transicion no permitida o motivo de bloqueo con otro estado.' })
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
