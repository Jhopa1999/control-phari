import { BadRequestException, GoneException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { AuthLoginService } from './auth-login.service';
import { AuthResetService } from './auth-reset.service';
import { AuthTokenPurpose } from './auth-token-purpose';
import { AuthTokenService } from './auth-token.service';
import * as passwordHash from './password-hash';

type UserDelegateMock = {
  findFirst: jest.Mock;
  update: jest.Mock;
};

function createMocks() {
  const user: UserDelegateMock = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const prismaObj: Record<string, unknown> = { user };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;

  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendUserInvitation: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService;
  const sendPasswordReset = mail.sendPasswordReset as unknown as jest.Mock;

  const authTokenService = {
    issue: jest.fn(),
    consume: jest.fn(),
  } as unknown as AuthTokenService;
  const issue = authTokenService.issue as unknown as jest.Mock;
  const consume = authTokenService.consume as unknown as jest.Mock;

  const authLoginService = {
    issueSessionForUser: jest.fn(),
  } as unknown as AuthLoginService;
  const issueSessionForUser =
    authLoginService.issueSessionForUser as unknown as jest.Mock;

  return {
    prisma,
    user,
    audit,
    auditRecord,
    mail,
    sendPasswordReset,
    authTokenService,
    issue,
    consume,
    authLoginService,
    issueSessionForUser,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    identifier: 'persona@demo.local',
    name: 'Persona',
    active: true,
    passwordHash: null,
    ...overrides,
  };
}

describe('AuthResetService', () => {
  let service: AuthResetService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new AuthResetService(
      mocks.prisma,
      mocks.audit,
      mocks.mail,
      mocks.authTokenService,
      mocks.authLoginService,
    );
    process.env.APP_WEB_URL = 'http://localhost:3000';
    delete process.env.PASSWORD_RESET_TTL;
    delete process.env.PASSWORD_MIN_LENGTH;
    jest
      .spyOn(passwordHash, 'hashPassword')
      .mockResolvedValue('hashed-password');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('forgotPassword', () => {
    it('con usuario inexistente no lanza, no emite token ni envia correo', async () => {
      mocks.user.findFirst.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ identifier: 'nadie@demo.local' }),
      ).resolves.toBeUndefined();

      expect(mocks.issue).not.toHaveBeenCalled();
      expect(mocks.sendPasswordReset).not.toHaveBeenCalled();
      expect(mocks.auditRecord).not.toHaveBeenCalled();
    });

    it('con usuario inactivo no emite ni envia (no revela existencia)', async () => {
      mocks.user.findFirst.mockResolvedValue(makeUser({ active: false }));

      await expect(
        service.forgotPassword({ identifier: 'persona@demo.local' }),
      ).resolves.toBeUndefined();

      expect(mocks.issue).not.toHaveBeenCalled();
      expect(mocks.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('con usuario activo emite token PASSWORD_RESET, audita y envia correo', async () => {
      mocks.user.findFirst.mockResolvedValue(makeUser());
      mocks.issue.mockResolvedValue({
        authToken: { id: 't1', userId: 'u1' },
        token: 'plain-token',
      });

      await service.forgotPassword({ identifier: 'persona@demo.local' });

      expect(mocks.issue).toHaveBeenCalledTimes(1);
      expect(mocks.issue.mock.calls[0][1]).toMatchObject({
        userId: 'u1',
        purpose: AuthTokenPurpose.PASSWORD_RESET,
      });

      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      const audited = mocks.auditRecord.mock.calls[0][1];
      expect(audited).toMatchObject({
        action: 'UPDATE',
        objectType: 'USER',
        objectId: 'u1',
      });

      expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1);
      const payload = mocks.sendPasswordReset.mock.calls[0][0];
      expect(payload.to).toBe('persona@demo.local');
      expect(payload.resetUrl).toContain('/restablecer-contrasena?token=');
      expect(payload.resetUrl).toContain('plain-token');
    });

    it('no incluye el token en el registro de auditoria', async () => {
      mocks.user.findFirst.mockResolvedValue(makeUser());
      mocks.issue.mockResolvedValue({
        authToken: { id: 't1', userId: 'u1' },
        token: 'secret-token',
      });

      await service.forgotPassword({ identifier: 'persona@demo.local' });

      const audited = JSON.stringify(mocks.auditRecord.mock.calls[0][1]);
      expect(audited).not.toContain('secret-token');
    });
  });

  describe('resetPassword', () => {
    const SESSION = {
      accessToken: 'signed.jwt.token',
      expiresIn: '8h',
      user: { id: 'u1', name: 'Persona', identifier: 'persona@demo.local' },
    };

    it('token de reset actualiza passwordHash, consume el token, audita y devuelve la sesion del duenno', async () => {
      mocks.consume.mockResolvedValue({ id: 't1', userId: 'u1' });
      const updated = makeUser({ passwordHash: 'hashed-password' });
      mocks.user.update.mockResolvedValue(updated);
      mocks.issueSessionForUser.mockResolvedValue(SESSION);

      const result = await service.resetPassword({
        token: 'plain-token',
        newPassword: 'contrasena-larga',
      });

      expect(mocks.consume).toHaveBeenCalledTimes(1);
      expect(mocks.consume.mock.calls[0][2]).toEqual([
        AuthTokenPurpose.PASSWORD_RESET,
        AuthTokenPurpose.USER_INVITATION,
      ]);
      expect(mocks.user.update).toHaveBeenCalledTimes(1);
      expect(mocks.user.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'u1' },
        data: { passwordHash: 'hashed-password' },
      });
      expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
      // La sesion se emite para el usuario actualizado (duenno del token).
      expect(mocks.issueSessionForUser).toHaveBeenCalledTimes(1);
      expect(mocks.issueSessionForUser).toHaveBeenCalledWith(updated);
      expect(result).toEqual(SESSION);
    });

    it('token de activacion (USER_INVITATION) tambien devuelve la sesion del duenno', async () => {
      mocks.consume.mockResolvedValue({ id: 't2', userId: 'u1' });
      const updated = makeUser({ passwordHash: 'hashed-password' });
      mocks.user.update.mockResolvedValue(updated);
      mocks.issueSessionForUser.mockResolvedValue(SESSION);

      const result = await service.resetPassword({
        token: 'activation-token',
        newPassword: 'contrasena-larga',
      });

      // El mismo endpoint acepta reset y activacion (ambos purposes permitidos).
      expect(mocks.consume.mock.calls[0][2]).toContain(
        AuthTokenPurpose.USER_INVITATION,
      );
      expect(mocks.issueSessionForUser).toHaveBeenCalledWith(updated);
      expect(result).toEqual(SESSION);
    });

    it('token invalido (400) se propaga sin actualizar ni emitir sesion', async () => {
      mocks.consume.mockRejectedValue(new BadRequestException());

      await expect(
        service.resetPassword({
          token: 'malo',
          newPassword: 'contrasena-larga',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mocks.user.update).not.toHaveBeenCalled();
      expect(mocks.issueSessionForUser).not.toHaveBeenCalled();
    });

    it('token expirado o usado (410) se propaga sin actualizar ni emitir sesion', async () => {
      mocks.consume.mockRejectedValue(new GoneException());

      await expect(
        service.resetPassword({
          token: 'viejo',
          newPassword: 'contrasena-larga',
        }),
      ).rejects.toBeInstanceOf(GoneException);
      expect(mocks.user.update).not.toHaveBeenCalled();
      expect(mocks.issueSessionForUser).not.toHaveBeenCalled();
    });

    it('contrasena mas corta que el minimo lanza 400 sin consumir token ni emitir sesion', async () => {
      await expect(
        service.resetPassword({ token: 'plain-token', newPassword: 'corta' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.user.update).not.toHaveBeenCalled();
      expect(mocks.issueSessionForUser).not.toHaveBeenCalled();
    });
  });
});
