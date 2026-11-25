import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthThrottleService } from './auth-throttle.service';
import { CurrentActor } from './current-actor';
import { PasswordPolicyService } from './password-policy.service';
import { TooManyAttemptsException } from './too-many-attempts.exception';
import * as passwordHash from './password-hash';

const actor = { userId: 'u1', identifier: 'p@demo.local' } as unknown as CurrentActor;

function setup() {
  const user = { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) };
  const prismaObj: Record<string, unknown> = {
    user,
    catalogItem: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const audit = { record: jest.fn() };
  const throttle = {
    assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
    recordLoginFailure: jest.fn().mockResolvedValue({ blocked: false }),
    clearLoginFailures: jest.fn(),
  };
  const service = new AuthPasswordService(
    prismaObj as unknown as PrismaService,
    audit as unknown as AuditService,
    throttle as unknown as AuthThrottleService,
    new PasswordPolicyService(prismaObj as unknown as PrismaService),
  );
  return { service, user, audit, throttle };
}

describe('AuthPasswordService', () => {
  beforeEach(() => {
    jest.spyOn(passwordHash, 'hashPassword').mockResolvedValue('hash-nuevo');
    jest
      .spyOn(passwordHash, 'verifyPassword')
      .mockImplementation(async (plain) => plain === 'actual-correcta');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cambia la contraseña, limpia el indicador y audita sin secretos', async () => {
    const m = setup();
    m.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hash-actual' });

    await expect(
      m.service.changePassword(actor, { currentPassword: 'actual-correcta', newPassword: 'nueva-larga-1' }, '1.1.1.1'),
    ).resolves.toBeUndefined();

    expect(m.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'hash-nuevo', mustChangePassword: false },
    });
    expect(m.audit.record).toHaveBeenCalledTimes(1);
    const event = m.audit.record.mock.calls[0][1];
    expect(event).toMatchObject({ action: 'PASSWORD_CHANGED', actorUserId: 'u1', objectId: 'u1' });
    expect(JSON.stringify(event)).not.toMatch(/hash|actual-correcta|nueva-larga-1/);
    expect(m.throttle.clearLoginFailures).toHaveBeenCalledWith('p@demo.local');
  });

  it('contraseña actual incorrecta: 400, cuenta el fallo y no escribe', async () => {
    const m = setup();
    m.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hash-actual' });
    await expect(
      m.service.changePassword(actor, { currentPassword: 'mala', newPassword: 'nueva-larga-1' }, 'ip'),
    ).rejects.toThrow('La contraseña actual no es correcta.');
    expect(m.throttle.recordLoginFailure).toHaveBeenCalledWith('p@demo.local', 'ip');
    expect(m.user.update).not.toHaveBeenCalled();
  });

  it('usuario sin hash: 400', async () => {
    const m = setup();
    m.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
    await expect(
      m.service.changePassword(actor, { currentPassword: 'x', newPassword: 'nueva-larga-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nueva igual a la actual: 400', async () => {
    const m = setup();
    m.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hash-actual' });
    await expect(
      m.service.changePassword(actor, { currentPassword: 'actual-correcta', newPassword: 'actual-correcta' }),
    ).rejects.toThrow('La contraseña nueva debe ser distinta de la actual.');
    expect(m.user.update).not.toHaveBeenCalled();
  });

  it('nueva más corta que el mínimo (10): 400, no escribe ni cuenta fallo', async () => {
    const m = setup();
    m.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hash-actual' });
    await expect(
      m.service.changePassword(actor, { currentPassword: 'actual-correcta', newPassword: 'nueve-ch9' }),
    ).rejects.toThrow('La contraseña debe tener al menos 10 caracteres.');
    expect(m.user.update).not.toHaveBeenCalled();
    expect(m.throttle.recordLoginFailure).not.toHaveBeenCalled();
  });

  it('contraseña común: 400 y no se limpia el indicador de cambio obligatorio', async () => {
    const m = setup();
    m.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hash-actual' });
    await expect(
      m.service.changePassword(actor, { currentPassword: 'actual-correcta', newPassword: 'Password2026*' }),
    ).rejects.toThrow('Esa contraseña es muy común y fácil de adivinar. Elige otra.');
    expect(m.user.update).not.toHaveBeenCalled();
    expect(m.throttle.recordLoginFailure).not.toHaveBeenCalled();
  });
  it('límite de intentos superado: 429 sin leer el usuario', async () => {
    const m = setup();
    m.throttle.assertLoginAllowed.mockRejectedValue(new TooManyAttemptsException(60));
    await expect(
      m.service.changePassword(actor, { currentPassword: 'a', newPassword: 'nueva-larga-1' }),
    ).rejects.toBeInstanceOf(TooManyAttemptsException);
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });
});
