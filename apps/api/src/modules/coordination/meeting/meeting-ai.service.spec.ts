import {
  ConflictException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { BedrockClient, BedrockTimeoutError } from '../../ai/bedrock.client';
import { AiModelCatalogService } from '../../ai/ai-model-catalog.service';
import { AiUsageService } from '../../ai/ai-usage.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import {
  MEETING_AI_MAX_COMMITMENTS,
  MEETING_AI_MAX_INPUT_CHARS,
  MeetingAiService,
} from './meeting-ai.service';

/**
 * Pruebas de la ayuda de IA del acta. El cliente del modelo es un doble que
 * devuelve JSON (el modo simulado solo responde un eco y no existe en producción).
 */
const PROCESS_ID = '11111111-1111-4111-8111-111111111111';
const MARTA = '22222222-2222-4222-8222-222222222222';
const LUIS = '33333333-3333-4333-8333-333333333333';

const actor: CurrentActor = {
  userId: 'u-1',
  name: 'Integrante',
  identifier: 'i@demo.local',
  grants: [],
  roleCodes: new Set([RoleCode.INTEGRANTE]),
  scopedProcessIds: new Set([PROCESS_ID]),
  isJefeArea: false,
  isLiderProceso: false,
  isAdmin: false,
};

const dto = {
  processId: PROCESS_ID,
  meetingDate: '2026-03-10',
  text: 'Marta enviará el informe el viernes. Se acordó mover el lanzamiento.',
  participantUserIds: [LUIS],
};

