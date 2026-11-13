import 'reflect-metadata';
// `@nestjs/schedule` se publica como ESM (ver recurring-activity.module.spec.ts);
// el scheduler solo usa el tipo SchedulerRegistry, asi que basta un stub.
jest.mock('@nestjs/schedule', () => ({ SchedulerRegistry: class {} }));
jest.mock('cron', () => ({
  CronJob: class {
    constructor(
      readonly cronTime: string,
      readonly onTick: () => void,
    ) {}
    start(): void {}
    stop(): void {}
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecurringActivitySchedulerService } = require('./recurring-activity.scheduler.service') as {
  RecurringActivitySchedulerService: new (
    service: unknown,
    registry: unknown,
  ) => { onModuleInit(): void; runNotices(): Promise<void> };
};

describe('RecurringActivitySchedulerService', () => {
  function build(schedulerEnabled = true) {
    const service = {
      getConfig: () => ({
        timezone: 'America/Lima',
        generationCron: '0 1 * * *',
        overdueCron: '0 2 * * *',
        reminderCron: '0 3 * * *',
        noticesCron: '0 6 * * *',
        schedulerEnabled,
      }),
      sendLifecycleNotices: jest.fn().mockResolvedValue({ windowNotices: 1, dueNotices: 0 }),
    };
    const registry = { addCronJob: jest.fn() };
    return {
      scheduler: new RecurringActivitySchedulerService(service, registry),
      service,
      registry,
    };
  }

  it('registra 4 jobs, incluido recurring-activity:notices con su cron', () => {
    const { scheduler, registry } = build();
    scheduler.onModuleInit();
    const names = registry.addCronJob.mock.calls.map((c: unknown[]) => c[0]);
    expect(names).toEqual([
      'recurring-activity:generation',
      'recurring-activity:overdue',
      'recurring-activity:reminder',
      'recurring-activity:notices',
    ]);
    const noticesJob = registry.addCronJob.mock.calls[3][1] as { cronTime: string };
    expect(noticesJob.cronTime).toBe('0 6 * * *');
  });

  it('no registra jobs con el scheduler desactivado', () => {
    const { scheduler, registry } = build(false);
    scheduler.onModuleInit();
    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('runNotices delega en el service y no propaga errores', async () => {
    const { scheduler, service } = build();
    await scheduler.runNotices();
    expect(service.sendLifecycleNotices).toHaveBeenCalledTimes(1);
    service.sendLifecycleNotices.mockRejectedValueOnce(new Error('boom'));
    await expect(scheduler.runNotices()).resolves.toBeUndefined();
  });
});
