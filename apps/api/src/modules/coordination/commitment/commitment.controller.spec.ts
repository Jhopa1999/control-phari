import { CommitmentController } from './commitment.controller';
import { CommitmentService } from './commitment.service';
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
    isLiderProceso: false,
    isAdmin: false,
  };
}

describe('CommitmentController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue({ rows: ['list'], total: 7, truncated: false, window: { paginated: true, page: 1, pageSize: 25, skip: 0, take: 25 } }),
    create: jest.fn().mockResolvedValue('create'),
    get: jest.fn().mockResolvedValue('get'),
    update: jest.fn().mockResolvedValue('update'),
    transition: jest.fn().mockResolvedValue('transition'),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as CommitmentService;
  const controller = new CommitmentController(svc);
  const a = actor();

  it('list delega actor y filtros', async () => {
    const filters = {} as never;
    const res = { setHeader: jest.fn() };
    await expect(controller.list(a, filters, res)).resolves.toEqual(['list']);
    expect(svc.list).toHaveBeenCalledWith(a, filters);
    expect(res.setHeader).toHaveBeenCalledWith('X-Total-Count', '7');
  });

  it('create delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('get delega actor e id', async () => {
    await expect(controller.get(a, 'c1')).resolves.toBe('get');
    expect(svc.get).toHaveBeenCalledWith(a, 'c1');
  });

  it('update delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'c1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'c1', dto);
  });

  it('transition delega actor, id y dto', async () => {
    const dto = { to: 'CERRADO' } as never;
    await expect(controller.transition(a, 'c1', dto)).resolves.toBe(
      'transition',
    );
    expect(svc.transition).toHaveBeenCalledWith(a, 'c1', dto);
  });

  it('remove delega actor e id', async () => {
    await expect(controller.remove(a, 'c1')).resolves.toBeUndefined();
    expect(svc.remove).toHaveBeenCalledWith(a, 'c1');
  });
});
