import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { appTimeZone } from '../local-day';
import { CommitmentNoticeService } from './commitment-notice.service';

const NOTICES_JOB = 'commitments:notices';
const DEFAULT_CRON = '30 7 * * *';

/** Configuración del scheduler leída del entorno (nunca lanza). */
export function loadCommitmentSchedulerConfig(): {
  enabled: boolean;
  cron: string;
} {
  const enabledRaw = process.env.COMMITMENT_SCHEDULER_ENABLED?.trim().toLowerCase();
  const cron = process.env.COMMITMENT_NOTICES_CRON?.trim();
  return {
    enabled: enabledRaw !== 'false',
    cron: cron && cron.length > 0 ? cron : DEFAULT_CRON,
  };
}

/**
 * Cron in-process de los avisos de vencimiento de compromisos. Mismo patrón que
 * el scheduler de actividades recurrentes: no se registra al generar OpenAPI
 * (la app no ejecuta `init()`), un fallo se registra y no tumba el cron.
 */
@Injectable()
export class CommitmentNoticeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommitmentNoticeScheduler.name);

  constructor(
    private readonly notices: CommitmentNoticeService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const config = loadCommitmentSchedulerConfig();
    if (!config.enabled) {
      this.logger.log(
        'Avisos de compromisos DESACTIVADOS (COMMITMENT_SCHEDULER_ENABLED=false); no se registra el cron.',
      );
      return;
    }
    const job = new CronJob(
      config.cron,
      () => {
        void this.runNotices();
      },
      null,
      false,
      appTimeZone(),
    );
    this.schedulerRegistry.addCronJob(NOTICES_JOB, job as unknown as CronJob);
    job.start();
    this.logger.log(`Avisos de compromisos activos (cron="${config.cron}").`);
  }

  onModuleDestroy(): void {
    // generate-openapi crea la app sin init(): el registry puede no estar resuelto.
    if (!this.schedulerRegistry) return;
    if (this.schedulerRegistry.doesExist('cron', NOTICES_JOB)) {
      this.schedulerRegistry.getCronJob(NOTICES_JOB).stop();
      this.schedulerRegistry.deleteCronJob(NOTICES_JOB);
    }
  }

  async runNotices(): Promise<void> {
    try {
      const result = await this.notices.sendDueNotices();
      this.logger.log(
        `Avisos de compromisos: ${result.dueSoon} vencen mañana, ${result.dueToday} vencen hoy, ${result.overdue} vencidos.`,
      );
    } catch (error) {
      this.logger.error(
        'Falló el envío de avisos de vencimiento de compromisos.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
