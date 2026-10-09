import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';
import { ValidationService } from './validation.service';
import { CreateValidationDto } from './dto/create-validation.dto';
import { ResolveBlockingDto } from './dto/resolve-blocking.dto';
import { ValidationResponseDto } from './dto/validation-response.dto';

/**
 * API REST de validaciones/evidencias (design §3.4). Lectura y registro
 * `frameworks` (3 roles: registrar NO aprueba gate, BR-008); resolver bloqueo
 * `review` (JEFE_AREA, LIDER_PROCESO). El alcance por proceso lo anade
 * GovernanceScopeService dentro del service.
 */
@ApiTags('governance-validations')
@Controller('requests')
@UseGuards(CurrentUserGuard, RolesGuard)
export class ValidationController {
  constructor(private readonly service: ValidationService) {}

  @Get(':id/validations')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Historial de validaciones de la solicitud.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: [ValidationResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  findForRequest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findForRequest(actor, id);
  }

  @Post(':id/validations')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
  @ApiOperation({ summary: 'Registrar una validacion/evidencia (NO aprueba gate, BR-008).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateValidationDto })
  @ApiResponse({ status: 201, type: ValidationResponseDto })
  @ApiResponse({ status: 400, description: 'Catalogo invalido o evidencia incoherente.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud/documento fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateValidationDto,
  ) {
    return this.service.create(actor, id, dto);
  }

  @Patch(':id/validations/:validationId/resolve-blocking')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Resolver un defecto bloqueante (D-C5; NO aprueba gate).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'validationId', format: 'uuid' })
  @ApiBody({ type: ResolveBlockingDto })
  @ApiResponse({ status: 200, type: ValidationResponseDto })
  @ApiResponse({ status: 400, description: 'El registro no es un defecto bloqueante.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Validacion no encontrada.' })
  resolveBlocking(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('validationId', ParseUUIDPipe) validationId: string,
    @Body() dto: ResolveBlockingDto,
  ) {
    return this.service.resolveBlocking(actor, id, validationId, dto);
  }
}
