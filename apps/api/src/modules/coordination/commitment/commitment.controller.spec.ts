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
    isAdmin: false,
  };
}

describe('CommitmentController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue('list'),
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
    await expect(controller.list(a, filters)).resolves.toBe('list');
    expect(svc.list).toHaveBeenCalledWith(a, filters);
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
