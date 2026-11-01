import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
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
import { AssistantEvent, AssistantService } from './assistant.service';
import {
  AssistantStatusDto,
  ChatRequestDto,
  ConversationDetailDto,
  ConversationSummaryDto,
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
  constructor(private readonly assistant: AssistantService) {}

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
