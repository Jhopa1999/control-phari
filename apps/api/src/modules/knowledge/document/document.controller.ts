import {
  Body,
  Controller,
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
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { ChangeDocumentStatusDto } from './dto/change-document-status.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { DocumentResponseDto } from './dto/document-response.dto';
import { DocumentVersionResponseDto } from './dto/document-version-response.dto';
import { DocumentContentResponseDto } from './dto/document-content-response.dto';
import { CurrentActor } from '../../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../../auth/current-actor';
import { CurrentUserGuard } from '../../auth/current-user.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RoleCode } from '../../auth/role-code';

/**
 * API REST de documentos (design §3.3). Documentos y versiones heredan el
 * alcance del activo (404 fuera); la autoridad por rol (403) y la maquina de
 * estado (400) se aplican en el service. Editar contenido = crear una nueva
 * version (AC-020). Rutas estaticas preceden a las parametricas.
 */
@ApiTags('documents')
@Controller('documents')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @ApiOperation({ summary: 'Lista documentos en alcance (filtros opcionales, sin contenido).' })
  @ApiResponse({ status: 200, description: 'Documentos.', type: [DocumentResponseDto] })
  @ApiResponse({ status: 400, description: 'Filtros invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListDocumentsDto,
  ) {
    return this.documentService.list(actor, filters);
  }

  @Get('pending-approval')
  @Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
  @ApiOperation({ summary: 'Documentos pendientes de aprobación dentro del alcance.' })
  @ApiResponse({ status: 200, description: 'Documentos pendientes.', type: [DocumentResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  pendingApproval(@CurrentActor() actor: CurrentActorType) {
    return this.documentService.pendingApproval(actor);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un documento + version 1 (contenido Markdown).' })
  @ApiBody({ type: CreateDocumentDto })
  @ApiResponse({ status: 201, description: 'Documento creado.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Activo fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Conflicto de concurrencia.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentService.createDocument(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadatos del documento + version vigente (sin contenido).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Documento.', type: DocumentResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  get(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentService.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita metadatos del documento (titulo/categoria; no estado ni contenido).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateDocumentDto })
  @ApiResponse({ status: 200, description: 'Documento actualizado.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentService.updateDocument(actor, id, dto);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Editar contenido = crear una nueva version (AC-020).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateDocumentVersionDto })
  @ApiResponse({ status: 201, description: 'Version creada.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'Conflicto de concurrencia.' })
  createVersion(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.documentService.createVersion(actor, id, dto);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Historial de versiones (sin contenido).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Versiones.', type: [DocumentVersionResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  listVersions(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentService.listVersions(actor, id);
  }

  @Get(':id/versions/:versionId/content')
  @ApiOperation({ summary: 'Contenido Markdown de una version (preview/descarga).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contenido de la version.', type: DocumentContentResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento o version fuera de alcance.' })
  getVersionContent(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.documentService.getVersionContent(actor, id, versionId);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Contenido Markdown de la version vigente (atajo).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contenido vigente.', type: DocumentContentResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance o sin contenido.' })
  getCurrentContent(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentService.getCurrentContent(actor, id);
  }

  @Post(':id/submit-approval')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envía el documento a aprobación (líder/jefe).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Documento pendiente de aprobación.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Transición no permitida.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'El proyecto está cerrado.' })
  submitForApproval(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentService.submitForApproval(actor, id);
  }

  @Post(':id/review')
  @HttpCode(200)
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({ summary: 'Aprueba o rechaza un documento pendiente (solo JEFE_AREA).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ReviewDocumentDto })
  @ApiResponse({ status: 200, description: 'Documento revisado.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Transición no permitida o falta el motivo del rechazo.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  review(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documentService.review(actor, id, dto);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Cambia el estado del documento (transicion valida; lider/jefe).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ChangeDocumentStatusDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Transicion no permitida.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Documento fuera de alcance.' })
  changeStatus(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeDocumentStatusDto,
  ) {
    return this.documentService.changeStatus(actor, id, dto);
  }
}
