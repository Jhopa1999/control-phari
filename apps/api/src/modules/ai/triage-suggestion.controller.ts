import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';
import { TriageSuggestionService } from './triage-suggestion.service';
import { TriageSuggestionResponseDto } from './dto/triage-suggestion-response.dto';

/**
 * Sugerencia de IA para el triage (IA Fase 1, FEAT-001). Mismo prefijo y roles
 * que el triage humano (JEFE_AREA, LIDER_PROCESO, ADMIN); el subsegmento
 * estatico `ai/triage-suggestion` no colisiona con las rutas del TriageController
 * (que vive en el modulo request/). NO modifica el triage existente: solo
 * SUGIERE y no persiste.
 */
@ApiTags('ai-triage')
@Controller('requests/:id')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.ADMIN)
export class TriageSuggestionController {
  constructor(private readonly service: TriageSuggestionService) {}

  @Post('ai/triage-suggestion')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Sugiere (no persiste) campos de triage, banda de prioridad y posibles duplicados con IA. Degrada si la IA esta apagada o falla.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Sugerencia de triage.', type: TriageSuggestionResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Solicitud fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La sugerencia de IA esta desactivada o mal configurada.' })
  @ApiResponse({ status: 422, description: 'La IA devolvio una salida no interpretable.' })
  @ApiResponse({ status: 503, description: 'La IA no respondio a tiempo o no esta disponible.' })
  suggest(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TriageSuggestionResponseDto> {
    return this.service.suggest(actor, id);
  }
}
