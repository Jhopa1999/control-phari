import { DependencyController } from './dependency.controller';
import { DependencyService } from './dependency.service';
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

describe('DependencyController (delegacion)', () => {
  const svc = {
    findForTask: jest.fn().mockResolvedValue('findForTask'),
    add: jest.fn().mockResolvedValue('add'),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as DependencyService;
  const controller = new DependencyController(svc);
  const a = actor();

  it('findForTask delega actor e id', async () => {
    await expect(controller.findForTask(a, 't1')).resolves.toBe('findForTask');
    expect(svc.findForTask).toHaveBeenCalledWith(a, 't1');
  });

  it('add delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.add(a, 't1', dto)).resolves.toBe('add');
    expect(svc.add).toHaveBeenCalledWith(a, 't1', dto);
  });

  it('remove delega actor, id y predecessorTaskId', async () => {
    await expect(controller.remove(a, 't1', 't0')).resolves.toBeUndefined();
    expect(svc.remove).toHaveBeenCalledWith(a, 't1', 't0');
  });
});
