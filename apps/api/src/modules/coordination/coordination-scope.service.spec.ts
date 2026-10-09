import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { CoordinationScopeService } from './coordination-scope.service';

function grantFor(processId: string, roleCode: RoleCode) {
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
  };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => grantFor(p, RoleCode.LIDER_PROCESO)),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
  };
}

function integranteConProceso(processId = 'p1'): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: [grantFor(processId, RoleCode.INTEGRANTE)],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set([processId]),
    isJefeArea: false,
  };
}

describe('CoordinationScopeService', () => {
  const prismaObj: Record<string, any> = {
    user: { findMany: jest.fn() },
    grant: { findMany: jest.fn() },
  };
  const prisma = prismaObj as unknown as PrismaService;
  const scope = new CoordinationScopeService(prisma);

  beforeEach(() => {
    prismaObj.grant.findMany.mockReset().mockResolvedValue([]);
    prismaObj.user.findMany.mockReset().mockResolvedValue([]);
  });

  describe('dailyLogReadWhere', () => {
    it('jefe -> {} (area)', () => {
      expect(scope.dailyLogReadWhere(jefe())).toEqual({});
    });
    it('lider -> processId in grants LIDER', () => {
      expect(scope.dailyLogReadWhere(lider(['p1']))).toEqual({
        processId: { in: ['p1'] },
      });
    });
    it('integrante con grant -> SOLO authorUserId propio (lección 1, no scopedProcessIds)', () => {
      expect(scope.dailyLogReadWhere(integranteConProceso('p1'))).toEqual({
        authorUserId: 'ui',
      });
    });
  });

  describe('dailyLogWriteWhere', () => {
    it('lider -> solo el propio (authorUserId), no su proceso (§11 D13)', () => {
      expect(scope.dailyLogWriteWhere(lider(['p1']))).toEqual({
        authorUserId: 'ul',
      });
    });
    it('jefe -> {} (puede en su area)', () => {
      expect(scope.dailyLogWriteWhere(jefe())).toEqual({});
    });
  });

  describe('issueWhere / commitmentWhere / meetingWhere (integrante por persona)', () => {
    it('issue integrante -> OR reporta/resuelve', () => {
      expect(scope.issueWhere(integranteConProceso())).toEqual({
        OR: [{ reportedByUserId: 'ui' }, { resolverUserId: 'ui' }],
      });
    });
    it('commitment integrante -> OR asignado/responsable', () => {
      expect(scope.commitmentWhere(integranteConProceso())).toEqual({
        OR: [{ assignedUserId: 'ui' }, { responsibleUserId: 'ui' }],
      });
    });
    it('meeting integrante -> OR responsable/participa', () => {
      expect(scope.meetingWhere(integranteConProceso())).toEqual({
        OR: [
          { responsibleUserId: 'ui' },
          { participants: { some: { userId: 'ui' } } },
        ],
      });
    });
  });

  describe('requestVisibilityWhere (HIGH-2, scopedProcessIds)', () => {
    it('jefe -> {}', () => {
      expect(scope.requestVisibilityWhere(jefe())).toEqual({});
    });
    it('no-jefe -> mainProcessId in scopedProcessIds (TODOS los grants)', () => {
      expect(scope.requestVisibilityWhere(integranteConProceso('p1'))).toEqual({
        mainProcessId: { in: ['p1'] },
      });
    });
  });

  describe('listPeople', () => {
    it('jefe -> User.active = true', async () => {
      await scope.listPeople(jefe());
      expect(prismaObj.user.findMany.mock.calls[0][0].where).toEqual({
        active: true,
      });
    });
    it('integrante -> solo el mismo (no consulta grants del proceso)', async () => {
      await scope.listPeople(integranteConProceso('p1'));
      expect(prismaObj.user.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['ui'] },
      });
      expect(prismaObj.grant.findMany).not.toHaveBeenCalled();
    });
    it('lider -> el + personas con grant en sus procesos LIDER', async () => {
      prismaObj.grant.findMany.mockResolvedValue([
        { userId: 'uA' },
        { userId: 'uB' },
      ]);
      await scope.listPeople(lider(['p1']));
      const where = prismaObj.user.findMany.mock.calls[0][0].where;
      expect(where.id.in).toEqual(expect.arrayContaining(['ul', 'uA', 'uB']));
      expect(where.id.in).toHaveLength(3);
    });
  });
});
