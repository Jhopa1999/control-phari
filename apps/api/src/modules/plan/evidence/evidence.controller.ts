import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
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
import {
  EvidenceDownloadDto,
  EvidenceResponseDto,
  UploadEvidenceDto,
} from './dto/evidence-response.dto';
import {
  EvidenceService,
  evidenceMaxBytes,
  type UploadedEvidenceFile,
} from './evidence.service';

/**
 * Evidencias (archivos) de una tarea. Los 3 roles pueden operar; el permiso
 * fino (responsable o lider) y el alcance los aplica el service.
 */
@ApiTags('tasks')
@Controller('tasks/:taskId/evidence')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las evidencias (archivos) de una tarea.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiResponse({ status: 200, type: [EvidenceResponseDto] })
  @ApiResponse({ status: 404, description: 'Tarea fuera de alcance.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.evidence.list(actor, taskId);
  }

  @Post()
  @ApiOperation({ summary: 'Adjunta un archivo de evidencia a la tarea (multipart).' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadEvidenceDto })
  @ApiResponse({ status: 201, type: EvidenceResponseDto })
  @ApiResponse({ status: 400, description: 'Archivo vacio, muy grande o de tipo no permitido.' })
  @ApiResponse({ status: 403, description: 'No eres responsable ni lider.' })
  @ApiResponse({ status: 409, description: 'Proyecto cerrado.' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: evidenceMaxBytes(process.env.EVIDENCE_MAX_BYTES), files: 1 },
    }),
  )
  upload(
    @CurrentActor() actor: CurrentActorType,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ) {
    return this.evidence.upload(actor, taskId, file);
  }

  @Get(':evidenceId/download')
  @ApiOperation({ summary: 'URL temporal para descargar una evidencia.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiParam({ name: 'evidenceId', format: 'uuid' })
  @ApiResponse({ status: 200, type: EvidenceDownloadDto })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  download(
    @CurrentActor() actor: CurrentActorType,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidence.download(actor, taskId, evidenceId);
  }

  @Delete(':evidenceId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quita una evidencia de la tarea.' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiParam({ name: 'evidenceId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Evidencia eliminada.' })
  @ApiResponse({ status: 403, description: 'No eres responsable ni lider.' })
  @ApiResponse({ status: 404, description: 'No existe o fuera de alcance.' })
  remove(
    @CurrentActor() actor: CurrentActorType,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidence.remove(actor, taskId, evidenceId);
  }
}
