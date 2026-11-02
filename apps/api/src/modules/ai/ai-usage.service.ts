import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';
import type { ConverseUsage } from './bedrock-converse';
import {
  AiBudgetStatusDto,
  AiUsageBreakdownDto,
  AiUsageSummaryDto,
} from './dto/ai-usage.dto';

/** Valores por defecto si aun no existe la fila global de configuracion. */
const DEFAULT_BUDGET_USD = 100;
const DEFAULT_ALERT_PCT = 80;

/** Datos de una llamada al modelo a registrar. */
export interface AiUsageEntry {
  userId: string | null;
  /** Agente/origen (p. ej. TRIAGE, ASISTENTE). */
  agentCode: string;
  modelId: string;
  usage: ConverseUsage;
  durationMs: number;
}

/** Mes `YYYY-MM` (UTC) de una fecha. */
function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Limites [inicio, fin) del mes `YYYY-MM` en UTC. */
function monthRange(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, m - 1, 1)),
    end: new Date(Date.UTC(year, m, 1)),
  };
}

/** Redondea a 6 decimales para no arrastrar ruido de coma flotante. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Registro de consumo de IA y presupuesto mensual (BL-032 F0). Cada llamada al
 * modelo deja una fila (solo metricas, nunca contenido). El costo se estima con
 * el precio por millon de tokens del catalogo de modelos; un modelo sin precio
 * registra el consumo con costo null. Los meses se miden en UTC.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /**
   * Registra una llamada. Un fallo al registrar NO debe romper la respuesta al
   * usuario: se deja en el log y se sigue.
   */
  async record(entry: AiUsageEntry): Promise<void> {
    try {
      const model = await this.prisma.aiModel.findUnique({
        where: { modelId: entry.modelId },
      });
      const cost = this.estimateCost(entry.usage, model);
      const before = await this.spentThisMonth(new Date());
      await this.prisma.aiUsage.create({
        data: {
          userId: entry.userId,
          agentCode: entry.agentCode,
          modelId: entry.modelId,
          inputTokens: entry.usage.inputTokens,
          outputTokens: entry.usage.outputTokens,
          cacheReadInputTokens: entry.usage.cacheReadInputTokens,
          cacheWriteInputTokens: entry.usage.cacheWriteInputTokens,
          costUsd: cost,
          durationMs: entry.durationMs,
        },
      });
      await this.warnIfThresholdCrossed(before, cost ?? 0);
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar el consumo de IA: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  /** Costo estimado en USD, o null si el modelo no tiene precio. */
  private estimateCost(
    usage: ConverseUsage,
    model: { inputUsdPerMTok: number | null; outputUsdPerMTok: number | null } | null,
  ): number | null {
    if (!model || model.inputUsdPerMTok === null || model.outputUsdPerMTok === null) {
      return null;
    }
    // Los tokens de cache se cobran como entrada (estimacion conservadora).
    const input =
      usage.inputTokens + usage.cacheReadInputTokens + usage.cacheWriteInputTokens;
    return round(
      (input * model.inputUsdPerMTok + usage.outputTokens * model.outputUsdPerMTok) /
        1_000_000,
    );
  }

  private async spentThisMonth(now: Date): Promise<number> {
    const { start, end } = monthRange(monthKey(now));
    const sum = await this.prisma.aiUsage.aggregate({
      where: { createdAt: { gte: start, lt: end } },
      _sum: { costUsd: true },
    });
    return sum._sum.costUsd ?? 0;
  }

  private async warnIfThresholdCrossed(before: number, added: number): Promise<void> {
    const config = await this.prisma.aiGlobalConfig.findFirst();
    const budget = config ? config.monthlyBudgetUsd : DEFAULT_BUDGET_USD;
    if (budget === null || budget <= 0) return;
    const alertPct = config?.budgetAlertPct ?? DEFAULT_ALERT_PCT;
    const threshold = (budget * alertPct) / 100;
    if (before < threshold && before + added >= threshold) {
      this.logger.warn(
        `El gasto de IA del mes alcanzo el ${alertPct}% del tope (USD ${budget}).`,
      );
      await this.notifyAdmins(
        NotificationType.AI_BUDGET_ALERT,
        'El gasto de IA llegó al umbral de alerta',
        `El consumo estimado de IA del mes alcanzó el ${alertPct}% del tope mensual (USD ${budget}).`,
      );
    }
    if (before < budget && before + added >= budget) {
      this.logger.warn(`Se agoto el presupuesto mensual de IA (USD ${budget}).`);
      await this.notifyAdmins(
        NotificationType.AI_BUDGET_EXCEEDED,
        'Se agotó el presupuesto de IA del mes',
        `El tope mensual de IA (USD ${budget}) se agotó: el asistente y las sugerencias de IA no responderán hasta el mes siguiente o hasta que subas el tope.`,
      );
    }
  }

  /** Avisa a las personas administradoras (flag isAdmin) en el centro de notificaciones. */
  private async notifyAdmins(
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { isAdmin: true, active: true },
      select: { id: true },
    });
    await this.notifications.notify({
      userIds: admins.map((a) => a.id),
      type,
      title,
      message,
      link: '/administracion/ia',
    });
  }

  /** Estado del presupuesto del mes indicado (por defecto, el actual). */
  async budgetStatus(month: string = monthKey(new Date())): Promise<AiBudgetStatusDto> {
    const { start, end } = monthRange(month);
    const [config, sum] = await Promise.all([
      this.prisma.aiGlobalConfig.findFirst(),
      this.prisma.aiUsage.aggregate({
        where: { createdAt: { gte: start, lt: end } },
        _sum: { costUsd: true },
      }),
    ]);
    const budgetUsd = config ? config.monthlyBudgetUsd : DEFAULT_BUDGET_USD;
    const alertPct = config?.budgetAlertPct ?? DEFAULT_ALERT_PCT;
    const spentUsd = round(sum._sum.costUsd ?? 0);
    const hasCap = budgetUsd !== null && budgetUsd > 0;
    const usedPct = hasCap ? round((spentUsd / budgetUsd) * 100) : null;
    return {
      month,
      budgetUsd: hasCap ? budgetUsd : null,
      alertPct,
      spentUsd,
      usedPct,
      alert: usedPct !== null && usedPct >= alertPct,
      exceeded: usedPct !== null && usedPct >= 100,
    };
  }

  /** 409 si se agoto el tope mensual: no se invoca el modelo. */
  async assertWithinBudget(): Promise<void> {
    const status = await this.budgetStatus();
    if (status.exceeded) {
      throw new ConflictException(
        'Se alcanzo el presupuesto mensual de IA. Un administrador puede ampliarlo.',
      );
    }
  }

  /** Resumen de consumo del mes: totales, por agente, por modelo y presupuesto. */
  async summary(month: string = monthKey(new Date())): Promise<AiUsageSummaryDto> {
    const { start, end } = monthRange(month);
    const where = { createdAt: { gte: start, lt: end } };
    const [total, unpriced, byAgent, byModel, budget] = await Promise.all([
      this.prisma.aiUsage.aggregate({
        where,
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      }),
      this.prisma.aiUsage.count({ where: { ...where, costUsd: null } }),
      this.prisma.aiUsage.groupBy({
        by: ['agentCode'],
        where,
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        orderBy: { agentCode: 'asc' },
      }),
      this.prisma.aiUsage.groupBy({
        by: ['modelId'],
        where,
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        orderBy: { modelId: 'asc' },
      }),
      this.budgetStatus(month),
    ]);

    const breakdown = (
      key: string,
      row: {
        _count: { _all: number };
        _sum: {
          inputTokens: number | null;
          outputTokens: number | null;
          costUsd: number | null;
        };
      },
    ): AiUsageBreakdownDto => ({
      key,
      calls: row._count._all,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      costUsd: round(row._sum.costUsd ?? 0),
    });

    return {
      month,
      calls: total._count._all,
      inputTokens: total._sum.inputTokens ?? 0,
      outputTokens: total._sum.outputTokens ?? 0,
      costUsd: round(total._sum.costUsd ?? 0),
      unpricedCalls: unpriced,
      byAgent: byAgent.map((r) => breakdown(r.agentCode, r)),
      byModel: byModel.map((r) => breakdown(r.modelId, r)),
      budget,
    };
  }
}
