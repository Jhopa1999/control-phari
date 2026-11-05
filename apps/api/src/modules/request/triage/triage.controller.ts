import {
  Body,
  Controller,
  Get,
  HttpCode,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TriageService } from './triage.service';
import { AssociateAssetDto } from './dto/associate-asset.dto';
import { CreateTriageDto } from './dto/create-triage.dto';
import { TriageContextQueryDto } from './dto/triage-context-query.dto';
import { TriageContextResponseDto } from './dto/triage-context-response.dto';
import { TriageResponseDto } from './dto/triage-response.dto';
import { RequestResponseDto } from '../dto/request-response.dto';
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
@Controller('requests/:id')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.ADMIN)
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Get('triage')
  @ApiOperation({
    summary:
      'Triage de la solicitud (0 o 1 fila en Fase 2) y responsables elegibles; admite previsualizar los de un proceso candidato.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Triage de la solicitud y candidatos elegibles como responsable.',
    type: TriageContextResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  findForRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TriageContextQueryDto,
  ) {
    return this.triageService.findForRequest(actor, id, query.mainProcessId);
  }

  @Post('triage')
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

  @Post('asset')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Asocia un activo EXISTENTE como base de la solicitud; requisito para priorizar. El triage no crea activos.',
    description:
      'Orden obligatorio triage -> activo: el activo se habilita contra el proceso principal de la solicitud, por lo que primero hay que fijar el proceso principal en el triage y luego asociar el activo. Si la solicitud aun no tiene proceso principal, responde 409 con el mensaje "Fija el proceso principal en el triage antes de asociar el activo." (sin llegar a consultar el activo). El triage no crea activos: solo asocia uno ya existente y visible para el actor.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AssociateAssetDto })
  @ApiResponse({ status: 200, description: 'Activo asociado.', type: RequestResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos (assetId no es UUID).' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud o activo fuera de alcance.' })
  @ApiResponse({
    status: 409,
    description:
      'La solicitud no admite asociar activo en su estado; o la solicitud aun no tiene proceso principal fijado en el triage (hay que fijarlo antes de asociar el activo); o el activo no esta habilitado para el proceso principal de la solicitud.',
  })
  associateAsset(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssociateAssetDto,
  ) {
    return this.triageService.associateAsset(actor, id, dto);
  }
}
