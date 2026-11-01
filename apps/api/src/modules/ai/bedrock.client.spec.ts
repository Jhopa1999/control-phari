import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  AwsBedrockClient,
  BedrockTimeoutError,
  type BedrockInvocation,
} from './bedrock.client';
import type { ConverseRequest, ConverseStreamEvent } from './bedrock-converse';

/**
 * AwsBedrockClient con el SDK simulado (sin red): temperature opcional, Converse
 * con tools, streaming y timeout. Se espia `send` del cliente del SDK.
 */
describe('AwsBedrockClient', () => {
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(BedrockRuntimeClient.prototype, 'send');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const base: Omit<BedrockInvocation, 'prompt'> = {
    region: 'us-east-2',
    modelId: 'm',
    maxTokens: 100,
    timeoutMs: 1000,
  };

  const request: ConverseRequest = {
    region: 'us-east-2',
    modelId: 'm',
    system: 'Eres un asistente.',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }],
    tools: [{ name: 'request.list', description: 'Lista', inputSchema: { type: 'object' } }],
    maxTokens: 100,
    timeoutMs: 1000,
  };

  it('invoke sin temperature no la envia en inferenceConfig', async () => {
    send.mockResolvedValue({ output: { message: { content: [{ text: 'ok' }] } } });
    const text = await new AwsBedrockClient().invoke({ ...base, prompt: 'p' });
    expect(text).toBe('ok');
    const command = send.mock.calls[0][0] as ConverseCommand;
    expect(command.input.inferenceConfig).toEqual({ maxTokens: 100 });
  });

  it('invoke con temperature la envia', async () => {
    send.mockResolvedValue({ output: { message: { content: [{ text: 'ok' }] } } });
    await new AwsBedrockClient().invoke({ ...base, prompt: 'p', temperature: 0.2 });
    const command = send.mock.calls[0][0] as ConverseCommand;
    expect(command.input.inferenceConfig).toEqual({ temperature: 0.2, maxTokens: 100 });
  });

  it('converse envia system, tools con nombre codificado y devuelve tool use decodificado', async () => {
    send.mockResolvedValue({
      output: {
        message: {
          content: [
            { text: 'voy a consultar' },
            { toolUse: { toolUseId: 't1', name: 'request__list', input: {} } },
          ],
        },
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    const res = await new AwsBedrockClient().converse(request);
    const command = send.mock.calls[0][0] as ConverseCommand;
    expect(command.input.system).toEqual([{ text: 'Eres un asistente.' }]);
    expect(command.input.toolConfig?.tools?.[0].toolSpec?.name).toBe('request__list');
    expect(command.input.inferenceConfig).toEqual({ maxTokens: 100 });
    expect(res.stopReason).toBe('tool_use');
    expect(res.usage.inputTokens).toBe(10);
    expect(res.content[1]).toEqual({
      type: 'toolUse',
      toolUseId: 't1',
      name: 'request.list',
      input: {},
    });
  });

  it('converse sin tools no envia toolConfig', async () => {
    send.mockResolvedValue({ output: { message: { content: [] } }, stopReason: 'end_turn' });
    await new AwsBedrockClient().converse({ ...request, tools: undefined });
    const command = send.mock.calls[0][0] as ConverseCommand;
    expect(command.input.toolConfig).toBeUndefined();
  });

  it('converseStream emite los eventos del flujo', async () => {
    async function* stream() {
      yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hola' } } };
      yield { messageStop: { stopReason: 'end_turn' } };
      yield { metadata: { usage: { inputTokens: 3, outputTokens: 1 } } };
    }
    send.mockResolvedValue({ stream: stream() });
    const events: ConverseStreamEvent[] = [];
    for await (const e of new AwsBedrockClient().converseStream(request)) events.push(e);
    expect(send.mock.calls[0][0]).toBeInstanceOf(ConverseStreamCommand);
    expect(events[0]).toEqual({ type: 'text', text: 'Hola' });
    expect(events[1]).toMatchObject({ type: 'done', stopReason: 'end_turn' });
  });

  it('converse traduce el aborto por timeout a BedrockTimeoutError', async () => {
    send.mockImplementation(
      (_command: unknown, options: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener('abort', () => reject(new Error('abort')));
        }),
    );
    await expect(
      new AwsBedrockClient().converse({ ...request, timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(BedrockTimeoutError);
  });

  it('converseStream sin flujo lanza', async () => {
    send.mockResolvedValue({});
    const gen = new AwsBedrockClient().converseStream(request);
    await expect(gen.next()).rejects.toThrow();
  });
});
