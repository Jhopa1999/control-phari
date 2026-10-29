import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isAdmin: false,
  };
}

describe('PlanController (delegacion)', () => {
  const svc = {
    create: jest.fn().mockResolvedValue('create'),
    findByRequest: jest.fn().mockResolvedValue('findByRequest'),
    update: jest.fn().mockResolvedValue('update'),
    getGuide: jest.fn().mockResolvedValue('getGuide'),
    exportPlan: jest.fn().mockResolvedValue('exportPlan'),
    importPlan: jest.fn().mockResolvedValue('importPlan'),
    submit: jest.fn().mockResolvedValue('submit'),
    authorize: jest.fn().mockResolvedValue('authorize'),
    return: jest.fn().mockResolvedValue('return'),
  } as unknown as PlanService;
  const excelSvc = {
    exportExcel: jest.fn().mockResolvedValue(Buffer.from('x')),
    templateExcel: jest.fn().mockResolvedValue(Buffer.from('x')),
    importExcel: jest.fn().mockResolvedValue('importExcel'),
  };
  const controller = new PlanController(svc, excelSvc as never);
  const a = actor();

  it('create delega actor, requestId y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, 'r1', dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, 'r1', dto);
  });

  it('findByRequest delega actor y requestId', async () => {
    await expect(controller.findByRequest(a, 'r1')).resolves.toBe(
      'findByRequest',
    );
    expect(svc.findByRequest).toHaveBeenCalledWith(a, 'r1');
  });

  it('update delega actor, requestId y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'r1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'r1', dto);
  });

  it('getGuide delega actor y requestId', async () => {
    await expect(controller.getGuide(a, 'r1')).resolves.toBe('getGuide');
    expect(svc.getGuide).toHaveBeenCalledWith(a, 'r1');
  });

  it('exportPlan delega actor y requestId', async () => {
    await expect(controller.exportPlan(a, 'r1')).resolves.toBe('exportPlan');
    expect(svc.exportPlan).toHaveBeenCalledWith(a, 'r1');
  });

  it('importExcel delega el archivo en base64', async () => {
    await expect(controller.importExcel(a, 'r1', { fileBase64: 'abc' })).resolves.toBe(
      'importExcel',
    );
    expect(excelSvc.importExcel).toHaveBeenCalledWith(a, 'r1', 'abc');
  });

  it('importPlan delega actor, requestId y dto', async () => {
    const dto = {} as never;
    await expect(controller.importPlan(a, 'r1', dto)).resolves.toBe(
      'importPlan',
    );
    expect(svc.importPlan).toHaveBeenCalledWith(a, 'r1', dto);
  });

  it('submit delega actor y requestId', async () => {
    await expect(controller.submit(a, 'r1')).resolves.toBe('submit');
    expect(svc.submit).toHaveBeenCalledWith(a, 'r1');
  });

  it('authorize delega actor y requestId', async () => {
    await expect(controller.authorize(a, 'r1')).resolves.toBe('authorize');
    expect(svc.authorize).toHaveBeenCalledWith(a, 'r1');
  });

  it('return delega actor, requestId y dto', async () => {
    const dto = {} as never;
    await expect(controller.return(a, 'r1', dto)).resolves.toBe('return');
    expect(svc.return).toHaveBeenCalledWith(a, 'r1', dto);
  });
});
