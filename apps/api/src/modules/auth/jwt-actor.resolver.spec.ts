import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { JwtActorResolver } from './jwt-actor.resolver';
import { RoleCode } from './role-code';

type UserFindFirst = jest.Mock;

function createMocks() {
  const findFirst: UserFindFirst = jest.fn();
  const prisma = { user: { findFirst } } as unknown as PrismaService;
  const verifyAsync = jest.fn();
  const jwt = { verifyAsync } as unknown as JwtService;
  return { prisma, findFirst, jwt, verifyAsync };
}

/** Usuario activo con un grant JEFE_AREA en un proceso, tal como lo devuelve Prisma. */
function makeDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    identifier: 'jefe@demo.local',
    name: 'Ana Jefa',
    active: true,
    grants: [
      {
        processId: 'p1',
        role: { code: RoleCode.JEFE_AREA, name: 'Jefe de area' },
        process: { code: 'FIBI', name: 'BI' },
      },
    ],
    ...overrides,
  };
}

describe('JwtActorResolver', () => {
  let resolver: JwtActorResolver;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    resolver = new JwtActorResolver(mocks.prisma, mocks.jwt);
  });

  it('token valido -> CurrentActor con roles y alcance derivados del grant', async () => {
    mocks.verifyAsync.mockResolvedValue({ sub: 'jefe@demo.local' });
    mocks.findFirst.mockResolvedValue(makeDbUser());

    const actor = await resolver.resolve('Bearer good.token.here');

    expect(actor).not.toBeNull();
    expect(actor?.identifier).toBe('jefe@demo.local');
    expect(actor?.roleCodes.has(RoleCode.JEFE_AREA)).toBe(true);
    expect(actor?.isJefeArea).toBe(true);
    expect([...(actor?.scopedProcessIds ?? [])]).toEqual(['p1']);
    // Verifica contra el token extraido (sin el prefijo Bearer).
    expect(mocks.verifyAsync).toHaveBeenCalledWith('good.token.here');
  });

  it('header ausente -> null (sin tocar la BD)', async () => {
    const actor = await resolver.resolve(undefined);
    expect(actor).toBeNull();
    expect(mocks.verifyAsync).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('header sin prefijo Bearer -> null', async () => {
    const actor = await resolver.resolve('token-sin-bearer');
    expect(actor).toBeNull();
    expect(mocks.verifyAsync).not.toHaveBeenCalled();
  });

  it('token con firma invalida o expirado -> null (no propaga la excepcion)', async () => {
    mocks.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    const actor = await resolver.resolve('Bearer bad.token');

    expect(actor).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('usuario inactivo -> null', async () => {
    mocks.verifyAsync.mockResolvedValue({ sub: 'jefe@demo.local' });
    mocks.findFirst.mockResolvedValue(makeDbUser({ active: false }));

    const actor = await resolver.resolve('Bearer good.token');

    expect(actor).toBeNull();
  });

  it('token sin claim sub -> null', async () => {
    mocks.verifyAsync.mockResolvedValue({});

    const actor = await resolver.resolve('Bearer good.token');

    expect(actor).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
