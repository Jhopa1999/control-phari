import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthLoginService } from './auth-login.service';
import { AuthThrottleService } from './auth-throttle.service';
import { TooManyAttemptsException } from './too-many-attempts.exception';
import { hashPassword } from './password-hash';

function createMocks() {
  const findFirst = jest.fn();
  const findMany = jest.fn().mockResolvedValue([]);
  const prismaObj: Record<string, unknown> = {
    user: { findFirst },
    catalogItem: { findMany },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const throttle = new AuthThrottleService(prisma);
  const signAsync = jest.fn();
  const jwt = { signAsync } as unknown as JwtService;
  return { prisma, findFirst, findMany, jwt, signAsync, audit, record, throttle };
}

async function makeDbUser(password: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    identifier: 'jefe@demo.local',
    name: 'Ana Jefa',
    active: true,
    passwordHash: await hashPassword(password),
    ...overrides,
  };
}

describe('AuthLoginService', () => {
  let service: AuthLoginService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new AuthLoginService(mocks.prisma, mocks.jwt, mocks.throttle, mocks.audit);
  });

  it('credenciales correctas -> firma el token con sub=identifier y devuelve user', async () => {
    mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));
    mocks.signAsync.mockResolvedValue('signed.jwt.token');

    const result = await service.login({
      identifier: 'jefe@demo.local',
      password: 'dev1234',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toEqual({
      id: 'u1',
      name: 'Ana Jefa',
      identifier: 'jefe@demo.local',
    });
    // El hash solo se lee aquí: el cliente Prisma lo omite por defecto.
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { passwordHash: false } }),
    );
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(typeof result.expiresIn).toBe('string');
    // El token se firma con sub = identifier del usuario.
    expect(mocks.signAsync).toHaveBeenCalledWith(
      { sub: 'jefe@demo.local' },
      expect.objectContaining({ expiresIn: expect.any(String) }),
    );
  });

  describe('issueSessionForUser', () => {
    const user = { id: 'u1', name: 'Ana Jefa', identifier: 'jefe@demo.local' };

    afterEach(() => {
      delete process.env.JWT_EXPIRES_IN;
    });

    it('firma el token con sub=identifier y arma el DTO con expiresIn por defecto', async () => {
      delete process.env.JWT_EXPIRES_IN;
      mocks.signAsync.mockResolvedValue('signed.jwt.token');

      const result = await service.issueSessionForUser(user);

      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        expiresIn: '8h',
        user: { id: 'u1', name: 'Ana Jefa', identifier: 'jefe@demo.local' },
      });
      expect(mocks.signAsync).toHaveBeenCalledWith(
        { sub: 'jefe@demo.local' },
        { expiresIn: '8h' },
      );
    });

    it('respeta JWT_EXPIRES_IN cuando esta configurado', async () => {
      process.env.JWT_EXPIRES_IN = '2h';
      mocks.signAsync.mockResolvedValue('signed.jwt.token');

      const result = await service.issueSessionForUser(user);

      expect(result.expiresIn).toBe('2h');
      expect(mocks.signAsync).toHaveBeenCalledWith(
        { sub: 'jefe@demo.local' },
        { expiresIn: '2h' },
      );
    });
  });

  it('contrasena incorrecta -> UnauthorizedException y no firma token', async () => {
    mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));

    await expect(
      service.login({ identifier: 'jefe@demo.local', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocks.signAsync).not.toHaveBeenCalled();
  });

  it('usuario inexistente -> UnauthorizedException con mensaje generico (no filtra existencia)', async () => {
    mocks.findFirst.mockResolvedValue(null);

    const promise = service.login({
      identifier: 'noexiste@demo.local',
      password: 'dev1234',
    });

    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(promise).rejects.toThrow('Credenciales invalidas');
  });

  it('usuario sin passwordHash -> UnauthorizedException', async () => {
    mocks.findFirst.mockResolvedValue(
      await makeDbUser('dev1234', { passwordHash: null }),
    );

    await expect(
      service.login({ identifier: 'jefe@demo.local', password: 'dev1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocks.signAsync).not.toHaveBeenCalled();
  });

  describe('límite de intentos (D1) y auditoría de fallos', () => {
    const wrong = { identifier: 'jefe@demo.local', password: 'wrong' };

    it('el 6.º intento seguido responde 429 con Retry-After, aunque la contraseña sea correcta', async () => {
      mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));
      mocks.signAsync.mockResolvedValue('signed.jwt.token');
      for (let i = 0; i < 5; i += 1) {
        await expect(service.login(wrong, '10.0.0.1')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
      const blocked = service.login(
        { identifier: 'jefe@demo.local', password: 'dev1234' },
        '10.0.0.1',
      );
      await expect(blocked).rejects.toBeInstanceOf(TooManyAttemptsException);
      await expect(blocked).rejects.toMatchObject({
        status: 429,
        retryAfterSeconds: expect.any(Number),
      });
      expect(mocks.signAsync).not.toHaveBeenCalled();
    });

    it('un login correcto borra los fallos del identificador', async () => {
      mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));
      mocks.signAsync.mockResolvedValue('signed.jwt.token');
      for (let i = 0; i < 4; i += 1) {
        await expect(service.login(wrong, '10.0.0.2')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
      await service.login({ identifier: 'jefe@demo.local', password: 'dev1234' }, '10.0.0.2');
      for (let i = 0; i < 4; i += 1) {
        await expect(service.login(wrong, '10.0.0.2')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
    });

    it('cuenta igual un identificador inexistente y no lo escribe en claro en la auditoría', async () => {
      mocks.findFirst.mockResolvedValue(null);
      for (let i = 0; i < 5; i += 1) {
        await expect(
          service.login({ identifier: 'Fantasma@demo.local', password: 'x' }, '10.0.0.3'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      await expect(
        service.login({ identifier: 'fantasma@demo.local', password: 'x' }, '10.0.0.3'),
      ).rejects.toBeInstanceOf(TooManyAttemptsException);
      const last = mocks.record.mock.calls[4][1];
      expect(last).toMatchObject({
        actorUserId: null,
        action: 'LOGIN_FAILED',
        objectType: 'USER',
        after: { reason: 'USUARIO_INEXISTENTE', ip: '10.0.0.3', blocked: true },
      });
      expect(JSON.stringify(last)).not.toContain('antasma');
    });

    it('audita cada fallo con el usuario, el motivo y la IP', async () => {
      mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));
      await expect(service.login(wrong, '10.0.0.4')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mocks.record).toHaveBeenCalledTimes(1);
      expect(mocks.record.mock.calls[0][1]).toEqual({
        actorUserId: 'u1',
        action: 'LOGIN_FAILED',
        objectType: 'USER',
        objectId: 'u1',
        scopeProcessId: null,
        before: null,
        after: { reason: 'CONTRASENA_INCORRECTA', ip: '10.0.0.4', blocked: false },
      });
    });

    it('si falla la auditoría, el login sigue respondiendo 401', async () => {
      mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));
      mocks.record.mockRejectedValueOnce(new Error('BD caída'));
      await expect(service.login(wrong, '10.0.0.5')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('30 fallos desde una IP bloquean a cualquier identificador desde esa IP', async () => {
      mocks.findFirst.mockResolvedValue(null);
      for (let i = 0; i < 30; i += 1) {
        await expect(
          service.login({ identifier: `persona${i}@demo.local`, password: 'x' }, '10.0.0.6'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      await expect(
        service.login({ identifier: 'otra@demo.local', password: 'x' }, '10.0.0.6'),
      ).rejects.toBeInstanceOf(TooManyAttemptsException);
    });

    it('usa los umbrales de la maestra AUTH_PARAM', async () => {
      mocks.findMany.mockResolvedValue([{ code: 'LOGIN_MAX_ATTEMPTS', label: '2' }]);
      mocks.findFirst.mockResolvedValue(await makeDbUser('dev1234'));
      await expect(service.login(wrong, '10.0.0.7')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.login(wrong, '10.0.0.7')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.login(wrong, '10.0.0.7')).rejects.toBeInstanceOf(
        TooManyAttemptsException,
      );
    });
  });

  it('usuario inactivo -> UnauthorizedException', async () => {
    mocks.findFirst.mockResolvedValue(
      await makeDbUser('dev1234', { active: false }),
    );

    await expect(
      service.login({ identifier: 'jefe@demo.local', password: 'dev1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
