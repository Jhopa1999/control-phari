import { Logger } from '@nestjs/common';
import type {
  BedrockClient,
  BedrockInvocation,
} from './bedrock.client';
import type {
  ConverseRequest,
  ConverseResult,
  ConverseStreamEvent,
  ConverseUsage,
} from './bedrock-converse';

/**
 * Modo de simulación del modelo (FEAT-007). Sustituye a AwsBedrockClient en
 * ambientes NO productivos (desarrollo y CI) para ejercitar el chat del
 * Asistente de punta a punta sin credenciales de AWS ni costo. No hace llamadas
 * de red ni solicita herramientas.
 */

/** Variable de entorno que selecciona el proveedor del modelo. */
export const ASSISTANT_MODEL_PROVIDER_ENV = 'ASSISTANT_MODEL_PROVIDER';

/** Valor que activa la simulación. */
export const SIMULATED_PROVIDER = 'simulated';

/** Token de inyección: `true` cuando el modelo simulado está activo. */
export const MODEL_SIMULATED = Symbol('MODEL_SIMULATED');

/** Texto fijo que devuelve `invoke` (sugerencias, triage). */
export const SIMULATED_INVOKE_TEXT = '[Simulación] Respuesta simulada del modelo.';

/** Consumo fijo y pequeño para que el registro y el presupuesto se ejerciten. */
export const SIMULATED_USAGE: ConverseUsage = {
  inputTokens: 10,
  outputTokens: 10,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

/**
 * ¿Está activa la simulación? Solo si ASSISTANT_MODEL_PROVIDER es `simulated` y
 * NODE_ENV no es `production`. En producción la variable no tiene efecto: se
 * registra un error y se usa el cliente real (no se aborta el arranque, mismo
 * criterio que `parseCorsOrigins`).
 */
export function isSimulatedModelEnabled(
  env: NodeJS.ProcessEnv = process.env,
  logger: Pick<Logger, 'error'> = new Logger('AssistantModel'),
): boolean {
  if (env[ASSISTANT_MODEL_PROVIDER_ENV] !== SIMULATED_PROVIDER) {
    return false;
  }
  if (env.NODE_ENV === 'production') {
    logger.error(
      `${ASSISTANT_MODEL_PROVIDER_ENV}=${SIMULATED_PROVIDER} se ignora en producción; se usa el modelo real.`,
    );
    return false;
  }
  return true;
}

/** Último texto escrito por la persona, o cadena vacía. */
function lastUserText(input: ConverseRequest): string {
  for (let i = input.messages.length - 1; i >= 0; i -= 1) {
    const message = input.messages[i];
    if (message.role !== 'user') continue;
    const texts = message.content.flatMap((block) =>
      block.type === 'text' ? [block.text] : [],
    );
    if (texts.length > 0) return texts.join(' ').trim();
  }
  return '';
}

/** Texto de respuesta determinista: eco del último mensaje. */
function simulatedReply(input: ConverseRequest): string {
  const echo = lastUserText(input);
  return echo
    ? `[Simulación] Recibí tu mensaje: «${echo}». Esta respuesta no viene de un modelo real.`
    : '[Simulación] Esta respuesta no viene de un modelo real.';
}

/** Divide el texto en dos fragmentos (por la mitad, sin cortar el orden). */
function splitInTwo(text: string): [string, string] {
  const middle = Math.ceil(text.length / 2);
  return [text.slice(0, middle), text.slice(middle)];
}

/** Cliente de IA simulado: determinista, sin red, sin herramientas. */
export class SimulatedBedrockClient implements BedrockClient {
  invoke(_input: BedrockInvocation): Promise<string> {
    return Promise.resolve(SIMULATED_INVOKE_TEXT);
  }

  ping(_input: Omit<BedrockInvocation, 'prompt'>): Promise<void> {
    return Promise.resolve();
  }

  converse(input: ConverseRequest): Promise<ConverseResult> {
    return Promise.resolve({
      content: [{ type: 'text', text: simulatedReply(input) }],
      stopReason: 'end_turn',
      usage: { ...SIMULATED_USAGE },
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async *converseStream(
    input: ConverseRequest,
  ): AsyncGenerator<ConverseStreamEvent> {
    const [first, second] = splitInTwo(simulatedReply(input));
    yield { type: 'text', text: first };
    yield { type: 'text', text: second };
    yield { type: 'done', stopReason: 'end_turn', usage: { ...SIMULATED_USAGE } };
  }
}
