import { WorklogController } from './worklog.controller';
import { WorklogService } from './worklog.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isAdmin: false,
  };
}

describe('WorklogController (delegacion)', () => {
  const worklogService = {
    listDailyLogs: jest.fn().mockResolvedValue('listDailyLogs'),
    createDailyLog: jest.fn().mockResolvedValue('createDailyLog'),
    getDailyLog: jest.fn().mockResolvedValue('getDailyLog'),
    updateDailyLog: jest.fn().mockResolvedValue('updateDailyLog'),
    removeDailyLog: jest.fn().mockResolvedValue(undefined),
    submitDailyLog: jest.fn().mockResolvedValue('submitDailyLog'),
    addActivity: jest.fn().mockResolvedValue('addActivity'),
    updateActivity: jest.fn().mockResolvedValue('updateActivity'),
    removeActivity: jest.fn().mockResolvedValue(undefined),
    listWeeklyReports: jest.fn().mockResolvedValue('listWeeklyReports'),
    createWeeklyReport: jest.fn().mockResolvedValue('createWeeklyReport'),
    getWeeklyReport: jest.fn().mockResolvedValue('getWeeklyReport'),
    updateWeeklyReport: jest.fn().mockResolvedValue('updateWeeklyReport'),
    submitWeeklyReport: jest.fn().mockResolvedValue('submitWeeklyReport'),
  } as unknown as WorklogService;
  const scopeService = {
    listPeople: jest.fn().mockResolvedValue('people'),
  } as unknown as CoordinationScopeService;
  const controller = new WorklogController(worklogService, scopeService);
  const a = actor();

  it('people delega en scopeService', async () => {
    await expect(controller.people(a)).resolves.toBe('people');
    expect(scopeService.listPeople).toHaveBeenCalledWith(a);
  });

  it('listDailyLogs delega actor y filtros', async () => {
    const filters = {} as never;
    await expect(controller.listDailyLogs(a, filters)).resolves.toBe(
      'listDailyLogs',
    );
    expect(worklogService.listDailyLogs).toHaveBeenCalledWith(a, filters);
  });

  it('createDailyLog delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.createDailyLog(a, dto)).resolves.toBe(
      'createDailyLog',
    );
    expect(worklogService.createDailyLog).toHaveBeenCalledWith(a, dto);
  });

  it('getDailyLog delega actor e id', async () => {
    await expect(controller.getDailyLog(a, 'd1')).resolves.toBe('getDailyLog');
    expect(worklogService.getDailyLog).toHaveBeenCalledWith(a, 'd1');
  });

  it('updateDailyLog delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.updateDailyLog(a, 'd1', dto)).resolves.toBe(
      'updateDailyLog',
    );
    expect(worklogService.updateDailyLog).toHaveBeenCalledWith(a, 'd1', dto);
  });

  it('removeDailyLog delega actor e id', async () => {
    await expect(controller.removeDailyLog(a, 'd1')).resolves.toBeUndefined();
    expect(worklogService.removeDailyLog).toHaveBeenCalledWith(a, 'd1');
  });

  it('submitDailyLog delega actor e id', async () => {
    await expect(controller.submitDailyLog(a, 'd1')).resolves.toBe(
      'submitDailyLog',
    );
    expect(worklogService.submitDailyLog).toHaveBeenCalledWith(a, 'd1');
  });

  it('addActivity delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.addActivity(a, 'd1', dto)).resolves.toBe(
      'addActivity',
    );
    expect(worklogService.addActivity).toHaveBeenCalledWith(a, 'd1', dto);
  });

  it('updateActivity delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.updateActivity(a, 'act1', dto)).resolves.toBe(
      'updateActivity',
    );
    expect(worklogService.updateActivity).toHaveBeenCalledWith(a, 'act1', dto);
  });

  it('removeActivity delega actor e id', async () => {
    await expect(
      controller.removeActivity(a, 'act1'),
    ).resolves.toBeUndefined();
    expect(worklogService.removeActivity).toHaveBeenCalledWith(a, 'act1');
  });

  it('listWeeklyReports delega actor y filtros', async () => {
    const filters = {} as never;
    await expect(controller.listWeeklyReports(a, filters)).resolves.toBe(
      'listWeeklyReports',
    );
    expect(worklogService.listWeeklyReports).toHaveBeenCalledWith(a, filters);
  });

  it('createWeeklyReport delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.createWeeklyReport(a, dto)).resolves.toBe(
      'createWeeklyReport',
    );
    expect(worklogService.createWeeklyReport).toHaveBeenCalledWith(a, dto);
  });

  it('getWeeklyReport delega actor e id', async () => {
    await expect(controller.getWeeklyReport(a, 'w1')).resolves.toBe(
      'getWeeklyReport',
    );
    expect(worklogService.getWeeklyReport).toHaveBeenCalledWith(a, 'w1');
  });

  it('updateWeeklyReport delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.updateWeeklyReport(a, 'w1', dto)).resolves.toBe(
      'updateWeeklyReport',
    );
    expect(worklogService.updateWeeklyReport).toHaveBeenCalledWith(
      a,
      'w1',
      dto,
    );
  });

  it('submitWeeklyReport delega actor e id', async () => {
    await expect(controller.submitWeeklyReport(a, 'w1')).resolves.toBe(
      'submitWeeklyReport',
    );
    expect(worklogService.submitWeeklyReport).toHaveBeenCalledWith(a, 'w1');
  });
});
