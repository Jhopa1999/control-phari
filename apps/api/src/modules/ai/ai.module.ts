import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequestModule } from '../request/request.module';
import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';
import { AiModelCatalogService } from './ai-model-catalog.service';
import { AiUsageService } from './ai-usage.service';
import { TriageSuggestionController } from './triage-suggestion.controller';
import { TriageSuggestionService } from './triage-suggestion.service';
import { AwsBedrockClient, BEDROCK_CLIENT } from './bedrock.client';

/**
 * Modulo de IA (IA Fase 1, FEAT-001). Monolito modular: NO es global.
 *
 * - AuthModule aporta CurrentUserGuard/RolesGuard (@Roles).
 * - AuditModule aporta AuditService (auditoria AI_CONFIG).
 * - RequestModule exporta RequestStateService (requireInScope para la
 *   sugerencia de triage).
 * - El cliente de Bedrock se inyecta por el token BEDROCK_CLIENT para poder
 *   sustituirlo por un doble en tests; la impl real es AwsBedrockClient.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule, RequestModule],
  controllers: [AiConfigController, TriageSuggestionController],
  providers: [
    AiConfigService,
    AiModelCatalogService,
    AiUsageService,
    TriageSuggestionService,
    { provide: BEDROCK_CLIENT, useClass: AwsBedrockClient },
  ],
  // El asistente (AssistantModule) reutiliza el cliente de Bedrock, el catalogo
  // de modelos y el registro de consumo/presupuesto.
  exports: [BEDROCK_CLIENT, AiModelCatalogService, AiUsageService],
})
export class AiModule {}
