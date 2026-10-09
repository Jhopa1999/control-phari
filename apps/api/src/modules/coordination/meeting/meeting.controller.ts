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
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { MeetingResponseDto } from './dto/meeting-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de reuniones (design §3). Los 3 roles tienen el modulo; alcance en el
 * service (404 fuera). Participantes limitados al alcance (400 si fuera).
 */
@ApiTags('meetings')
@Controller('meetings')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Get()
  @ApiOperation({ summary: 'Lista reuniones en alcance (filtros opcionales).' })
  @ApiResponse({ status: 200, description: 'Reuniones.', type: [MeetingResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListMeetingsDto,
  ) {
    return this.meetingService.list(actor, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una reunion (estado inicial BORRADOR).' })
  @ApiBody({ type: CreateMeetingDto })
  @ApiResponse({ status: 201, description: 'Reunion creada.', type: MeetingResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o participante fuera de alcance.' })
  @ApiResponse({ status: 404, description: 'Referencia fuera de alcance.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingService.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una reunion con participantes.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reunion.', type: MeetingResponseDto })
  @ApiResponse({ status: 404, description: 'Reunion fuera de alcance.' })
  get(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita una reunion (incluye set de participantes).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateMeetingDto })
  @ApiResponse({ status: 200, description: 'Reunion actualizada.', type: MeetingResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o participante fuera de alcance.' })
  @ApiResponse({ status: 404, description: 'Reunion fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingService.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra una reunion (cascade de participantes).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Reunion borrada.' })
  @ApiResponse({ status: 404, description: 'Reunion fuera de alcance.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.remove(actor, id);
  }
}
