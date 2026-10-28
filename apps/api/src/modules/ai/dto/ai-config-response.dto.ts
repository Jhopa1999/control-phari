import { ApiProperty } from '@nestjs/swagger';
import { AiGlobalConfigResponseDto } from './ai-global-config-response.dto';
import { AiAgentConfigResponseDto } from './ai-agent-config-response.dto';
import { AiModelCatalogEntryDto } from './ai-model-catalog-entry.dto';

/**
 * Respuesta combinada de GET /admin/ai/config: estado global + lista de agentes
 * + catalogo de modelos permitidos. Se declara con @ApiProperty en cada campo
 * para que OpenAPI genere la forma real (sin decorar, Swagger produce un objeto
 * vacio y el frontend no puede consumirla). Nunca incluye secretos: el estado
 * global solo expone `secretSet` y `accessKeyIdLast4`.
 */
export class AiConfigResponseDto {
  @ApiProperty({
    type: AiGlobalConfigResponseDto,
    description: 'Estado global de IA (encendido, modo de credenciales, secretSet, last4).',
  })
  global!: AiGlobalConfigResponseDto;

  @ApiProperty({
    type: [AiAgentConfigResponseDto],
    description: 'Agentes de IA configurados (Fase 1: TRIAGE).',
  })
  agents!: AiAgentConfigResponseDto[];

  @ApiProperty({
    type: [AiModelCatalogEntryDto],
    description: 'Catalogo cerrado de modelos de Bedrock permitidos para el selector del Admin.',
  })
  models!: AiModelCatalogEntryDto[];
}
