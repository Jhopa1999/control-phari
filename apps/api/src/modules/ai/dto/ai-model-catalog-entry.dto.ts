import { ApiProperty } from '@nestjs/swagger';
import {
  BEDROCK_MODEL_TIERS,
  type BedrockModelTier,
} from '../bedrock-model-catalog';

/**
 * Entrada del catalogo de modelos de IA expuesta al Admin: `id` invocable,
 * `label` legible, `tier` orientativo y las capacidades del modelo. Deriva de la
 * tabla `ai_model` (fuente de verdad en el backend).
 */
export class AiModelCatalogEntryDto {
  @ApiProperty({
    type: String,
    description: 'ID del modelo de Bedrock (perfil de inferencia) invocable por el agente.',
  })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre legible del modelo para el selector.' })
  label!: string;

  @ApiProperty({
    type: String,
    enum: BEDROCK_MODEL_TIERS,
    description: 'Categoria orientativa: default (recomendado), premium (mayor calidad) u other.',
  })
  tier!: BedrockModelTier;

  @ApiProperty({ type: Boolean, description: 'Si el modelo esta disponible para asignarse a agentes.' })
  enabled!: boolean;

  @ApiProperty({ type: Boolean, description: 'Si el modelo acepta el parametro temperature.' })
  supportsTemperature!: boolean;

  @ApiProperty({ type: Boolean, description: 'Si el modelo soporta tool use.' })
  supportsTools!: boolean;

  @ApiProperty({ type: Boolean, description: 'Si el modelo acepta imagenes.' })
  supportsVision!: boolean;

  @ApiProperty({ type: Boolean, description: 'Si el modelo acepta documentos.' })
  supportsDocuments!: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Precio en USD por millon de tokens de entrada, o null si no se conoce.',
  })
  inputUsdPerMTok!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Precio en USD por millon de tokens de salida, o null si no se conoce.',
  })
  outputUsdPerMTok!: number | null;
}
