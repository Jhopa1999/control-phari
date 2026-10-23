import { GrantController } from './grant.controller';
import { GrantService } from './grant.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: true,
    isAdmin: false,
  };
}

describe('GrantController (delegacion)', () => {
  const svc = {
    findMany: jest.fn().mockResolvedValue('findMany'),
    create: jest.fn().mockResolvedValue('create'),
    revoke: jest.fn().mockResolvedValue('revoke'),
  } as unknown as GrantService;
  const controller = new GrantController(svc);
  const a = actor();

  it('findMany delega actor y filtros', async () => {
    const filters = {} as never;
    await expect(controller.findMany(a, filters)).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith(a, filters);
  });

  it('create delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('revoke delega actor e id', async () => {
    await expect(controller.revoke(a, 'g1')).resolves.toBe('revoke');
    expect(svc.revoke).toHaveBeenCalledWith(a, 'g1');
  });
});