function modelOutput(overrides: Record<string, unknown> = {}) {
  return {
    agenda: 'Lanzamiento',
    decisions: 'Mover el lanzamiento',
    notes: '',
    commitments: [
      {
        title: 'Enviar el informe',
        assigneeAlias: 2,
        assigneeText: 'Marta',
        dueDate: '2026-03-13',
        expectedResult: null,
        sourceQuote: 'Marta enviará el informe el viernes',
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function makeService(opts: {
  global?: Record<string, unknown> | null;
  agent?: Record<string, unknown> | null;
  invoke?: () => Promise<string>;
  budgetExceeded?: boolean;
} = {}) {
  const writes = jest.fn();
  const prisma = {
    aiGlobalConfig: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.global === undefined ? { enabled: true, credentialMode: 'iam-role' } : opts.global,
        ),
    },
    aiAgentConfig: {
      findUnique: jest.fn().mockResolvedValue(
        opts.agent === undefined
          ? {
              code: 'ACTAS',
              enabled: true,
              region: 'us-east-2',
              model: 'modelo-actas',
              basePrompt: 'Ordena el acta.',
              temperature: 0.2,
              maxTokens: 4096,
              timeoutMs: 45000,
            }
          : opts.agent,
      ),
    },
    meeting: { create: writes, update: writes },
    commitment: { create: writes },
  } as unknown as PrismaService;
  const scope = {
    listProcessPeople: jest.fn().mockResolvedValue([
      { id: LUIS, name: 'Luis Peña', identifier: 'luis@demo.local' },
      { id: MARTA, name: 'Marta Ruiz', identifier: 'marta@demo.local' },
    ]),
  } as unknown as CoordinationScopeService;
  const invoke = opts.invoke ?? (async () => JSON.stringify(modelOutput()));
  const converse = jest.fn(async () => ({
    content: [{ type: 'text', text: await invoke() }],
    stopReason: 'end_turn',
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    },
  }));
  const bedrock = { converse, ping: jest.fn() } as unknown as BedrockClient;
  const models = {
    supportsTemperature: jest.fn().mockResolvedValue(true),
  } as unknown as AiModelCatalogService;
  const usage = {
    assertWithinBudget: opts.budgetExceeded
      ? jest.fn().mockRejectedValue(new ConflictException('Presupuesto agotado'))
      : jest.fn().mockResolvedValue(undefined),
    budgetStatus: jest.fn().mockResolvedValue({ exceeded: opts.budgetExceeded ?? false }),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AiUsageService;
  const service = new MeetingAiService(prisma, scope, bedrock, models, usage);
  return { service, converse, usage, scope, writes };
}

describe('MeetingAiService.structure', () => {
  it('caso feliz: devuelve la propuesta, fija modelo y agente, registra consumo y no escribe', async () => {
    const { service, usage, writes } = makeService();
    const res = await service.structure(actor, dto);
    expect(res.agenda).toBe('Lanzamiento');
    expect(res.decisions).toBe('Mover el lanzamiento');
    expect(res.commitments).toEqual([
      {
        title: 'Enviar el informe',
        assignedUserId: MARTA,
        assigneeText: 'Marta',
        dueDate: '2026-03-13',
        expectedResult: null,
        sourceQuote: 'Marta enviará el informe el viernes',
      },
    ]);
    expect(res.model).toBe('modelo-actas');
    expect(res.agentCode).toBe('ACTAS');
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ agentCode: 'ACTAS', userId: 'u-1' }),
    );
    // Solo se registra consumo: no se guarda contenido.
    expect(JSON.stringify((usage.record as jest.Mock).mock.calls[0][0])).not.toContain('informe');
    expect(writes).not.toHaveBeenCalled();
  });

  it('el modelo recibe alias y nombres, sin ids ni correos, con los participantes primero', async () => {
    const { service, converse } = makeService();
    await service.structure(actor, dto);
    const call = (converse.mock.calls as unknown as Array<[{ messages: Array<{ content: Array<{ text: string }> }> }]>)[0][0];
    const prompt = call.messages[0].content[0].text;
    expect(prompt).toContain('Ordena el acta.');
    expect(prompt).toContain('"alias":1,"nombre":"Luis Peña","participante":true');
    expect(prompt).toContain('"alias":2,"nombre":"Marta Ruiz","participante":false');
    expect(prompt).not.toContain(MARTA);
    expect(prompt).not.toContain('marta@demo.local');
  });

  it('IA global apagada o agente apagado: 409 sin invocar el modelo', async () => {
    const a = makeService({ global: { enabled: false } });
    await expect(a.service.structure(actor, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(a.converse).not.toHaveBeenCalled();
    const b = makeService({ agent: { enabled: false } });
    await expect(b.service.structure(actor, dto)).rejects.toBeInstanceOf(ConflictException);
    const c = makeService({ agent: null });
    await expect(c.service.structure(actor, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(b.converse).not.toHaveBeenCalled();
  });

  it('presupuesto agotado: 409 sin invocar el modelo', async () => {
    const { service, converse } = makeService({ budgetExceeded: true });
    await expect(service.structure(actor, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(converse).not.toHaveBeenCalled();
  });

  it('texto por encima del tope: 413 sin invocar el modelo', async () => {
    const { service, converse } = makeService();
    await expect(
      service.structure(actor, { ...dto, text: 'x'.repeat(MEETING_AI_MAX_INPUT_CHARS + 1) }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(converse).not.toHaveBeenCalled();
  });

  it('timeout y fallo del modelo: 503', async () => {
    const a = makeService({
      invoke: async () => {
        throw new BedrockTimeoutError();
      },
    });
    await expect(a.service.structure(actor, dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    const b = makeService({
      invoke: async () => {
        throw new Error('boom');
      },
    });
    await expect(b.service.structure(actor, dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('salida que no es JSON, o que no valida: 422', async () => {
    const a = makeService({ invoke: async () => 'esto no es json' });
    await expect(a.service.structure(actor, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    const b = makeService({ invoke: async () => JSON.stringify(modelOutput({ commitments: 'nada' })) });
    await expect(b.service.structure(actor, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    const c = makeService({ invoke: async () => JSON.stringify([1, 2]) });
    await expect(c.service.structure(actor, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('tolera cercas markdown y alias numérico como texto', async () => {
    const fenced =
      '```json\n' + JSON.stringify(modelOutput({ commitments: [{ title: 'T', assigneeAlias: '2' }] })) + '\n```';
    const { service } = makeService({ invoke: async () => fenced });
    const res = await service.structure(actor, dto);
    expect(res.commitments[0].assignedUserId).toBe(MARTA);
  });

  it('descarta alias inventados y avisa', async () => {
    const { service } = makeService({
      invoke: async () =>
        JSON.stringify(modelOutput({ commitments: [{ title: 'Algo', assigneeAlias: 9, assigneeText: 'Ana' }] })),
    });
    const res = await service.structure(actor, dto);
    expect(res.commitments[0].assignedUserId).toBeNull();
    expect(res.commitments[0].assigneeText).toBe('Ana');
    expect(res.warnings.join(' ')).toContain('responsable no reconocido');
  });

  it('deja en null fechas inválidas, anteriores a la reunión o demasiado lejanas', async () => {
    const dates = ['2026-02-30', '2026-03-09', '2040-01-01', 'el viernes'];
    const { service } = makeService({
      invoke: async () =>
        JSON.stringify(
          modelOutput({ commitments: dates.map((dueDate, i) => ({ title: `T${i}`, dueDate })) }),
        ),
    });
    const res = await service.structure(actor, dto);
    expect(res.commitments.map((c) => c.dueDate)).toEqual([null, null, null, null]);
    expect(res.warnings.filter((w) => w.includes('sin fecha'))).toHaveLength(4);
  });

  it('acepta la fecha de la propia reunión', async () => {
    const { service } = makeService({
      invoke: async () => JSON.stringify(modelOutput({ commitments: [{ title: 'Hoy', dueDate: '2026-03-10' }] })),
    });
    expect((await service.structure(actor, dto)).commitments[0].dueDate).toBe('2026-03-10');
  });

  it('recorta a los máximos de los DTO, descarta títulos vacíos y limita la cantidad', async () => {
    const many = Array.from({ length: MEETING_AI_MAX_COMMITMENTS + 5 }, (_, i) => ({ title: `T${i}` }));
    const { service } = makeService({
      invoke: async () =>
        JSON.stringify(
          modelOutput({
            agenda: 'a'.repeat(6000),
            commitments: [{ title: '   ' }, { title: 'x'.repeat(400) }, ...many],
          }),
        ),
    });
    const res = await service.structure(actor, dto);
    expect(res.agenda).toHaveLength(5000);
    expect(res.commitments).toHaveLength(MEETING_AI_MAX_COMMITMENTS);
    expect(res.commitments[0].title).toHaveLength(300);
    expect(res.warnings.some((w) => w.includes('Se recortó'))).toBe(true);
  });

  it('un acta vacía en la salida del modelo devuelve campos vacíos', async () => {
    const { service } = makeService({ invoke: async () => '{}' });
    const res = await service.structure(actor, dto);
    expect(res).toMatchObject({ agenda: '', decisions: '', notes: '', commitments: [], warnings: [] });
  });
});

describe('MeetingAiService.availability', () => {
  it('available cuando todo está encendido y hay presupuesto', async () => {
    expect(await makeService().service.availability()).toEqual({ status: 'available' });
  });
  it('off cuando la IA global o el agente están apagados', async () => {
    expect((await makeService({ global: { enabled: false } }).service.availability()).status).toBe('off');
    expect((await makeService({ agent: { enabled: false } }).service.availability()).status).toBe('off');
  });
  it('unavailable cuando se agotó el presupuesto', async () => {
    const res = await makeService({ budgetExceeded: true }).service.availability();
    expect(res.status).toBe('unavailable');
    expect(res.message).toBeTruthy();
  });
});
