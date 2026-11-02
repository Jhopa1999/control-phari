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
  Req,
  Res,
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
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AssistantAttachmentsService, type UploadedAttachmentFile } from './assistant-attachments.service';
import { AssistantProposalsService } from './assistant-proposals.service';
import { MAX_UPLOAD_BYTES } from './assistant.constants';
import { AssistantEvent, AssistantService } from './assistant.service';
import {
  AssistantStatusDto,
  AttachmentDto,
  ChatRequestDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  ProposalDto,
  UpdateAttachmentDto,
  UploadAttachmentDto,
} from './dto/assistant.dto';

/** Parte de la peticion HTTP (Express) que usa el flujo SSE. */
interface SseRequest {
  headers: { authorization?: string };
}

/** Parte de la respuesta HTTP (Express) que usa el flujo SSE. */
interface SseResponse {
  writableEnded: boolean;
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): void;
  on(event: 'close', listener: () => void): unknown;
}

/** Serializa un evento en el formato Server-Sent Events. */
export function formatSse(event: AssistantEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * API del asistente de IA (BL-032 F2). Accesible a cualquier persona
 * autenticada; las conversaciones son privadas de su dueño y los datos que el
 * asistente consulta respetan el alcance de esa persona (usa su token).
 */
@ApiTags('assistant')
@Controller('assistant')
@UseGuards(CurrentUserGuard, RolesGuard)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly proposals: AssistantProposalsService,
    private readonly attachments: AssistantAttachmentsService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Indica si el asistente está disponible para usarse y, si no, el motivo.',
  })
  @ApiResponse({ status: 200, description: 'Disponibilidad.', type: AssistantStatusDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  getStatus(): Promise<AssistantStatusDto> {
    return this.assistant.getStatus();
  }

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Envía un mensaje al asistente y devuelve la respuesta en streaming (text/event-stream). Eventos: conversation, text, tool, done, error.',
  })
  @ApiBody({ type: ChatRequestDto })
  @ApiProduces('text/event-stream')
  @ApiResponse({ status: 200, description: 'Flujo de eventos del asistente.' })
  @ApiResponse({ status: 400, description: 'Mensaje vacío o demasiado largo.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Asistente desactivado, sin presupuesto o sin sesión con token.',
  })
  async chat(
    @CurrentActor() actor: CurrentActorType,
    @Req() req: SseRequest,
    @Res() res: SseResponse,
    @Body() dto: ChatRequestDto,
  ): Promise<void> {
    // Las validaciones lanzan HTTP 4xx ANTES de abrir el flujo.
    const run = await this.assistant.prepareChat(
      actor,
      req.headers.authorization,
      dto,
    );

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx no debe bufferizar el flujo.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    try {
      await run((event) => {
        if (!res.writableEnded) res.write(formatSse(event));
      }, abort.signal);
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Post('attachments')
  @ApiOperation({
    summary:
      'Sube un archivo (imagen o documento) para el chat: lo guarda y extrae su contenido como texto, que la persona puede revisar y editar antes de enviarlo.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAttachmentDto })
  @ApiResponse({ status: 201, description: 'Adjunto listo, con el texto extraído.', type: AttachmentDto })
  @ApiResponse({ status: 400, description: 'Archivo vacío, muy grande, de tipo no permitido o con contenido que no corresponde a su tipo.' })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  @ApiResponse({ status: 409, description: 'Asistente desactivado, sin presupuesto o con un modelo que no lee este tipo de archivo.' })
  @ApiResponse({ status: 422, description: 'El archivo no tiene contenido legible.' })
  @ApiResponse({ status: 502, description: 'No se pudo leer el archivo con el modelo.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  uploadAttachment(
    @CurrentActor() actor: CurrentActorType,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(actor, file);
  }

  @Patch('attachments/:id')
  @ApiOperation({
    summary: 'Corrige el texto extraído de un adjunto que aún no se envió.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateAttachmentDto })
  @ApiResponse({ status: 200, description: 'Adjunto actualizado.', type: AttachmentDto })
  @ApiResponse({ status: 400, description: 'Texto vacío o demasiado largo.' })
  @ApiResponse({ status: 404, description: 'No existe o no es de la persona.' })
  @ApiResponse({ status: 409, description: 'El adjunto ya se envió.' })
  updateAttachment(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttachmentDto,
  ): Promise<AttachmentDto> {
    return this.attachments.updateText(actor, id, dto.extractedText);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quita un adjunto que aún no se envió (y borra su archivo).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Adjunto eliminado.' })
  @ApiResponse({ status: 404, description: 'No existe o no es de la persona.' })
  @ApiResponse({ status: 409, description: 'El adjunto ya se envió.' })
  async removeAttachment(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.attachments.remove(actor, id);
  }

  @Post('proposals/:id/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Confirma una propuesta de acción del asistente y la ejecuta con los permisos de la persona. Solo la persona que la recibió puede confirmarla.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Propuesta resuelta: CONFIRMADA o FALLIDA (con el motivo).', type: ProposalDto })
  @ApiResponse({ status: 404, description: 'No existe o no es de la persona.' })
  @ApiResponse({ status: 409, description: 'Ya no está pendiente (vencida, confirmada o descartada) o falta sesión con token.' })
  confirmProposal(
    @CurrentActor() actor: CurrentActorType,
    @Req() req: SseRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProposalDto> {
    return this.proposals.confirm(actor, req.headers.authorization, id);
  }

  @Post('proposals/:id/discard')
  @HttpCode(200)
  @ApiOperation({ summary: 'Descarta una propuesta de acción del asistente sin ejecutarla.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Propuesta descartada.', type: ProposalDto })
  @ApiResponse({ status: 404, description: 'No existe o no es de la persona.' })
  @ApiResponse({ status: 409, description: 'Ya no está pendiente.' })
  discardProposal(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProposalDto> {
    return this.proposals.discard(actor, id);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Lista las conversaciones de la persona (las 50 más recientes).' })
  @ApiResponse({ status: 200, description: 'Conversaciones.', type: [ConversationSummaryDto] })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual valido.' })
  listConversations(
    @CurrentActor() actor: CurrentActorType,
  ): Promise<ConversationSummaryDto[]> {
    return this.assistant.listConversations(actor);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Obtiene una conversación propia con sus mensajes.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Conversación.', type: ConversationDetailDto })
  @ApiResponse({ status: 404, description: 'No existe o no es de la persona.' })
  getConversation(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailDto> {
    return this.assistant.getConversation(actor, id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina una conversación propia.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Conversación eliminada.' })
  @ApiResponse({ status: 404, description: 'No existe o no es de la persona.' })
  async removeConversation(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.assistant.removeConversation(actor, id);
  }
}
