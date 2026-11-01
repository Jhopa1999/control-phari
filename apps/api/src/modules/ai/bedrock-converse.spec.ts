import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import {
  fromBedrockToolName,
  fromSdkBlocks,
  mapConverseStream,
  mapStopReason,
  mapUsage,
  toBedrockToolName,
  toSdkMessages,
  toSdkToolConfig,
  type ConverseStreamEvent,
} from './bedrock-converse';

async function* flow(
  events: ConverseStreamOutput[],
): AsyncGenerator<ConverseStreamOutput> {
  for (const e of events) yield e;
}

async function collect(
  events: ConverseStreamOutput[],
): Promise<ConverseStreamEvent[]> {
  const out: ConverseStreamEvent[] = [];
  for await (const e of mapConverseStream(flow(events))) out.push(e);
  return out;
}

describe('nombres de tool', () => {
  it('codifica el punto del MCP al formato de Bedrock y viceversa', () => {
    expect(toBedrockToolName('request.list')).toBe('request__list');
    expect(toBedrockToolName('area-control.demand-summary')).toBe(
      'area-control__demand-summary',
    );
    expect(fromBedrockToolName('request__triage__get')).toBe('request.triage.get');
  });

  it('el nombre codificado solo usa caracteres validos para Bedrock', () => {
    expect(toBedrockToolName('governance.gc4.request-validation')).toMatch(
      /^[a-zA-Z0-9_-]+$/,
    );
  });
});

describe('peticion', () => {
  it('traduce mensajes con texto, imagen, documento, tool use y tool result', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const msgs = toSdkMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hola' },
          { type: 'image', format: 'png', bytes },
          { type: 'document', format: 'xlsx', name: 'plan', bytes },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'toolUse', toolUseId: 't1', name: 'request.get', input: { id: 'r1' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'toolResult', toolUseId: 't1', text: '{"ok":true}' },
          { type: 'toolResult', toolUseId: 't2', text: 'fallo', isError: true },
        ],
      },
    ]);
    expect(msgs[0].content?.[0]).toEqual({ text: 'hola' });
    expect(msgs[0].content?.[1]).toEqual({
      image: { format: 'png', source: { bytes } },
    });
    expect(msgs[0].content?.[2]).toEqual({
      document: { format: 'xlsx', name: 'plan', source: { bytes } },
    });
    expect(msgs[1].content?.[0]).toEqual({
      toolUse: { toolUseId: 't1', name: 'request__get', input: { id: 'r1' } },
    });
    expect(msgs[2].content?.[0]).toEqual({
      toolResult: { toolUseId: 't1', content: [{ text: '{"ok":true}' }], status: 'success' },
    });
    expect((msgs[2].content?.[1] as { toolResult: { status: string } }).toolResult.status).toBe(
      'error',
    );
  });

  it('toolConfig: undefined sin tools y nombres codificados con tools', () => {
    expect(toSdkToolConfig(undefined)).toBeUndefined();
    expect(toSdkToolConfig([])).toBeUndefined();
    const cfg = toSdkToolConfig([
      { name: 'request.list', description: 'Lista', inputSchema: { type: 'object' } },
    ]);
    expect(cfg?.tools?.[0]).toEqual({
      toolSpec: {
        name: 'request__list',
        description: 'Lista',
        inputSchema: { json: { type: 'object' } },
      },
    });
  });
});

describe('respuesta', () => {
  it('fromSdkBlocks conserva texto y tool use (decodificando el nombre) e ignora el resto', () => {
    const blocks = fromSdkBlocks([
      { text: 'listo' },
      { toolUse: { toolUseId: 't1', name: 'request__list', input: { state: 'X' } } },
      { reasoningContent: {} } as never,
    ]);
    expect(blocks).toEqual([
      { type: 'text', text: 'listo' },
      { type: 'toolUse', toolUseId: 't1', name: 'request.list', input: { state: 'X' } },
    ]);
    expect(fromSdkBlocks(undefined)).toEqual([]);
  });

  it('mapStopReason y mapUsage con valores desconocidos o ausentes', () => {
    expect(mapStopReason('tool_use')).toBe('tool_use');
    expect(mapStopReason('algo-nuevo')).toBe('other');
    expect(mapStopReason(undefined)).toBe('other');
    expect(mapUsage(undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    });
    expect(mapUsage({ inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 3 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 3,
      cacheWriteInputTokens: 0,
    });
  });
});

describe('mapConverseStream', () => {
  it('emite el texto incremental y un done con motivo y consumo', async () => {
    const events = await collect([
      { messageStart: { role: 'assistant' } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Ho' } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'la' } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'end_turn' } },
      { metadata: { usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 }, metrics: { latencyMs: 1 } } },
    ] as ConverseStreamOutput[]);
    expect(events).toEqual([
      { type: 'text', text: 'Ho' },
      { type: 'text', text: 'la' },
      {
        type: 'done',
        stopReason: 'end_turn',
        usage: { inputTokens: 7, outputTokens: 2, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
      },
    ]);
  });

  it('acumula el input troceado de una tool y la emite completa al cerrar el bloque', async () => {
    const events = await collect([
      { contentBlockStart: { contentBlockIndex: 1, start: { toolUse: { toolUseId: 't1', name: 'request__get' } } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"id":' } } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '"r1"}' } } } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { messageStop: { stopReason: 'tool_use' } },
    ] as ConverseStreamOutput[]);
    expect(events[0]).toEqual({
      type: 'toolUse',
      toolUseId: 't1',
      name: 'request.get',
      input: { id: 'r1' },
    });
    expect(events[1]).toMatchObject({ type: 'done', stopReason: 'tool_use' });
  });

  it('una tool sin argumentos llega con input {}', async () => {
    const events = await collect([
      { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: 't1', name: 'me__permissions' } } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
    ] as ConverseStreamOutput[]);
    expect(events[0]).toMatchObject({ type: 'toolUse', name: 'me.permissions', input: {} });
  });

  it('dos tools en bloques distintos no mezclan su input', async () => {
    const events = await collect([
      { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: 'a', name: 'x__a' } } } },
      { contentBlockStart: { contentBlockIndex: 1, start: { toolUse: { toolUseId: 'b', name: 'x__b' } } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"n":1}' } } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"n":2}' } } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { contentBlockStop: { contentBlockIndex: 1 } },
    ] as ConverseStreamOutput[]);
    expect(events[0]).toMatchObject({ toolUseId: 'a', input: { n: 1 } });
    expect(events[1]).toMatchObject({ toolUseId: 'b', input: { n: 2 } });
  });

  it('un evento de error del flujo lanza', async () => {
    await expect(
      collect([
        { throttlingException: { message: 'x' } },
      ] as unknown as ConverseStreamOutput[]),
    ).rejects.toThrow();
  });
});
