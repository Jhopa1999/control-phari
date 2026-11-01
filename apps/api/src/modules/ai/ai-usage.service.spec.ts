import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiUsageService } from './ai-usage.service';

/**
 * Consumo y presupuesto de IA: costo estimado con el precio del catalogo
 * (null sin precio), registro que no rompe la respuesta si falla, estado del
 * presupuesto (alerta/agotado/sin tope) y rechazo al agotarse.
 */
const USAGE = {
  inputTokens: 1_000_000,
  outputTokens: 200_000,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

describe('AiUsageService', () => {
  function makeDeps(opts: {
    model?: Record<string, unknown> | null;
    spent?: number;
    config?: Record<string, unknown> | null;
    createError?: Error;
  } = {}) {
    const prisma = {
      aiModel: {
        findUnique: jest.fn().mockResolvedValue(
          opts.model === undefined
            ? { modelId: 'm', inputUsdPerMTok: 1, outputUsdPerMTok: 5 }
            : opts.model,
        ),
      },
      aiGlobalConfig: {
        findFirst: jest.fn().mockResolvedValue(opts.config ?? null),
      },
      aiUsage: {
        create: opts.createError
          ? jest.fn().mockRejectedValue(opts.createError)
          : jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { costUsd: opts.spent ?? 0, inputTokens: 10, outputTokens: 4 },
          _count: { _all: 3 },
        }),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([
          {
            agentCode: 'TRIAGE',
            modelId: 'm',
            _count: { _all: 3 },
            _sum: { inputTokens: 10, outputTokens: 4, costUsd: 0.5 },
          },
        ]),
      },
    } as unknown as PrismaService;
    return { service: new AiUsageService(prisma), prisma };
  }

  describe('record', () => {
    it('calcula el costo con el precio por millon de tokens del modelo', async () => {
      const { service, prisma } = makeDeps();
      await service.record({
        userId: 'u-1',
        agentCode: 'TRIAGE',
        modelId: 'm',
        usage: USAGE,
        durationMs: 800,
      });
      const data = (prisma.aiUsage.create as jest.Mock).mock.calls[0][0].data;
      // 1M entrada * 1 + 0.2M salida * 5 = 2 USD
      expect(data.costUsd).toBeCloseTo(2, 6);
      expect(data).toMatchObject({
        userId: 'u-1',
        agentCode: 'TRIAGE',
        modelId: 'm',
        inputTokens: 1_000_000,
        outputTokens: 200_000,
        durationMs: 800,
      });
    });

    it('los tokens de cache se cobran como entrada', async () => {
      const { service, prisma } = makeDeps();
      await service.record({
        userId: null,
        agentCode: 'ASISTENTE',
        modelId: 'm',
        usage: { ...USAGE, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 },
        durationMs: 1,
      });
      const data = (prisma.aiUsage.create as jest.Mock).mock.calls[0][0].data;
      expect(data.costUsd).toBeCloseTo(1, 6);
    });

    it('modelo sin precio o desconocido => costo null (se registra igual)', async () => {
      for (const model of [null, { modelId: 'm', inputUsdPerMTok: null, outputUsdPerMTok: null }]) {
        const { service, prisma } = makeDeps({ model });
        await service.record({
          userId: 'u-1',
          agentCode: 'TRIAGE',
          modelId: 'm',
          usage: USAGE,
          durationMs: 1,
        });
        const data = (prisma.aiUsage.create as jest.Mock).mock.calls[0][0].data;
        expect(data.costUsd).toBeNull();
      }
    });

    it('un fallo al registrar NO propaga el error', async () => {
      const { service } = makeDeps({ createError: new Error('BD caida') });
      await expect(
        service.record({
          userId: 'u-1',
          agentCode: 'TRIAGE',
          modelId: 'm',
          usage: USAGE,
          durationMs: 1,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('budgetStatus', () => {
    it('sin fila de config usa el tope por defecto (100 USD, alerta 80%)', async () => {
      const { service } = makeDeps({ spent: 50 });
      const s = await service.budgetStatus('2026-11');
      expect(s).toMatchObject({
        month: '2026-11',
        budgetUsd: 100,
        alertPct: 80,
        spentUsd: 50,
        usedPct: 50,
        alert: false,
        exceeded: false,
      });
    });

    it('al 80% hay alerta pero no esta agotado', async () => {
      const { service } = makeDeps({ spent: 80 });
      const s = await service.budgetStatus('2026-11');
      expect(s.alert).toBe(true);
      expect(s.exceeded).toBe(false);
    });

    it('al 100% queda agotado', async () => {
      const { service } = makeDeps({ spent: 100 });
      const s = await service.budgetStatus('2026-11');
      expect(s.exceeded).toBe(true);
    });

    it('sin tope (null) nunca hay alerta ni agotamiento', async () => {
      const { service } = makeDeps({
        spent: 9999,
        config: { monthlyBudgetUsd: null, budgetAlertPct: 80 },
      });
      const s = await service.budgetStatus('2026-11');
      expect(s).toMatchObject({ budgetUsd: null, usedPct: null, alert: false, exceeded: false });
    });

    it('consulta solo el mes pedido (UTC, [inicio, siguiente mes))', async () => {
      const { service, prisma } = makeDeps();
      await service.budgetStatus('2026-12');
      const where = (prisma.aiUsage.aggregate as jest.Mock).mock.calls[0][0].where;
      expect(where.createdAt.gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(where.createdAt.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('assertWithinBudget', () => {
    it('dentro del tope no lanza', async () => {
      const { service } = makeDeps({ spent: 10 });
      await expect(service.assertWithinBudget()).resolves.toBeUndefined();
    });

    it('agotado => 409', async () => {
      const { service } = makeDeps({ spent: 150 });
      await expect(service.assertWithinBudget()).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('summary', () => {
    it('agrega totales, por agente, por modelo, llamadas sin precio y presupuesto', async () => {
      const { service } = makeDeps({ spent: 0.5 });
      const s = await service.summary('2026-11');
      expect(s.month).toBe('2026-11');
      expect(s.calls).toBe(3);
      expect(s.inputTokens).toBe(10);
      expect(s.outputTokens).toBe(4);
      expect(s.unpricedCalls).toBe(1);
      expect(s.byAgent).toEqual([
        { key: 'TRIAGE', calls: 3, inputTokens: 10, outputTokens: 4, costUsd: 0.5 },
      ]);
      expect(s.byModel[0].key).toBe('m');
      expect(s.budget.month).toBe('2026-11');
    });
  });
});
