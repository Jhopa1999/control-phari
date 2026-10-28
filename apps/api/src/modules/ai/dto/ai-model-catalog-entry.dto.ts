import { ApiProperty } from '@nestjs/swagger';
import type { BedrockModelTier } from '../bedrock-model-catalog';

/** Tiers posibles de un modelo del catalogo (para el enum de @ApiProperty). */
const MODEL_TIERS: readonly BedrockModelTier[] = ['default', 'premium', 'other'];

/**
 * Entrada del catalogo de modelos de Bedrock expuesta al Admin: `id` invocable,
 * `label` legible y `tier` orientativo. Permite que el selector del Admin
 * muestre nombres entendibles y marque el default/premium sin hardcodear la
 * lista en el frontend. Deriva de BEDROCK_MODEL_CATALOG (fuente de verdad en el
 * backend); no agrega modelos ni cambia el comportamiento del endpoint.
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
    enum: MODEL_TIERS,
    description: 'Categoria orientativa: default (recomendado), premium (mayor calidad) u other.',
  })
  tier!: BedrockModelTier;
}
