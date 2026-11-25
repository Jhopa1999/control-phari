import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequestModule } from '../request/request.module';
import { NotificationModule } from '../notification/notification.module';
import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';
import { AiModelCatalogService } from './ai-model-catalog.service';
import { AiUsageService } from './ai-usage.service';
import { TriageSuggestionController } from './triage-suggestion.controller';
import { TriageSuggestionService } from './triage-suggestion.service';
import { CoordinationScopeService } from '../coordination/coordination-scope.service';
import { MeetingAiController } from '../coordination/meeting/meeting-ai.controller';
import { MeetingAiService } from '../coordination/meeting/meeting-ai.service';
import {
  AwsBedrockClient,
  BEDROCK_CLIENT,
  type BedrockClient,
} from './bedrock.client';
import {
  isSimulatedModelEnabled,
  MODEL_SIMULATED,
  SimulatedBedrockClient,
} from './simulated-bedrock.client';

/**
 * Modulo de IA (IA Fase 1, FEAT-001). Monolito modular: NO es global.
 *
 * - AuthModule aporta CurrentUserGuard/RolesGuard (@Roles).
 * - AuditModule aporta AuditService (auditoria AI_CONFIG).
 * - RequestModule exporta RequestStateService (requireInScope para la
 *   sugerencia de triage).
 * - CoordinationScopeService (personas del proceso) sirve a la ayuda de IA del
 *   acta, `MeetingAiController`.
 * - El cliente de Bedrock se inyecta por el token BEDROCK_CLIENT para poder
 *   sustituirlo por un doble en tests; la impl real es AwsBedrockClient.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    RequestModule,
    NotificationModule,
  ],
  controllers: [AiConfigController, TriageSuggestionController, MeetingAiController],
  providers: [
    AiConfigService,
    AiModelCatalogService,
    AiUsageService,
    TriageSuggestionService,
    MeetingAiService,
    // Sin estado y solo con Prisma: se registra aquí en vez de importar
    // CoordinationModule (arrastra @nestjs/schedule, ESM, a las pruebas de la IA).
    CoordinationScopeService,
    // Modo de simulación (FEAT-007): solo fuera de producción y con
    // ASSISTANT_MODEL_PROVIDER=simulated. Una sola evaluación por arranque.
    { provide: MODEL_SIMULATED, useFactory: () => isSimulatedModelEnabled() },
    {
      provide: BEDROCK_CLIENT,
      useFactory: (simulated: boolean): BedrockClient =>
        simulated ? new SimulatedBedrockClient() : new AwsBedrockClient(),
      inject: [MODEL_SIMULATED],
    },
  ],
  // El asistente (AssistantModule) reutiliza el cliente de Bedrock, el catalogo
  // de modelos y el registro de consumo/presupuesto.
  exports: [BEDROCK_CLIENT, MODEL_SIMULATED, AiModelCatalogService, AiUsageService],
})
export class AiModule {}
