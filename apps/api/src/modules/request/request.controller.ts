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
import { HeaderResponse, setPaginationHeaders } from '../../common/pagination/pagination';
import { PAGINATION_RESPONSE_HEADERS } from '../../common/pagination/pagination-openapi';
import { RequestService } from './request.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestResponseDto } from './dto/request-response.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ResubmitRequestDto } from './dto/resubmit-request.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de Request (modulo `requests`, design §3.3). Accesible a los 3 roles
 * (sin @Roles extra), con alcance por proceso principal resuelto en el service.
 */
@ApiTags('requests')
@Controller('requests')
@UseGuards(CurrentUserGuard, RolesGuard)
export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista solicitudes dentro del alcance del actor (jefe y líder: todas; integrante: sus procesos más las que creó). Filtros opcionales de selección múltiple (state, mainProcessId con SIN_PROCESO, band), búsqueda q en código, título y solicitante, orden sort/dir y paginación page/pageSize. Sin page ni pageSize devuelve el listado completo con un tope de 1000 filas. La respuesta es siempre un arreglo; el total tras filtros llega en la cabecera X-Total-Count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de solicitudes (la página pedida o hasta 1000 filas).',
    type: [RequestResponseDto],
    headers: PAGINATION_RESPONSE_HEADERS,
  })
  @ApiResponse({ status: 400, description: 'Filtros, orden o paginación inválidos.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  async findMany(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListRequestsDto,
    @Res({ passthrough: true }) res: HeaderResponse,
  ): Promise<RequestResponseDto[]> {
    const result = await this.requestService.findMany(actor, filters);
    setPaginationHeaders(res, result);
    return result.rows;
  }

  // Va ANTES de `:id`: resuelve una solicitud por su ID visible (solo lectura).
  @Get('by-code/:code')
  @ApiOperation({
    summary:
      'Obtiene una solicitud por su ID visible (p. ej. PRY-0012), sin distinguir mayúsculas. Mismo alcance que el detalle por id.',
  })
  @ApiParam({ name: 'code', example: 'PRY-0012', description: 'ID visible de la solicitud.' })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'El código no tiene formato de solicitud.' })
  @ApiResponse({ status: 404, description: 'No existe o está fuera de alcance.' })
  findByCode(
    @CurrentActor() actor: CurrentActorType,
    @Param('code') code: string,
  ) {
    return this.requestService.findByCode(actor, code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene una solicitud por id (404 fuera de alcance).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada.', type: RequestResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o esta fuera de alcance.' })
  findOne(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestService.findOne(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una solicitud (estado REGISTRADA; BR-001).' })
  @ApiBody({ type: CreateRequestDto })
  @ApiResponse({ status: 201, description: 'Solicitud creada.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 404, description: 'Proceso principal fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateRequestDto,
  ) {
    return this.requestService.create(actor, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Elimina lógicamente una solicitud (JEFE_AREA/LIDER_PROCESO en su alcance).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Solicitud eliminada (lógicamente).' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  @ApiResponse({ status: 409, description: 'La solicitud está en ejecución o cerrada.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestService.remove(actor, id);
  }

  @Post(':id/resubmit')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reenvía a triage una solicitud devuelta (DEVUELTA → REGISTRADA). Lo hace quien la registró, el líder del proceso o el jefe de área; acepta correcciones de la ficha en el mismo paso, conserva el historial de triages y avisa a los jefes.',
  })
  @ApiBody({ type: ResubmitRequestDto, required: false })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitud reenviada; queda Registrada.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 403, description: 'Solo quien la registró, el líder del proceso o el jefe de área.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada o fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La solicitud no está devuelta.' })
  resubmit(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResubmitRequestDto,
  ) {
    return this.requestService.resubmit(actor, id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edita la ficha (no el estado); conserva fechas iniciales (BR-017). Registrada y Devuelta: quien la registró, el líder del proceso o el jefe; estados siguientes: solo líder o jefe; desde Comprometida exige justificación del cambio (mínimo 10 caracteres). Una solicitud Devuelta no cambia de estado al editarse: se reenvía con «Reenviar a triage».',
  })
  @ApiBody({ type: UpdateRequestDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitud actualizada.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos, id no UUID o justificación ausente o corta desde Comprometida.' })
  @ApiResponse({ status: 403, description: 'El actor no puede editar la solicitud en su estado actual.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  @ApiResponse({ status: 409, description: 'La solicitud está cerrada.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.requestService.update(actor, id, dto);
  }
}
