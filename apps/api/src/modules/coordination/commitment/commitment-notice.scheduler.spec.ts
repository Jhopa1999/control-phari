// `@nestjs/schedule` se publica como ESM: se mockea (patrón de recurring-activity.module.spec.ts).
jest.mock('@nestjs/schedule', () => ({ SchedulerRegistry: class {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CommitmentNoticeScheduler, loadCommitmentSchedulerConfig } = require('./commitment-notice.scheduler') as typeof import('./commitment-notice.scheduler');

describe('CommitmentNoticeScheduler', () => {
  afterEach(() => {
    delete process.env.COMMITMENT_SCHEDULER_ENABLED;
    delete process.env.COMMITMENT_NOTICES_CRON;
  });

  it('configuración por defecto: activo a las 07:30', () => {
    expect(loadCommitmentSchedulerConfig()).toEqual({ enabled: true, cron: '30 7 * * *' });
    process.env.COMMITMENT_SCHEDULER_ENABLED = 'FALSE';
    process.env.COMMITMENT_NOTICES_CRON = '0 8 * * *';
    expect(loadCommitmentSchedulerConfig()).toEqual({ enabled: false, cron: '0 8 * * *' });
  });

  it('con el interruptor apagado no registra el cron', () => {
    process.env.COMMITMENT_SCHEDULER_ENABLED = 'false';
    const registry = { addCronJob: jest.fn() };
    const scheduler = new CommitmentNoticeScheduler({ sendDueNotices: jest.fn() } as never, registry as never);
    scheduler.onModuleInit();
    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('un fallo del envío se registra y no se propaga', async () => {
    const notices = { sendDueNotices: jest.fn().mockRejectedValue(new Error('caída')) };
    const scheduler = new CommitmentNoticeScheduler(notices as never, {} as never);
    await expect(scheduler.runNotices()).resolves.toBeUndefined();
  });
});
