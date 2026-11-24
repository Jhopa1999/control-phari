import { AwsBedrockClient, BEDROCK_CLIENT } from './bedrock.client';
import type { ConverseRequest, ConverseStreamEvent } from './bedrock-converse';
import {
  isSimulatedModelEnabled,
  MODEL_SIMULATED,
  SIMULATED_INVOKE_TEXT,
  SimulatedBedrockClient,
} from './simulated-bedrock.client';
import { AiModule } from './ai.module';

function request(text: string): ConverseRequest {
  return {
    region: 'us-east-1',
    modelId: 'modelo',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'anterior' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'respuesta' }] },
      { role: 'user', content: [{ type: 'text', text }] },
    ],
    maxTokens: 100,
    timeoutMs: 1000,
  };
}

async function collect(
  stream: AsyncGenerator<ConverseStreamEvent>,
): Promise<ConverseStreamEvent[]> {
  const events: ConverseStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('SimulatedBedrockClient', () => {
  const client = new SimulatedBedrockClient();

  it('converseStream emite dos fragmentos de texto y un done con consumo fijo', async () => {
    const events = await collect(client.converseStream(request('Hola mundo')));
    expect(events.map((e) => e.type)).toEqual(['text', 'text', 'done']);
    const text = events
      .flatMap((e) => (e.type === 'text' ? [e.text] : []))
      .join('');
    expect(text).toContain('[Simulación]');
    expect(text).toContain('Hola mundo');
    const done = events[2];
    expect(done).toMatchObject({
      type: 'done',
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 10 },
    });
  });

  it('es determinista: la misma entrada produce la misma salida', async () => {
    const a = await collect(client.converseStream(request('igual')));
    const b = await collect(client.converseStream(request('igual')));
    expect(a).toEqual(b);
  });

  it('converse devuelve el mismo texto que el flujo, sin herramientas', async () => {
    const result = await client.converse(request('Hola'));
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    const streamed = (await collect(client.converseStream(request('Hola'))))
      .flatMap((e) => (e.type === 'text' ? [e.text] : []))
      .join('');
    expect((result.content[0] as { text: string }).text).toBe(streamed);
  });

  it('invoke devuelve un texto fijo y ping no falla', async () => {
    const input = {
      region: 'r',
      modelId: 'm',
      maxTokens: 1,
      timeoutMs: 1,
    };
    await expect(client.invoke({ ...input, prompt: 'x' })).resolves.toBe(
      SIMULATED_INVOKE_TEXT,
    );
    await expect(client.ping(input)).resolves.toBeUndefined();
  });

  it('sin mensaje de la persona responde igual con la advertencia', async () => {
    const result = await client.converse({ ...request('x'), messages: [] });
    expect((result.content[0] as { text: string }).text).toContain('[Simulación]');
  });
});

describe('isSimulatedModelEnabled (guarda de producción)', () => {
  const logger = { error: jest.fn() };
  beforeEach(() => logger.error.mockClear());

  it('desarrollo con la variable => simulado', () => {
    expect(
      isSimulatedModelEnabled(
        { ASSISTANT_MODEL_PROVIDER: 'simulated', NODE_ENV: 'development' },
        logger,
      ),
    ).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('sin NODE_ENV y con la variable => simulado', () => {
    expect(
      isSimulatedModelEnabled({ ASSISTANT_MODEL_PROVIDER: 'simulated' }, logger),
    ).toBe(true);
  });

  it('sin la variable => real, sin error', () => {
    expect(isSimulatedModelEnabled({ NODE_ENV: 'development' }, logger)).toBe(false);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('otro valor de la variable => real', () => {
    expect(
      isSimulatedModelEnabled({ ASSISTANT_MODEL_PROVIDER: 'aws' }, logger),
    ).toBe(false);
  });

  it('producción con la variable => real y registra un error', () => {
    expect(
      isSimulatedModelEnabled(
        { ASSISTANT_MODEL_PROVIDER: 'simulated', NODE_ENV: 'production' },
        logger,
      ),
    ).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('AiModule · selección del cliente', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  async function resolve(env: Record<string, string | undefined>) {
    process.env = { ...saved, ...env };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
    }
    const providers = Reflect.getMetadata('providers', AiModule) as Array<{
      provide?: unknown;
      useFactory?: (...a: unknown[]) => unknown;
    }>;
    const factory = (token: symbol) =>
      providers.find((p) => p.provide === token)!.useFactory!;
    const simulated = factory(MODEL_SIMULATED)();
    return Promise.resolve(factory(BEDROCK_CLIENT)(simulated));
  }

  it('desarrollo con la variable devuelve el simulado', async () => {
    expect(
      await resolve({ ASSISTANT_MODEL_PROVIDER: 'simulated', NODE_ENV: 'development' }),
    ).toBeInstanceOf(SimulatedBedrockClient);
  });

  it('sin variable devuelve el real', async () => {
    expect(
      await resolve({ ASSISTANT_MODEL_PROVIDER: undefined, NODE_ENV: 'development' }),
    ).toBeInstanceOf(AwsBedrockClient);
  });

  it('producción con la variable devuelve el real', async () => {
    expect(
      await resolve({ ASSISTANT_MODEL_PROVIDER: 'simulated', NODE_ENV: 'production' }),
    ).toBeInstanceOf(AwsBedrockClient);
  });
});
