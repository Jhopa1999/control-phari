import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { CapacityScopeService } from './capacity-scope.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    grant: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = prismaObj as unknown as PrismaService;
  const service = new CapacityScopeService(prisma);
  return { prisma, prismaObj, service };
}

function grantFor(
  processId: string,
  roleCode: RoleCode,
): CurrentActor['grants'][number] {
  return {
    processId,
    processCode: processId.toUpperCase(),
    processName: processId,
    roleCode,
    roleName: roleCode,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

function lider(processId = 'p1'): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: [grantFor(processId, RoleCode.LIDER_PROCESO)],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set([processId]),
    isJefeArea: false,
    isAdmin: false,
  };
}

/** Integrante con grant en p1 pero sin rol de lider: solo se ve a si mismo. */
function integranteConProceso(): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: [grantFor('p1', RoleCode.INTEGRANTE)],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isAdmin: false,
  };
}

describe('CapacityScopeService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  describe('scopedUserIds', () => {
    it("jefe -> 'ALL' sin consultar grants", async () => {
      const res = await m.service.scopedUserIds(m.prisma, jefe());
      expect(res).toBe('ALL');
      expect((m.prismaObj.grant as any).findMany).not.toHaveBeenCalled();
    });

    it('lider -> el mismo + personas con grant activo en sus procesos', async () => {
      (m.prismaObj.grant as any).findMany.mockResolvedValue([
        { userId: 'otro-1' },
        { userId: 'otro-2' },
      ]);

      const res = (await m.service.scopedUserIds(m.prisma, lider())) as string[];

      expect(res.sort()).toEqual(['otro-1', 'otro-2', 'ul']);
      const where = (m.prismaObj.grant as any).findMany.mock.calls[0][0].where;
      expect(where.active).toBe(true);
      expect(where.processId).toEqual({ in: ['p1'] });
    });

    it('integrante con grant NO expande: solo se ve a si mismo (sin consultar grants)', async () => {
      const res = (await m.service.scopedUserIds(
        m.prisma,
        integranteConProceso(),
      )) as string[];

      expect(res).toEqual(['ui']);
      expect((m.prismaObj.grant as any).findMany).not.toHaveBeenCalled();
    });
  });

  describe('listPeople', () => {
    it("jefe -> where { active: true } (sin filtro de userId)", async () => {
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'a', name: 'Ana', identifier: 'ana@demo.local' },
      ]);

      const people = await m.service.listPeople(jefe());

      expect(people).toEqual([
        { id: 'a', name: 'Ana', identifier: 'ana@demo.local' },
      ]);
      const where = (m.prismaObj.user as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({ active: true });
    });

    it('no-jefe -> where { id: { in: scopedUserIds } }', async () => {
      (m.prismaObj.grant as any).findMany.mockResolvedValue([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante', identifier: 'i@demo.local' },
      ]);

      await m.service.listPeople(integranteConProceso());

      const where = (m.prismaObj.user as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({ id: { in: ['ui'] } });
    });
  });
});
