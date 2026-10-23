import { UserInviteController } from './user-invite.controller';
import { UserInviteService } from './user-invite.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

describe('UserInviteController (delegacion)', () => {
  const svc = {
    invite: jest.fn().mockResolvedValue(undefined),
  } as unknown as UserInviteService;
  const controller = new UserInviteController(svc);

  it('invite delega actor e id', async () => {
    const a = actor();
    await expect(controller.invite(a, 'us1')).resolves.toBeUndefined();
    expect(svc.invite).toHaveBeenCalledWith(a, 'us1');
  });
});
