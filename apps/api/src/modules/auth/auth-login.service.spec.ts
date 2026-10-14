import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { AuthLoginService } from './auth-login.service';
import { hashPassword } from './password-hash';

function createMocks() {
  const findFirst = jest.fn();
  const prisma = { user: { findFirst } } as unknown as PrismaService;
  const signAsync = jest.fn();
  const jwt = { signAsync } as unknown as JwtService;
  return { prisma, findFirst, jwt, signAsync };
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
    service = new AuthLoginService(mocks.prisma, mocks.jwt);
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

  it('usuario inactivo -> UnauthorizedException', async () => {
    mocks.findFirst.mockResolvedValue(
      await makeDbUser('dev1234', { active: false }),
    );

    await expect(
      service.login({ identifier: 'jefe@demo.local', password: 'dev1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
