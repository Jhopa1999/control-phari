import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { AiModelCatalogService } from '../ai/ai-model-catalog.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { BedrockClient, BedrockTimeoutError } from '../ai/bedrock.client';
import type { ConverseRequest, ConverseStreamEvent } from '../ai/bedrock-converse';
import {
  AssistantService,
  MAX_PROPOSALS_PER_TURN,
  MAX_TOOL_STEPS,
  titleFrom,
  toConverseHistory,
  type AssistantEvent,
} from './assistant.service';
import type {
  AssistantToolGateway,
  AssistantToolSession,
} from './assistant-tools';
import { AssistantProposalsService } from './assistant-proposals.service';

/**
 * Asistente: disponibilidad, validaciones previas al flujo, bucle de agente con
 * herramientas del MCP (solo lectura, con el token de la persona), consumo y
 * privacidad de las conversaciones. Bedrock, MCP y Prisma son dobles.
 */
const USER_ID = 'u-1';
const CONV_ID = '11111111-1111-4111-8111-111111111111';
const BEARER = 'Bearer token-de-prueba';

function actor(userId = USER_ID): CurrentActor {
  return {
    userId,
    name: 'Ana',
    identifier: 'ana@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

const USAGE = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

const done = (stopReason: 'end_turn' | 'tool_use'): ConverseStreamEvent => ({
  type: 'done',
  stopReason,
  usage: USAGE,
});

const AGENT = {
  id: 'a-1',
  code: 'ASISTENTE',
  enabled: true,
  region: 'us-east-2',
  model: 'm',
  basePrompt: 'Eres el asistente.',
  temperature: 0.3,
  maxTokens: 2048,
  timeoutMs: 60000,
};

interface Opts {
  configured?: boolean;
  globalEnabled?: boolean;
  agentEnabled?: boolean;
  exceeded?: boolean;
  /** Un array de eventos por cada llamada a converseStream. */
  streams?: ConverseStreamEvent[][];
  streamError?: Error;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    readOnly: boolean;
  }>;
  /** Propuestas ya registradas por conversacion (para getConversation). */
  proposalsByMessage?: Map<string, unknown[]>;
  callTool?: jest.Mock;
  history?: Array<{ role: string; text: string }>;
  ownedConversation?: boolean;
}

function makeDeps(opts: Opts = {}) {
  const messagesCreated: Array<Record<string, unknown>> = [];
  const prisma = {
    aiGlobalConfig: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'g-1',
        enabled: opts.globalEnabled ?? true,
        credentialMode: 'iam-role',
      }),
    },
    aiAgentConfig: {
      findUnique: jest.fn().mockResolvedValue({ ...AGENT, enabled: opts.agentEnabled ?? true }),
    },
    aiConversation: {
      create: jest.fn(async ({ data }: { data: { title: string } }) => ({
        id: CONV_ID,
        title: data.title,
      })),
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        (opts.ownedConversation ?? true) && where.userId === USER_ID
          ? { id: CONV_ID, title: 'Hola', userId: USER_ID }
          : null,
      ),
      findMany: jest.fn().mockResolvedValue([
        { id: CONV_ID, title: 'Hola', updatedAt: new Date('2026-11-02T10:00:00Z') },
      ]),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    aiMessage: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        messagesCreated.push(data);
        return { id: `msg-${messagesCreated.length}` };
      }),
      findMany: jest.fn().mockResolvedValue(
        (opts.history ?? [{ role: 'user', text: 'Hola' }]).slice().reverse(),
      ),
    },
  } as unknown as PrismaService;

  const queue = [...(opts.streams ?? [[{ type: 'text', text: 'Hola' } as ConverseStreamEvent, done('end_turn')]])];
  const converseStream = jest.fn(async function* (_request: ConverseRequest): AsyncGenerator<ConverseStreamEvent> {
    if (opts.streamError) throw opts.streamError;
    const events = queue.shift() ?? [done('end_turn')];
    for (const e of events) yield e;
  });
  const bedrock = { converseStream } as unknown as BedrockClient;

  const models = {
    supportsTemperature: jest.fn().mockResolvedValue(true),
  } as unknown as AiModelCatalogService;
  const usage = {
    budgetStatus: jest.fn().mockResolvedValue({ exceeded: opts.exceeded ?? false }),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AiUsageService;

  const session: AssistantToolSession = {
    listTools: jest.fn().mockResolvedValue(
      opts.tools ?? [
        { name: 'request.list', description: 'Lista', inputSchema: { type: 'object' }, readOnly: true },
      ],
    ),
    callTool: opts.callTool ?? jest.fn().mockResolvedValue({ text: '[{"id":"r1"}]', isError: false }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const gateway: AssistantToolGateway = {
    isConfigured: () => opts.configured ?? true,
    open: jest.fn().mockResolvedValue(session),
  };

  const proposals = {
    byMessage: jest.fn().mockResolvedValue(opts.proposalsByMessage ?? new Map()),
    create: jest.fn(async (input: Record<string, unknown>) => ({
      id: 'p-1',
      title: 'Crear solicitud',
      args: input.args,
      status: 'PENDIENTE',
      resultId: null,
      resultTitle: null,
      error: null,
      createdAt: '2026-11-02T10:00:00.000Z',
      toolName: input.toolName,
      summary: input.summary,
    })),
    attachToMessage: jest.fn().mockResolvedValue(undefined),
  } as unknown as AssistantProposalsService;
  const service = new AssistantService(prisma, bedrock, models, usage, gateway, proposals);
  return { service, prisma, converseStream, usage, session, gateway, messagesCreated, proposals };
}

async function runTurn(
  deps: ReturnType<typeof makeDeps>,
  message = 'Hola',
  signal = new AbortController().signal,
) {
  const run = await deps.service.prepareChat(actor(), BEARER, { message });
  const events: AssistantEvent[] = [];
  await run((e) => events.push(e), signal);
  return events;
}

describe('helpers', () => {
  it('titleFrom recorta con puntos suspensivos y colapsa espacios', () => {
    expect(titleFrom('  hola\n  mundo ')).toBe('hola mundo');
    const t = titleFrom('a'.repeat(100));
    expect(t.length).toBe(60);
    expect(t.endsWith('…')).toBe(true);
  });

  it('toConverseHistory une mensajes consecutivos del mismo rol y descarta assistant inicial', () => {
    const msgs = toConverseHistory([
      { role: 'assistant', text: 'suelto' },
      { role: 'user', text: 'uno' },
      { role: 'user', text: 'dos' },
      { role: 'assistant', text: 'tres' },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toHaveLength(2);
    expect(msgs[1].role).toBe('assistant');
  });
});

describe('AssistantService · disponibilidad', () => {
  it('sin MCP configurado no esta disponible', async () => {
    const { service } = makeDeps({ configured: false });
    expect(await service.getStatus()).toMatchObject({ available: false });
  });

  it('con la IA o el agente apagados no esta disponible', async () => {
    expect((await makeDeps({ globalEnabled: false }).service.getStatus()).available).toBe(false);
    expect((await makeDeps({ agentEnabled: false }).service.getStatus()).available).toBe(false);
  });

  it('con el presupuesto agotado no esta disponible y lo dice', async () => {
    const s = await makeDeps({ exceeded: true }).service.getStatus();
    expect(s.available).toBe(false);
    expect(s.reason).toMatch(/presupuesto/i);
  });

  it('disponible => reason null', async () => {
    expect(await makeDeps().service.getStatus()).toEqual({ available: true, reason: null });
  });
});

describe('AssistantService · prepareChat', () => {
  it('sin Bearer => 409', async () => {
    const { service } = makeDeps();
    await expect(service.prepareChat(actor(), undefined, { message: 'x' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.prepareChat(actor(), 'Basic abc', { message: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no disponible => 409 y NO abre el MCP ni crea conversacion', async () => {
    const deps = makeDeps({ exceeded: true });
    await expect(
      deps.service.prepareChat(actor(), BEARER, { message: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(deps.gateway.open).not.toHaveBeenCalled();
    expect(deps.prisma.aiConversation.create).not.toHaveBeenCalled();
  });

  it('crea la conversacion con el titulo del mensaje y guarda el mensaje del usuario', async () => {
    const deps = makeDeps();
    await deps.service.prepareChat(actor(), BEARER, { message: 'Estado de mis proyectos' });
    expect(
      (deps.prisma.aiConversation.create as jest.Mock).mock.calls[0][0].data,
    ).toEqual({ userId: USER_ID, title: 'Estado de mis proyectos' });
    expect(deps.messagesCreated[0]).toMatchObject({ role: 'user', text: 'Estado de mis proyectos' });
  });

  it('una conversacion ajena => 404', async () => {
    const deps = makeDeps({ ownedConversation: false });
    await expect(
      deps.service.prepareChat(actor(), BEARER, { message: 'x', conversationId: CONV_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AssistantService · turno', () => {
  it('respuesta simple: emite conversation, text y done; guarda el turno y registra consumo', async () => {
    const deps = makeDeps({
      streams: [[{ type: 'text', text: 'Hola ' }, { type: 'text', text: 'Ana' }, done('end_turn')]],
    });
    const events = await runTurn(deps);
    expect(events.map((e) => e.event)).toEqual(['conversation', 'text', 'text', 'done']);
    const saved = deps.messagesCreated.find((m) => m.role === 'assistant');
    expect(saved?.text).toBe('Hola Ana');
    expect(deps.usage.record).toHaveBeenCalledTimes(1);
    expect((deps.usage.record as jest.Mock).mock.calls[0][0]).toMatchObject({
      userId: USER_ID,
      agentCode: 'ASISTENTE',
      modelId: 'm',
    });
    expect(deps.session.close).toHaveBeenCalled();
    expect(deps.gateway.open).toHaveBeenCalledWith(BEARER);
  });

  it('usa herramientas: ejecuta la tool con el token, devuelve el resultado al modelo y sigue', async () => {
    const deps = makeDeps({
      streams: [
        [
          { type: 'toolUse', toolUseId: 't1', name: 'request.list', input: { state: 'REGISTRADA' } },
          done('tool_use'),
        ],
        [{ type: 'text', text: 'Hay 1 solicitud.' }, done('end_turn')],
      ],
    });
    const events = await runTurn(deps, 'Cuantas solicitudes hay?');
    expect(deps.session.callTool).toHaveBeenCalledWith('request.list', { state: 'REGISTRADA' });
    const tools = events.filter((e) => e.event === 'tool');
    expect(tools.map((e) => (e.data as { status: string }).status)).toEqual(['running', 'done']);
    expect((tools[0].data as { label: string }).label).toBe('solicitudes');

    // La segunda llamada al modelo recibe la tool use y su resultado.
    const second = deps.converseStream.mock.calls[1][0] as unknown as {
      messages: Array<{ role: string; content: Array<{ type: string }> }>;
    };
    const roles = second.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
    expect(second.messages[1].content.some((b) => b.type === 'toolUse')).toBe(true);
    expect(second.messages[2].content[0]).toMatchObject({ type: 'toolResult', toolUseId: 't1' });

    const saved = deps.messagesCreated.find((m) => m.role === 'assistant');
    expect(saved?.text).toBe('Hay 1 solicitud.');
    expect(saved?.tools).toEqual([{ name: 'request.list', label: 'solicitudes', status: 'done' }]);
    expect(deps.usage.record).toHaveBeenCalledTimes(2);
  });

  it('una tool que el MCP no ofrece al asistente NO se ejecuta', async () => {
    const callTool = jest.fn();
    const deps = makeDeps({
      callTool,
      streams: [
        [{ type: 'toolUse', toolUseId: 't1', name: 'user.create', input: {} }, done('tool_use')],
        [{ type: 'text', text: 'No puedo.' }, done('end_turn')],
      ],
    });
    const events = await runTurn(deps);
    expect(callTool).not.toHaveBeenCalled();
    const last = events.filter((e) => e.event === 'tool').pop();
    expect((last?.data as { status: string }).status).toBe('error');
  });

  it('si la tool falla, el turno continua con un resultado de error', async () => {
    const deps = makeDeps({
      callTool: jest.fn().mockRejectedValue(new Error('MCP caido')),
      streams: [
        [{ type: 'toolUse', toolUseId: 't1', name: 'request.list', input: {} }, done('tool_use')],
        [{ type: 'text', text: 'No pude consultar.' }, done('end_turn')],
      ],
    });
    const events = await runTurn(deps);
    expect(events[events.length - 1]?.event).toBe('done');
    const second = deps.converseStream.mock.calls[1][0] as unknown as {
      messages: Array<{ content: Array<{ isError?: boolean }> }>;
    };
    expect(second.messages[2].content[0].isError).toBe(true);
  });

  it('limita las rondas de herramientas por turno', async () => {
    const loop: ConverseStreamEvent[] = [
      { type: 'toolUse', toolUseId: 't', name: 'request.list', input: {} },
      done('tool_use'),
    ];
    const deps = makeDeps({ streams: Array.from({ length: MAX_TOOL_STEPS + 3 }, () => loop) });
    const events = await runTurn(deps);
    expect(deps.converseStream).toHaveBeenCalledTimes(MAX_TOOL_STEPS);
    expect(events[events.length - 1]?.event).toBe('done');
    const text = events
      .filter((e) => e.event === 'text')
      .map((e) => (e.data as { delta: string }).delta)
      .join('');
    expect(text).toMatch(/límite de consultas/i);
  });

  it('un fallo del modelo emite error amable, conserva lo generado y cierra el MCP', async () => {
    const deps = makeDeps({ streamError: new Error('boom con detalle interno') });
    const events = await runTurn(deps);
    const err = events.find((e) => e.event === 'error');
    expect((err?.data as { message: string }).message).not.toMatch(/boom/);
    expect(events.some((e) => e.event === 'done')).toBe(false);
    expect(deps.session.close).toHaveBeenCalled();
  });

  it('un timeout del modelo se informa como tal', async () => {
    const events = await runTurn(makeDeps({ streamError: new BedrockTimeoutError() }));
    const err = events.find((e) => e.event === 'error');
    expect((err?.data as { message: string }).message).toMatch(/a tiempo/i);
  });

  it('si la persona cancela, no emite done', async () => {
    const abort = new AbortController();
    abort.abort();
    const events = await runTurn(makeDeps(), 'Hola', abort.signal);
    expect(events.some((e) => e.event === 'done')).toBe(false);
  });

  it('el prompt de sistema incluye el del agente, la fecha y los roles de la persona', async () => {
    const deps = makeDeps();
    await runTurn(deps);
    const system = (deps.converseStream.mock.calls[0][0] as unknown as { system: string }).system;
    expect(system).toContain('Eres el asistente.');
    expect(system).toContain('Ana');
    expect(system).toContain(RoleCode.JEFE_AREA);
    expect(system).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('AssistantService · propuestas de acción', () => {
  const WRITE_TOOL = {
    name: 'request.create',
    description: 'Crea una solicitud',
    inputSchema: {
      type: 'object',
      properties: {
        body: {
          type: 'object',
          properties: { title: { type: 'string' }, mainProcessId: { type: 'string' } },
          required: ['title', 'mainProcessId'],
        },
      },
      required: ['body'],
    },
    readOnly: false,
  };
  const READ_TOOL = {
    name: 'request.list',
    description: 'Lista',
    inputSchema: { type: 'object' },
    readOnly: true,
  };
  const goodInput = {
    body: { title: 'Reporte de ventas', mainProcessId: 'proc-1' },
    resumen_para_la_persona: 'Crear la solicitud «Reporte de ventas» en BI',
  };

  function proposeStreams(input: unknown): ConverseStreamEvent[][] {
    return [
      [{ type: 'toolUse', toolUseId: 't1', name: 'request.create', input }, done('tool_use')],
      [{ type: 'text', text: 'Preparé la propuesta; confírmala.' }, done('end_turn')],
    ];
  }

  it('una tool de escritura NUNCA se ejecuta: registra la propuesta y la emite', async () => {
    const deps = makeDeps({ tools: [READ_TOOL, WRITE_TOOL], streams: proposeStreams(goodInput) });
    const events = await runTurn(deps, 'Crea una solicitud de reporte de ventas');

    expect(deps.session.callTool).not.toHaveBeenCalled();
    expect(deps.proposals.create).toHaveBeenCalledTimes(1);
    const created = (deps.proposals.create as jest.Mock).mock.calls[0][0];
    expect(created).toMatchObject({
      userId: USER_ID,
      toolName: 'request.create',
      summary: 'Crear la solicitud «Reporte de ventas» en BI',
    });
    // El resumen es solo para la persona: no viaja a la API.
    expect(created.args).toEqual({ body: { title: 'Reporte de ventas', mainProcessId: 'proc-1' } });

    const proposal = events.find((e) => e.event === 'proposal');
    expect((proposal?.data as { id: string }).id).toBe('p-1');
    // Las propuestas no aparecen como «herramientas consultadas».
    expect(events.filter((e) => e.event === 'tool')).toHaveLength(0);
    expect(events[events.length - 1].event).toBe('done');
  });

  it('el modelo recibe la tool de escritura como propuesta, con el campo de resumen obligatorio', async () => {
    const deps = makeDeps({ tools: [READ_TOOL, WRITE_TOOL] });
    await runTurn(deps);
    const request = deps.converseStream.mock.calls[0][0] as unknown as {
      tools: Array<{ name: string; description: string; inputSchema: { required: string[]; properties: Record<string, unknown> } }>;
      system: string;
    };
    const write = request.tools.find((t) => t.name === 'request.create');
    expect(write?.description).toMatch(/NO se ejecuta/);
    expect(write?.inputSchema.required).toContain('resumen_para_la_persona');
    expect(write?.inputSchema.properties).toHaveProperty('resumen_para_la_persona');
    // La de lectura no se toca.
    expect(request.tools.find((t) => t.name === 'request.list')?.description).toBe('Lista');
    expect(request.system).toMatch(/propuesta/i);
  });

  it('sin tools de escritura el prompt no habla de propuestas', async () => {
    const deps = makeDeps();
    await runTurn(deps);
    const system = (deps.converseStream.mock.calls[0][0] as unknown as { system: string }).system;
    expect(system).not.toMatch(/crean o modifican datos/);
  });

  it('sin el resumen para la persona se rechaza y se le explica al modelo', async () => {
    const deps = makeDeps({
      tools: [READ_TOOL, WRITE_TOOL],
      streams: proposeStreams({ body: { title: 'X', mainProcessId: 'p' } }),
    });
    await runTurn(deps);
    expect(deps.proposals.create).not.toHaveBeenCalled();
    const second = deps.converseStream.mock.calls[1][0] as unknown as {
      messages: Array<{ content: Array<{ type: string; text?: string; isError?: boolean }> }>;
    };
    const result = second.messages[2].content[0];
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/resumen_para_la_persona/);
  });

  it('faltan datos obligatorios: no hay propuesta y el modelo sabe cuáles', async () => {
    const deps = makeDeps({
      tools: [READ_TOOL, WRITE_TOOL],
      streams: proposeStreams({
        body: { title: 'Solo título' },
        resumen_para_la_persona: 'Crear algo',
      }),
    });
    await runTurn(deps);
    expect(deps.proposals.create).not.toHaveBeenCalled();
    const second = deps.converseStream.mock.calls[1][0] as unknown as {
      messages: Array<{ content: Array<{ text?: string }> }>;
    };
    expect(second.messages[2].content[0].text).toMatch(/body\.mainProcessId/);
  });

  it('limita las propuestas por turno', async () => {
    const many: ConverseStreamEvent[] = Array.from({ length: 7 }, (_, i) => ({
      type: 'toolUse' as const,
      toolUseId: `t${i}`,
      name: 'request.create',
      input: goodInput,
    }));
    const deps = makeDeps({
      tools: [READ_TOOL, WRITE_TOOL],
      streams: [[...many, done('tool_use')], [{ type: 'text', text: 'ok' }, done('end_turn')]],
    });
    await runTurn(deps);
    expect(deps.proposals.create).toHaveBeenCalledTimes(MAX_PROPOSALS_PER_TURN);
  });

  it('las propuestas se asocian al mensaje del asistente al guardarlo', async () => {
    const deps = makeDeps({ tools: [READ_TOOL, WRITE_TOOL], streams: proposeStreams(goodInput) });
    await runTurn(deps);
    expect(deps.proposals.attachToMessage).toHaveBeenCalledWith(['p-1'], expect.any(String));
  });

  it('getConversation incluye las propuestas de cada mensaje', async () => {
    const deps = makeDeps({
      proposalsByMessage: new Map([['m-1', [{ id: 'p-9', status: 'CONFIRMADA' }]]]),
    });
    (deps.prisma.aiMessage.findMany as jest.Mock).mockResolvedValue([
      { id: 'm-1', role: 'assistant', text: 'ok', tools: null, createdAt: new Date('2026-11-02T10:00:00Z') },
      { id: 'm-0', role: 'user', text: 'hola', tools: null, createdAt: new Date('2026-11-02T09:59:00Z') },
    ]);
    const detail = await deps.service.getConversation(actor(), CONV_ID);
    expect(detail.messages[0].proposals).toEqual([{ id: 'p-9', status: 'CONFIRMADA' }]);
    expect(detail.messages[1].proposals).toEqual([]);
  });
});

describe('AssistantService · ayuda del portal', () => {
  it('si el MCP ofrece help.search, el prompt le indica usarla para dudas de uso', async () => {
    const deps = makeDeps({
      tools: [
        { name: 'help.search', description: 'Ayuda', inputSchema: { type: 'object' }, readOnly: true },
      ],
    });
    await runTurn(deps);
    const system = (deps.converseStream.mock.calls[0][0] as unknown as { system: string }).system;
    expect(system).toContain('help.search');
  });

  it('sin help.search no se menciona (no se promete una herramienta que no existe)', async () => {
    const deps = makeDeps();
    await runTurn(deps);
    const system = (deps.converseStream.mock.calls[0][0] as unknown as { system: string }).system;
    expect(system).not.toContain('help.search');
  });
});

describe('AssistantService · conversaciones privadas', () => {
  it('lista solo las conversaciones de la persona', async () => {
    const deps = makeDeps();
    const list = await deps.service.listConversations(actor());
    expect(list).toEqual([{ id: CONV_ID, title: 'Hola', updatedAt: '2026-11-02T10:00:00.000Z' }]);
    expect(
      (deps.prisma.aiConversation.findMany as jest.Mock).mock.calls[0][0].where,
    ).toEqual({ userId: USER_ID });
  });

  it('otra persona no puede ver ni borrar una conversacion ajena (404)', async () => {
    const deps = makeDeps();
    await expect(deps.service.getConversation(actor('u-2'), CONV_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(deps.service.removeConversation(actor('u-2'), CONV_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.prisma.aiConversation.delete).not.toHaveBeenCalled();
  });

  it('el dueño la elimina', async () => {
    const deps = makeDeps();
    await deps.service.removeConversation(actor(), CONV_ID);
    expect(deps.prisma.aiConversation.delete).toHaveBeenCalledWith({ where: { id: CONV_ID } });
  });
});
