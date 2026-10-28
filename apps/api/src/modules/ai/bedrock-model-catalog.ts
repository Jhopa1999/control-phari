import { BadRequestException } from '@nestjs/common';

/**
 * Catalogo CERRADO de modelos de AWS Bedrock permitidos para los agentes de IA
 * (IA Fase 1, FEAT-001). Solo familia `anthropic.claude-*` servida en la region
 * us-east-2.
 *
 * IMPORTANTE: Claude 4.5 (Haiku/Sonnet) en Bedrock se sirve via PERFILES DE
 * INFERENCIA cross-region, cuyos IDs llevan el prefijo de region `us.`. Por eso
 * el `modelId` que invoca el SDK es el del perfil (`us.anthropic.claude-*`), no
 * el id "base" del modelo.
 *
 * NOTA: estos IDs son un SUPUESTO; hay que CONFIRMARLOS contra la consola de
 * Bedrock de la cuenta (region us-east-2). Son EDITABLES desde el Admin: si la
 * cuenta expone otros IDs, se añaden aqui a la lista cerrada y el agente los
 * puede seleccionar. No se hardcodea el modelo del agente: vive en BD.
 */
export const BEDROCK_MODEL_CATALOG = [
  // Default del agente de triage: economico y rapido.
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  // Opcion premium: mayor calidad de razonamiento.
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
] as const;

/** Tipo del `modelId` permitido (uno de los del catalogo cerrado). */
export type BedrockModelId = (typeof BEDROCK_MODEL_CATALOG)[number];

/**
 * Modelo por defecto del agente de triage (Claude Haiku). El seed lo usa como
 * valor inicial de `AiAgentConfig.model`; el Admin puede cambiarlo por cualquier
 * otro del catalogo.
 */
export const DEFAULT_TRIAGE_MODEL: BedrockModelId =
  'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/** Catalogo cerrado de codes de agente de IA (Fase 1: solo triage). */
export type AiAgentCode = 'TRIAGE';

/** Set para la verificacion O(1) sin exponer la estructura mutable. */
const ALLOWED = new Set<string>(BEDROCK_MODEL_CATALOG);

/**
 * Verifica que `model` pertenezca al catalogo cerrado. Lanza BadRequestException
 * (400) si no, con un mensaje accionable SIN filtrar la lista interna. Se usa al
 * guardar la config del agente desde el Admin.
 */
export function assertModelAllowed(model: string): void {
  if (!ALLOWED.has(model)) {
    throw new BadRequestException(
      'El modelo seleccionado no esta en el catalogo de modelos permitidos.',
    );
  }
}
