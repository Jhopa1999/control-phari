import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isAdmin: true,
  };
}

describe('AdminUsersController (delegacion)', () => {
  const svc = {
    listUsers: jest.fn().mockResolvedValue('listUsers'),
    setAdminFlag: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminUsersService;
  const controller = new AdminUsersController(svc);
  const a = actor();

  it('list delega en listUsers', async () => {
    await expect(controller.list()).resolves.toBe('listUsers');
    expect(svc.listUsers).toHaveBeenCalledWith();
  });

  it('setAdminFlag delega actor, id y el flag del dto', async () => {
    await expect(
      controller.setAdminFlag(a, 'us1', { isAdmin: true } as never),
    ).resolves.toBeUndefined();
    expect(svc.setAdminFlag).toHaveBeenCalledWith(a, 'us1', true);
  });
});
