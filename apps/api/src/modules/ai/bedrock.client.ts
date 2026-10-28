import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Cliente de IA (AWS Bedrock) AISLADO tras una interfaz (IA Fase 1, FEAT-001).
 * El resto del backend depende SOLO de esta interfaz y del token de inyeccion
 * `BEDROCK_CLIENT`, nunca del SDK directamente. Asi los servicios se prueban con
 * un doble sin red y el proveedor queda intercambiable.
 */

/** Credenciales estaticas (modo `access-keys`). Si se omiten, se usa el rol IAM. */
export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/** Parametros de una invocacion a Bedrock. `credentials` ausente => rol IAM. */
export interface BedrockInvocation {
  region: string;
  modelId: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  credentials?: BedrockCredentials;
}

/**
 * Contrato del cliente de IA. `invoke` devuelve el texto crudo del modelo (el
 * service lo parsea/valida). `ping` comprueba la conectividad/credenciales con
 * una llamada minima y no devuelve contenido.
 */
export interface BedrockClient {
  invoke(input: BedrockInvocation): Promise<string>;
  ping(input: Omit<BedrockInvocation, 'prompt'>): Promise<void>;
}

/** Token de inyeccion para sustituir el cliente por un doble en tests. */
export const BEDROCK_CLIENT = Symbol('BEDROCK_CLIENT');

/**
 * Error que marca un timeout de la invocacion (AbortController). El service lo
 * traduce a 503 sin filtrar detalle; aqui solo se distingue del resto de fallos.
 */
export class BedrockTimeoutError extends Error {
  constructor() {
    super('La invocacion a Bedrock excedio el tiempo limite.');
    this.name = 'BedrockTimeoutError';
  }
}

/**
 * Implementacion real sobre `@aws-sdk/client-bedrock-runtime` usando la Converse
 * API (interfaz uniforme para modelos de mensajes como Claude). El cliente del
 * SDK se crea POR LLAMADA porque la region y las credenciales son datos de
 * configuracion que pueden cambiar en runtime desde el Admin; no se cachea un
 * cliente con credenciales. El timeout se aplica con un AbortController.
 */
export class AwsBedrockClient implements BedrockClient {
  async invoke(input: BedrockInvocation): Promise<string> {
    const { client, command } = this.buildCommand({
      region: input.region,
      modelId: input.modelId,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      credentials: input.credentials,
      prompt: input.prompt,
    });
    const response = await this.run(client, command, input.timeoutMs);
    return extractText(response);
  }

  async ping(input: Omit<BedrockInvocation, 'prompt'>): Promise<void> {
    // Un "ping" es una invocacion minima: un prompt trivial y pocos tokens. Si
    // las credenciales o la region son invalidas, el SDK lanza y el service lo
    // traduce a { ok:false } sin exponer detalle.
    const { client, command } = this.buildCommand({
      region: input.region,
      modelId: input.modelId,
      temperature: 0,
      maxTokens: 1,
      timeoutMs: input.timeoutMs,
      credentials: input.credentials,
      prompt: 'ping',
    });
    await this.run(client, command, input.timeoutMs);
  }

  private buildCommand(input: BedrockInvocation): {
    client: BedrockRuntimeClient;
    command: ConverseCommand;
  } {
    const client = new BedrockRuntimeClient({
      region: input.region,
      // Solo se pasan credenciales en modo access-keys; en iam-role se deja que
      // la cadena de proveedores del SDK resuelva el rol de la instancia.
      ...(input.credentials
        ? {
            credentials: {
              accessKeyId: input.credentials.accessKeyId,
              secretAccessKey: input.credentials.secretAccessKey,
            },
          }
        : {}),
    });
    const command = new ConverseCommand({
      modelId: input.modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: input.prompt }],
        },
      ],
      inferenceConfig: {
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      },
    });
    return { client, command };
  }

  private async run(
    client: BedrockRuntimeClient,
    command: ConverseCommand,
    timeoutMs: number,
  ): Promise<ConverseCommandOutput> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // `send` esta sobrecargado para toda la union de comandos; aqui siempre es
      // ConverseCommand, por eso se afina el tipo del resultado.
      const output = await client.send(command, {
        abortSignal: controller.signal,
      });
      return output as ConverseCommandOutput;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new BedrockTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timer);
      client.destroy();
    }
  }
}

/**
 * Extrae el texto del primer bloque de contenido de la respuesta Converse. Si no
 * hay texto, devuelve cadena vacia (el service lo trata como salida invalida).
 */
function extractText(response: ConverseCommandOutput): string {
  const blocks = response.output?.message?.content ?? [];
  for (const block of blocks) {
    if (typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}
