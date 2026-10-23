import { IssueController } from './issue.controller';
import { IssueService } from './issue.service';
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

describe('IssueController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue('list'),
    create: jest.fn().mockResolvedValue('create'),
    get: jest.fn().mockResolvedValue('get'),
    update: jest.fn().mockResolvedValue('update'),
    transition: jest.fn().mockResolvedValue('transition'),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as IssueService;
  const controller = new IssueController(svc);
  const a = actor();

  it('list delega actor y filtros', async () => {
    const filters = {} as never;
    await expect(controller.list(a, filters)).resolves.toBe('list');
    expect(svc.list).toHaveBeenCalledWith(a, filters);
  });

  it('create delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('get delega actor e id', async () => {
    await expect(controller.get(a, 'i1')).resolves.toBe('get');
    expect(svc.get).toHaveBeenCalledWith(a, 'i1');
  });

  it('update delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'i1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'i1', dto);
  });

  it('transition delega actor, id y dto', async () => {
    const dto = { to: 'RESUELTO' } as never;
    await expect(controller.transition(a, 'i1', dto)).resolves.toBe(
      'transition',
    );
    expect(svc.transition).toHaveBeenCalledWith(a, 'i1', dto);
  });

  it('remove delega actor e id', async () => {
    await expect(controller.remove(a, 'i1')).resolves.toBeUndefined();
    expect(svc.remove).toHaveBeenCalledWith(a, 'i1');
  });
});
