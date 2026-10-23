import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { GovernanceScopeService } from './governance-scope.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn() },
  };
  const prisma = prismaObj as unknown as PrismaService;
  const service = new GovernanceScopeService(prisma);
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
    userId: 'u-jefe',
    name: 'Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

/** Lider de `p1` e integrante de `p2` (comparte alcance de lectura de ambos). */
function lider(): CurrentActor {
  return {
    userId: 'u-lider',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: [
      grantFor('p1', RoleCode.LIDER_PROCESO),
      grantFor('p2', RoleCode.INTEGRANTE),
    ],
    roleCodes: new Set([RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['p1', 'p2']),
    isJefeArea: false,
    isAdmin: false,
  };
}

describe('GovernanceScopeService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  describe('requireInScope', () => {
    it('jefe -> where sin filtro de proceso y devuelve la Request', async () => {
      const request = { id: 'req-1', mainProcessId: 'p9' };
      (m.prismaObj.request as any).findFirst.mockResolvedValue(request);

      const res = await m.service.requireInScope(jefe(), 'req-1');

      expect(res).toBe(request);
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0]
        .where;
      expect(where.AND).toEqual([{ id: 'req-1' }, {}]);
    });

    it('no-jefe -> where filtra por mainProcessId in scopedProcessIds', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue({
        id: 'req-1',
        mainProcessId: 'p1',
      });

      await m.service.requireInScope(lider(), 'req-1');

      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0]
        .where;
      expect(where.AND[1].mainProcessId.in.sort()).toEqual(['p1', 'p2']);
    });

    it('404 cuando la Request esta fuera de alcance (findFirst null)', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.requireInScope(lider(), 'req-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('requireRequestManager', () => {
    it('jefe gestiona cualquier Request (no lanza)', () => {
      expect(() =>
        m.service.requireRequestManager(jefe(), { mainProcessId: 'p9' }),
      ).not.toThrow();
    });

    it('lider del proceso principal gestiona (no lanza)', () => {
      expect(() =>
        m.service.requireRequestManager(lider(), { mainProcessId: 'p1' }),
      ).not.toThrow();
    });

    it('403 si el actor no es lider del proceso principal', () => {
      // p2 es grant de INTEGRANTE, no de LIDER_PROCESO -> no es gestor.
      expect(() =>
        m.service.requireRequestManager(lider(), { mainProcessId: 'p2' }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('requireAreaLead', () => {
    it('jefe de area pasa (no lanza)', () => {
      expect(() => m.service.requireAreaLead(jefe())).not.toThrow();
    });

    it('403 para cualquier actor que no sea jefe de area', () => {
      expect(() => m.service.requireAreaLead(lider())).toThrow(
        ForbiddenException,
      );
    });
  });
});
