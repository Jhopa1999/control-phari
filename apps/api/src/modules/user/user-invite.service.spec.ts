import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { AuthTokenPurpose } from '../auth/auth-token-purpose';
import { AuthTokenService } from '../auth/auth-token.service';
import { RoleCode } from '../auth/role-code';
import { MailService } from '../mail/mail.service';
import { UserInviteService } from './user-invite.service';

type UserDelegateMock = {
  findFirst: jest.Mock;
};

function createMocks() {
  const user: UserDelegateMock = { findFirst: jest.fn() };
  const prismaObj: Record<string, unknown> = { user };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;

  const mail = {
    sendUserInvitation: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService;
  const sendUserInvitation = mail.sendUserInvitation as unknown as jest.Mock;

  const authTokenService = {
    issue: jest.fn(),
  } as unknown as AuthTokenService;
  const issue = authTokenService.issue as unknown as jest.Mock;

  return {
    prisma,
    user,
    audit,
    auditRecord,
    mail,
    sendUserInvitation,
    authTokenService,
    issue,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    identifier: 'persona@demo.local',
    name: 'Persona',
    active: true,
    ...overrides,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Ana Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

describe('UserInviteService', () => {
  let service: UserInviteService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new UserInviteService(
      mocks.prisma,
      mocks.audit,
      mocks.mail,
      mocks.authTokenService,
    );
    process.env.APP_WEB_URL = 'http://localhost:3000';
    delete process.env.USER_INVITATION_TTL;
  });

  it('404 si el usuario no existe, sin emitir ni enviar', async () => {
    mocks.user.findFirst.mockResolvedValue(null);

    await expect(
      service.invite(jefe(), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.sendUserInvitation).not.toHaveBeenCalled();
  });

  it('emite token USER_INVITATION, audita con el actor y envia la invitacion', async () => {
    mocks.user.findFirst.mockResolvedValue(makeUser());
    mocks.issue.mockResolvedValue({
      authToken: { id: 't1', userId: 'u1' },
      token: 'invite-token',
    });

    await service.invite(jefe(), 'u1');

    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(mocks.issue.mock.calls[0][1]).toMatchObject({
      userId: 'u1',
      purpose: AuthTokenPurpose.USER_INVITATION,
    });

    expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
    expect(mocks.auditRecord.mock.calls[0][1]).toMatchObject({
      actorUserId: 'uj',
      action: 'UPDATE',
      objectType: 'USER',
      objectId: 'u1',
    });

    expect(mocks.sendUserInvitation).toHaveBeenCalledTimes(1);
    const payload = mocks.sendUserInvitation.mock.calls[0][0];
    expect(payload.to).toBe('persona@demo.local');
    expect(payload.inviteUrl).toContain('/activar-cuenta?token=');
    expect(payload.inviteUrl).toContain('invite-token');
  });

  it('el reenvio delega en issue, que invalida el token previo', async () => {
    mocks.user.findFirst.mockResolvedValue(makeUser());
    mocks.issue.mockResolvedValue({
      authToken: { id: 't2', userId: 'u1' },
      token: 'nuevo-token',
    });

    await service.invite(jefe(), 'u1');
    await service.invite(jefe(), 'u1');

    // issue encapsula la invalidacion del token previo (updateMany usedAt);
    // reenviar vuelve a llamarlo, dejando un unico enlace vigente.
    expect(mocks.issue).toHaveBeenCalledTimes(2);
  });
});
