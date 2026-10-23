import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';

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

describe('TaskController (delegacion)', () => {
  const svc = {
    myWork: jest.fn().mockResolvedValue('myWork'),
    findForPlan: jest.fn().mockResolvedValue('findForPlan'),
    create: jest.fn().mockResolvedValue('create'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue(undefined),
    changeStatus: jest.fn().mockResolvedValue('changeStatus'),
    accept: jest.fn().mockResolvedValue('accept'),
  } as unknown as TaskService;
  const controller = new TaskController(svc);
  const a = actor();

  it('myWork delega el actor', async () => {
    await expect(controller.myWork(a)).resolves.toBe('myWork');
    expect(svc.myWork).toHaveBeenCalledWith(a);
  });

  it('findForPlan delega actor, planId y filtros', async () => {
    const filters = {} as never;
    await expect(controller.findForPlan(a, 'pl1', filters)).resolves.toBe(
      'findForPlan',
    );
    expect(svc.findForPlan).toHaveBeenCalledWith(a, 'pl1', filters);
  });

  it('create delega actor, phaseId y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, 'ph1', dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, 'ph1', dto);
  });

  it('findOne delega actor e id', async () => {
    await expect(controller.findOne(a, 't1')).resolves.toBe('findOne');
    expect(svc.findOne).toHaveBeenCalledWith(a, 't1');
  });

  it('update delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 't1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 't1', dto);
  });

  it('remove delega actor e id', async () => {
    await expect(controller.remove(a, 't1')).resolves.toBeUndefined();
    expect(svc.remove).toHaveBeenCalledWith(a, 't1');
  });

  it('changeStatus delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.changeStatus(a, 't1', dto)).resolves.toBe(
      'changeStatus',
    );
    expect(svc.changeStatus).toHaveBeenCalledWith(a, 't1', dto);
  });

  it('accept delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.accept(a, 't1', dto)).resolves.toBe('accept');
    expect(svc.accept).toHaveBeenCalledWith(a, 't1', dto);
  });
});
