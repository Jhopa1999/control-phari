/**
 * Valores por DEFECTO del catalogo de modelos de AWS Bedrock (BL-032 F0).
 *
 * La fuente de verdad del catalogo es la tabla `ai_model` (gestionable desde el
 * Admin sin desplegar, ver AiModelCatalogService). Esta lista solo SIEMBRA los
 * modelos iniciales al arrancar (idempotente y no destructivo: nunca pisa lo
 * que el admin haya cambiado).
 *
 * IMPORTANTE: Claude 4.5 y posteriores se sirven en Bedrock via PERFILES DE
 * INFERENCIA cross-region, cuyos IDs llevan el prefijo de region (`us.`). El
 * `modelId` que invoca el SDK es el del perfil, no el id "base" del modelo.
 */

/** Categoria del modelo, para que el Admin reconozca el default/premium. */
export type BedrockModelTier = 'default' | 'premium' | 'other';

/** Tiers validos (para validacion y para el enum de OpenAPI). */
export const BEDROCK_MODEL_TIERS: readonly BedrockModelTier[] = [
  'default',
  'premium',
  'other',
];

/** Modelo del catalogo con sus capacidades. */
export interface BedrockModelDefinition {
  /** `modelId` que invoca el SDK (perfil de inferencia cross-region). */
  modelId: string;
  /** Nombre legible para el selector del Admin. */
  label: string;
  tier: BedrockModelTier;
  /** Si el modelo acepta `temperature` (los Claude 5.x la rechazan). */
  supportsTemperature: boolean;
  /** Si el modelo soporta tool use (necesario para el asistente con MCP). */
  supportsTools: boolean;
  /** Si el modelo acepta imagenes como entrada. */
  supportsVision: boolean;
  /** Si el modelo acepta documentos (PDF, Excel...) como entrada. */
  supportsDocuments: boolean;
  sortOrder: number;
  /** USD por millon de tokens de entrada (null = sin precio conocido). */
  inputUsdPerMTok: number | null;
  /** USD por millon de tokens de salida (null = sin precio conocido). */
  outputUsdPerMTok: number | null;
}

/** Modelo por defecto del agente de triage (Claude Haiku). */
export const DEFAULT_TRIAGE_MODEL =
  'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/** Modelos sembrados al arrancar. */
export const DEFAULT_MODEL_CATALOG: readonly BedrockModelDefinition[] = [
  {
    modelId: DEFAULT_TRIAGE_MODEL,
    label: 'Claude Haiku 4.5 (económico, recomendado)',
    tier: 'default',
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsDocuments: true,
    sortOrder: 10,
    inputUsdPerMTok: 1,
    outputUsdPerMTok: 5,
  },
  {
    modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    label: 'Claude Sonnet 4.5 (mayor calidad)',
    tier: 'premium',
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsDocuments: true,
    sortOrder: 20,
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
  },
];

/** Catalogo cerrado de codes de agente de IA: triage y asistente del portal. */
export type AiAgentCode = 'TRIAGE' | 'ASISTENTE';
