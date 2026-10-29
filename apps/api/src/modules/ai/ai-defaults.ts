import { DEFAULT_TRIAGE_MODEL } from './bedrock-model-catalog';

/**
 * Valores por defecto de los agentes de IA (IA Fase 1, FEAT-001).
 *
 * Fuente unica: la usan el seed de Prisma y `AiConfigService.ensureDefaultAgents`
 * (que corre al arrancar la API). Asi un ambiente sin seed (p. ej. poblado por
 * SQL) no se queda sin agentes: el Admin solo puede EDITAR agentes existentes,
 * no crearlos.
 *
 * Los agentes nacen APAGADOS: la IA no hace nada hasta que el ADMIN la enciende
 * desde la plataforma. Lo que el admin cambie despues nunca se pisa (el `upsert`
 * usa `update` vacio).
 */

/** Code del agente de triage. */
export const TRIAGE_AGENT_CODE = 'TRIAGE';

/**
 * Prompt base semilla del agente de triage. Instruye a la IA a SUGERIR (no
 * decidir): salida JSON estricta, elegir SOLO entre los codes provistos en el
 * contexto y referenciar SOLO los requestId del contexto como posibles
 * duplicados. Editable desde el Admin.
 */
export const TRIAGE_BASE_PROMPT = [
  'Eres un asistente de triage para un portal de gestion de demanda.',
  'Tu tarea es SUGERIR (no decidir) la clasificacion de una solicitud a partir',
  'de su ficha y del contexto que se te entrega. El humano confirma: tus',
  'sugerencias son orientativas.',
  '',
  'Reglas estrictas:',
  '- Responde UNICAMENTE con un objeto JSON valido, sin texto adicional, sin',
  '  markdown y sin comentarios.',
  '- Para cada campo suggested*Code elige EXCLUSIVAMENTE un code presente en',
  '  catalogOptions de su maestra correspondiente; si ninguno aplica, usa null.',
  '  No inventes codes.',
  '- tentativePriorityBand debe ser uno de "P1", "P2", "P3", "P4" o null.',
  '- possibleDuplicates solo puede referenciar requestId presentes en',
  '  duplicateCandidates del contexto; no inventes solicitudes.',
  '- missingInformation es una lista de textos breves con la informacion que',
  '  falte para decidir.',
  '',
  'El objeto JSON debe tener exactamente estas claves:',
  'suggestedRouteCode, suggestedDemandTypeCode, suggestedCriticalityCode,',
  'suggestedSizeCode, suggestedDataAvailabilityCode (string o null),',
  'tentativePriorityBand (string o null), priorityRationale (string),',
  'possibleDuplicates (array de { requestId, title, confidence, reason }),',
  'missingInformation (array de strings), model (string), agentCode (string).',
].join('\n');

/** Forma de una fila `ai_agent_config` al crearla. */
export interface DefaultAgentConfig {
  code: string;
  displayName: string;
  enabled: boolean;
  region: string;
  model: string;
  basePrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

/** Agentes que deben existir siempre (hoy: solo triage). */
export const DEFAULT_AGENT_CONFIGS: readonly DefaultAgentConfig[] = [
  {
    code: TRIAGE_AGENT_CODE,
    displayName: 'Agente de triage',
    enabled: false,
    region: 'us-east-2',
    model: DEFAULT_TRIAGE_MODEL,
    basePrompt: TRIAGE_BASE_PROMPT,
    temperature: 0.2,
    maxTokens: 1024,
    timeoutMs: 20000,
  },
];
