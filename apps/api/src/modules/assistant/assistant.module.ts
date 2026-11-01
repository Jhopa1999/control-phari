import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { AssistantController } from './assistant.controller';
import { AssistantProposalsService } from './assistant-proposals.service';
import { AssistantService } from './assistant.service';
import { ASSISTANT_TOOL_GATEWAY } from './assistant-tools';
import { McpToolGateway } from './mcp-tool-gateway';

/**
 * Modulo del asistente de IA (BL-032 F2). Reutiliza del modulo de IA el cliente
 * de Bedrock, el catalogo de modelos y el registro de consumo/presupuesto. Las
 * herramientas llegan por el MCP del portal (ASSISTANT_TOOL_GATEWAY).
 */
@Module({
  imports: [PrismaModule, AuthModule, AiModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantProposalsService,
    { provide: ASSISTANT_TOOL_GATEWAY, useClass: McpToolGateway },
  ],
})
export class AssistantModule {}
