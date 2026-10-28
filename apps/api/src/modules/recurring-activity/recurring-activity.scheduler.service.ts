import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { RecurringActivityService } from './recurring-activity.service';

const GENERATION_JOB = 'recurring-activity:generation';
const OVERDUE_JOB = 'recurring-activity:overdue';
const REMINDER_JOB = 'recurring-activity:reminder';

/**
 * Motor de tiempo in-process del modulo (FEAT-001, design §2). Registra dos
 * cron jobs cuyas expresiones vienen de la config por ENV (no decoradores
 * estaticos, porque el cron es configurable). Respeta el interruptor
 * SCHEDULER_ENABLED: si esta desactivado no registra ningun job. Cada tarea
 * delega 100% en RecurringActivityService y nunca deja escapar un error (el
 * cron sigue vivo para la siguiente ejecucion).
 *
 * generate-openapi.ts crea la app sin init(), asi que onModuleInit NO corre al
 * generar OpenAPI y no se montan crons durante ese build.
 */
@Injectable()
export class RecurringActivitySchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RecurringActivitySchedulerService.name);

  constructor(
    private readonly service: RecurringActivityService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const config = this.service.getConfig();
    if (!config.schedulerEnabled) {
      this.logger.log(
        'Scheduler de actividades recurrentes DESACTIVADO (RECURRING_ACTIVITY_SCHEDULER_ENABLED=false); no se registran crons.',
      );
      return;
    }

    this.registerJob(GENERATION_JOB, config.generationCron, () =>
      this.runGeneration(),
    );
    this.registerJob(OVERDUE_JOB, config.overdueCron, () => this.runOverdue());
    this.registerJob(REMINDER_JOB, config.reminderCron, () =>
      this.runReminders(),
    );

    this.logger.log(
      `Scheduler de actividades recurrentes activo (generacion="${config.generationCron}", vencidas="${config.overdueCron}", recordatorios="${config.reminderCron}", tz="${config.timezone}").`,
    );
  }

  onModuleDestroy(): void {
    // generate-openapi.ts crea la app sin init() y luego llama a close(): en ese
    // modo onModuleInit no corre y el SchedulerRegistry puede no estar resuelto.
    // Guardamos contra ese caso para que la generacion del contrato (que cierra
    // la app) no falle; en runtime real el registry siempre esta presente.
    if (!this.schedulerRegistry) {
      return;
    }
    // Detener los jobs en el apagado limpio para no dejar timers colgando.
    for (const name of [GENERATION_JOB, OVERDUE_JOB, REMINDER_JOB]) {
      if (this.schedulerRegistry.doesExist('cron', name)) {
        this.schedulerRegistry.getCronJob(name).stop();
        this.schedulerRegistry.deleteCronJob(name);
      }
    }
  }

  /**
   * Ejecuta la generacion de ocurrencias. try/catch: un fallo se registra pero
   * no se propaga (no debe tumbar el cron ni el proceso).
   */
  async runGeneration(): Promise<void> {
    try {
      const result = await this.service.generateDueOccurrences();
      this.logger.log(
        `Generacion de ocurrencias: ${result.activitiesProcessed} definiciones, ${result.occurrencesCreated} ocurrencias creadas.`,
      );
    } catch (error) {
      this.logger.error(
        'Fallo la generacion de ocurrencias recurrentes.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Ejecuta el marcado de ocurrencias vencidas. try/catch como en runGeneration.
   */
  async runOverdue(): Promise<void> {
    try {
      const result = await this.service.markOverdueOccurrences();
      this.logger.log(
        `Marcado de vencidas: ${result.occurrencesMarkedOverdue} ocurrencias pasaron a VENCIDA.`,
      );
    } catch (error) {
      this.logger.error(
        'Fallo el marcado de ocurrencias vencidas.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Ejecuta el envio de recordatorios por correo. try/catch como las demas: un
   * fallo se registra pero no tumba el cron. Los correos degradan sin SMTP.
   */
  async runReminders(): Promise<void> {
    try {
      const result = await this.service.sendDueReminders();
      this.logger.log(
        `Recordatorios: ${result.remindersSent} ocurrencias notificadas.`,
      );
    } catch (error) {
      this.logger.error(
        'Fallo el envio de recordatorios de actividades recurrentes.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Registra un cron job en el registry con el nombre y expresion dados. */
  private registerJob(
    name: string,
    cronExpression: string,
    onTick: () => Promise<void>,
  ): void {
    const job = new CronJob(cronExpression, () => {
      void onTick();
    });
    this.schedulerRegistry.addCronJob(name, job as unknown as CronJob);
    job.start();
  }
}
