import { PrismaService } from '../../database/prisma.service';
import { loadActorByIdentifier } from './load-actor';
import { RoleCode } from './role-code';
/**
 * Pruebas de la resolucion del actor centradas en el rol de SISTEMA ADMIN
 * (design a/f): el origen de `RoleCode.ADMIN` es la columna `User.isAdmin`, NO
 * un grant por proceso. Un admin sin grants obtiene ADMIN en `roleCodes`,
 * `scopedProcessIds` vacio e `isAdmin===true`; un no-admin nunca obtiene ADMIN.
 */
type FindFirstResult = Awaited<ReturnType<PrismaService['user']['findFirst']>>;
function makePrisma(user: FindFirstResult): PrismaService {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(user),
    },
  } as unknown as PrismaService;
}
function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-admin',
    identifier: 'admin@demo.local',
    name: 'Alex Admin',
    active: true,
    isAdmin: false,
    grants: [],
    ...overrides,
  } as unknown as FindFirstResult;
}
describe('loadActorByIdentifier - rol ADMIN de sistema', () => {
  it('isAdmin:true sin grants => roleCodes contiene ADMIN, scope vacio e isAdmin true', async () => {
    const prisma = makePrisma(baseUser({ isAdmin: true, grants: [] }));
    const actor = await loadActorByIdentifier(prisma, 'admin@demo.local');
    expect(actor).not.toBeNull();
    expect(actor?.isAdmin).toBe(true);
    expect(actor?.roleCodes.has(RoleCode.ADMIN)).toBe(true);
    expect(actor?.scopedProcessIds.size).toBe(0);
    expect(actor?.isJefeArea).toBe(false);
    expect(actor?.grants).toHaveLength(0);
  });
  it('isAdmin:false => ADMIN NO esta en roleCodes y isAdmin es false', async () => {
    const prisma = makePrisma(
      baseUser({
        id: 'u-int',
        identifier: 'integrante@demo.local',
        isAdmin: false,
        grants: [
          {
            processId: 'p1',
            process: { code: 'FIBI', name: 'BI' },
            role: { code: 'INTEGRANTE', name: 'Integrante' },
          },
        ],
      }),
    );
    const actor = await loadActorByIdentifier(prisma, 'integrante@demo.local');
    expect(actor?.isAdmin).toBe(false);
    expect(actor?.roleCodes.has(RoleCode.ADMIN)).toBe(false);
    expect(actor?.roleCodes.has(RoleCode.INTEGRANTE)).toBe(true);
    expect(Array.from(actor?.scopedProcessIds ?? [])).toEqual(['p1']);
  });
  it('ADMIN es ortogonal a los grants: admin con grant JEFE_AREA mantiene ambos', async () => {
    const prisma = makePrisma(
      baseUser({
        isAdmin: true,
        grants: [
          {
            processId: 'p2',
            process: { code: 'FIID', name: 'Integraciones' },
            role: { code: 'JEFE_AREA', name: 'Jefe de area' },
          },
        ],
      }),
    );
    const actor = await loadActorByIdentifier(prisma, 'admin@demo.local');
    expect(actor?.isAdmin).toBe(true);
    expect(actor?.roleCodes.has(RoleCode.ADMIN)).toBe(true);
    expect(actor?.roleCodes.has(RoleCode.JEFE_AREA)).toBe(true);
    expect(actor?.isJefeArea).toBe(true);
    // El grant SI amplia el scope por proceso; ADMIN por si solo no.
    expect(Array.from(actor?.scopedProcessIds ?? [])).toEqual(['p2']);
  });
});
