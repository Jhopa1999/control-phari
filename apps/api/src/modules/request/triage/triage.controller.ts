import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TriageService } from './triage.service';
import { CreateTriageDto } from './dto/create-triage.dto';
import { TriageResponseDto } from './dto/triage-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST del triage (design §3.3). Rol: JEFE_AREA, LIDER_PROCESO (capacidad
 * `triage`); alcance por proceso principal en el service.
 */
@ApiTags('triage')
@Controller('requests/:id/triage')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Get()
  @ApiOperation({ summary: 'Triage de la solicitud (0 o 1 fila en Fase 2).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Triage de la solicitud.', type: [TriageResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  findForRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.triageService.findForRequest(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registra el triage (solo desde REGISTRADA; 2o POST -> 409).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateTriageDto })
  @ApiResponse({ status: 201, description: 'Triage registrado.', type: TriageResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o code maestro inexistente.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La solicitud no esta en REGISTRADA.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTriageDto,
  ) {
    return this.triageService.create(actor, id, dto);
  }
}
