import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { CapacityService } from './capacity.service';
import { CapacityScopeService } from './capacity-scope.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    monthlyAvailability: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    assignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    process: { findFirst: jest.fn() },
    request: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    grant: { findMany: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new CapacityScopeService(prisma);
  return { prisma, prismaObj, audit, auditRecord, scope };
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
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
  };
}

function integrante(): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function availabilityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'av1',
    userId: 'ui',
    month: new Date(Date.UTC(2025, 2, 1)),
    availableHours: 160,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'as1',
    userId: 'ui',
    month: new Date(Date.UTC(2025, 2, 1)),
    processId: 'p1',
    requestId: null,
    committedHours: 40,
    description: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('CapacityService', () => {
  let service: CapacityService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new CapacityService(m.prisma, m.audit, m.scope);
    (m.prismaObj.grant as any).findMany.mockResolvedValue([]);
  });

  // --- Resumen (design §1.4/§2.4, AC-012/013) -----------------------------

  describe('summary', () => {
    it('disponible 160 / comprometido 120 -> util 75, libre 40, OK, no sobrecargado', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ availableHours: 160 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([
          assignmentRow({ committedHours: 50 }),
          assignmentRow({ id: 'as2', committedHours: 70 }),
        ]) // visibles
        .mockResolvedValueOnce([]); // fuera de alcance
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.disponible).toBe(160);
      expect(row.comprometido).toBe(120);
      expect(row.utilizacion).toBe(75);
      expect(row.libre).toBe(40);
      expect(row.estado).toBe('OK');
      expect(row.sobrecargado).toBe(false);
      expect(row.cargaParcial).toBe(false);
    });

    it('comprometido > disponible -> libre < 0, SOBRECARGA, sobrecargado true (sin lanzar)', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ availableHours: 100 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ committedHours: 130 })])
        .mockResolvedValueOnce([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.libre).toBe(-30);
      expect(row.sobrecargado).toBe(true);
      expect(row.estado).toBe('SOBRECARGA');
    });

    it('disponible 0 -> util null, libre null, SIN_DISPONIBILIDAD (sin division por cero)', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ availableHours: 0 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ committedHours: 20 })])
        .mockResolvedValueOnce([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.utilizacion).toBeNull();
      expect(row.libre).toBeNull();
      expect(row.estado).toBe('SIN_DISPONIBILIDAD');
    });

    it('disponibilidad ausente -> SIN_DISPONIBILIDAD con disponible null', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ committedHours: 10 })])
        .mockResolvedValueOnce([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.disponible).toBeNull();
      expect(row.estado).toBe('SIN_DISPONIBILIDAD');
      expect(row.comprometido).toBe(10);
    });

    it('AC-013: jefe suma dos procesos, cargaParcial false, util/libre sobre el total', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ availableHours: 160 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([
          assignmentRow({ processId: 'p1', committedHours: 60 }),
          assignmentRow({ id: 'as2', processId: 'p2', committedHours: 40 }),
        ])
        .mockResolvedValueOnce([]); // el jefe no consulta fuera de alcance
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.comprometido).toBe(100);
      expect(row.cargaParcial).toBe(false);
      expect(row.utilizacion).toBe(63);
      expect(row.libre).toBe(60);
    });

    it('AC-013 + FINDING 4: lider con carga fuera de su alcance -> CARGA_PARCIAL, util/libre null', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ availableHours: 160 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ processId: 'p1', committedHours: 60 })]) // visible
        .mockResolvedValueOnce([{ userId: 'ui' }]); // existe carga en p2 (fuera)
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(lider(['p1']), { month: '2025-03' });
      expect(row.estado).toBe('CARGA_PARCIAL');
      expect(row.cargaParcial).toBe(true);
      expect(row.utilizacion).toBeNull();
      expect(row.libre).toBeNull();
      expect(row.comprometido).toBe(60);
    });

    it('lider sin carga fuera de alcance -> cargaParcial false y util/libre normales', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ availableHours: 100 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ processId: 'p1', committedHours: 40 })])
        .mockResolvedValueOnce([]); // sin carga fuera
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(lider(['p1']), { month: '2025-03' });
      expect(row.cargaParcial).toBe(false);
      expect(row.utilizacion).toBe(40);
      expect(row.libre).toBe(60);
    });

    it('jefe: el where de disponibilidad no filtra por userId (scopedUserIds = ALL)', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([]);

      await service.summary(jefe(), { month: '2025-03' });
      const where = (m.prismaObj.monthlyAvailability as any).findMany.mock.calls[0][0].where;
      expect(where.userId).toBeUndefined();
    });

    it('lectura nunca pide filas fuera de scopedUserIds del integrante', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([]);

      await service.summary(integrante(), { month: '2025-03' });
      const where = (m.prismaObj.monthlyAvailability as any).findMany.mock.calls[0][0].where;
      expect(where.userId).toEqual({ in: ['ui'] });
    });
  });

  // --- Disponibilidad: crear/editar, duplicado, validaciones --------------

  describe('createAvailability', () => {
    it('crea y audita CREATE MONTHLY_AVAILABILITY con scopeProcessId null', async () => {
      (m.prismaObj.monthlyAvailability as any).create.mockResolvedValue(
        availabilityRow(),
      );

      const res = await service.createAvailability(jefe(), {
        userId: 'ui',
        month: '2025-03',
        availableHours: 160,
      });

      expect(res.month).toBe('2025-03');
      expect(res.availableHours).toBe(160);
      const data = (m.prismaObj.monthlyAvailability as any).create.mock.calls[0][0].data;
      expect(data.month.toISOString()).toBe('2025-03-01T00:00:00.000Z');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'MONTHLY_AVAILABILITY',
        scopeProcessId: null,
        before: null,
      });
    });

    it('duplicado persona/mes (P2002) -> 409', async () => {
      (m.prismaObj.monthlyAvailability as any).create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      await expect(
        service.createAvailability(jefe(), {
          userId: 'ui',
          month: '2025-03',
          availableHours: 160,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('integrante crea disponibilidad de otra persona -> 403', async () => {
      await expect(
        service.createAvailability(integrante(), {
          userId: 'otro',
          month: '2025-03',
          availableHours: 160,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((m.prismaObj.monthlyAvailability as any).create).not.toHaveBeenCalled();
    });

    it('lider crea disponibilidad de persona fuera de su alcance -> 404', async () => {
      // sus procesos no tienen a 'otro' (grant.findMany devuelve [])
      await expect(
        service.createAvailability(lider(['p1']), {
          userId: 'otro',
          month: '2025-03',
          availableHours: 160,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateAvailability', () => {
    it('edita en alcance y audita UPDATE', async () => {
      (m.prismaObj.monthlyAvailability as any).findFirst.mockResolvedValue(
        availabilityRow(),
      );
      (m.prismaObj.monthlyAvailability as any).update.mockResolvedValue(
        availabilityRow({ availableHours: 150 }),
      );

      const res = await service.updateAvailability(jefe(), 'av1', {
        availableHours: 150,
      });
      expect(res.availableHours).toBe(150);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'MONTHLY_AVAILABILITY',
      });
    });

    it('integrante edita disponibilidad ajena por id -> 404 (findFirst acotado)', async () => {
      (m.prismaObj.monthlyAvailability as any).findFirst.mockResolvedValue(null);
      await expect(
        service.updateAvailability(integrante(), 'ajena', {
          availableHours: 10,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const where = (m.prismaObj.monthlyAvailability as any).findFirst.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ userId: { in: ['ui'] } });
    });
  });

  // --- Asignaciones: crear/editar/borrar, alcance -------------------------

  describe('createAssignment', () => {
    it('crea en alcance y audita CREATE ASSIGNMENT con scopeProcessId = processId', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.assignment as any).create.mockResolvedValue(assignmentRow());

      const res = await service.createAssignment(jefe(), {
        userId: 'ui',
        month: '2025-03',
        processId: 'p1',
        committedHours: 40,
      });
      expect(res.processId).toBe('p1');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'ASSIGNMENT',
        scopeProcessId: 'p1',
      });
    });

    it('sobreasignacion NO bloquea: crea aunque exceda la disponibilidad', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.assignment as any).create.mockResolvedValue(
        assignmentRow({ committedHours: 9999 }),
      );

      const res = await service.createAssignment(jefe(), {
        userId: 'ui',
        month: '2025-03',
        processId: 'p1',
        committedHours: 9999,
      });
      expect(res.committedHours).toBe(9999);
    });

    it('lider crea asignacion con processId fuera de alcance -> 404', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue(null);
      await expect(
        service.createAssignment(lider(['p1']), {
          userId: 'ul',
          month: '2025-03',
          processId: 'pX',
          committedHours: 10,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('integrante crea asignacion de otra persona -> 403', async () => {
      await expect(
        service.createAssignment(integrante(), {
          userId: 'otro',
          month: '2025-03',
          processId: 'p1',
          committedHours: 10,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requestId de una Request fuera de alcance -> 404 (no 400)', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);

      await expect(
        service.createAssignment(lider(['p1']), {
          userId: 'ul',
          month: '2025-03',
          processId: 'p1',
          requestId: '11111111-1111-1111-1111-111111111111',
          committedHours: 10,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateAssignment / removeAssignment', () => {
    it('lider resuelve asignacion de proceso ajeno por id -> 404', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(null);
      await expect(
        service.updateAssignment(lider(['p1']), 'as-ajena', {
          committedHours: 5,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requestId null DESLIGA la solicitud (set/clear) sin validar alcance', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(
        assignmentRow({ requestId: 'req-previo' }),
      );
      (m.prismaObj.assignment as any).update.mockResolvedValue(
        assignmentRow({ requestId: null }),
      );

      const res = await service.updateAssignment(jefe(), 'as1', {
        requestId: null,
      });

      // No se valida alcance de solicitud al desligar (no hay nada que resolver).
      expect((m.prismaObj.request as any).findFirst).not.toHaveBeenCalled();
      // La actualizacion escribe requestId: null (limpia el vinculo).
      expect((m.prismaObj.assignment as any).update).toHaveBeenCalledWith({
        where: { id: 'as1' },
        data: { requestId: null },
      });
      expect(res.requestId).toBeNull();
    });

    it('borra en alcance y audita DELETE ASSIGNMENT', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(assignmentRow());
      (m.prismaObj.assignment as any).delete.mockResolvedValue(assignmentRow());

      await service.removeAssignment(jefe(), 'as1');
      expect((m.prismaObj.assignment as any).delete).toHaveBeenCalledWith({
        where: { id: 'as1' },
      });
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'DELETE',
        objectType: 'ASSIGNMENT',
        scopeProcessId: 'p1',
        after: null,
      });
    });

    it('integrante borra asignacion ajena por id -> 404', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(null);
      await expect(
        service.removeAssignment(integrante(), 'ajena'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- Alcance por persona (scopedUserIds) --------------------------------

  describe('scopedUserIds', () => {
    it('jefe -> ALL', async () => {
      const res = await m.scope.scopedUserIds(m.prisma, jefe());
      expect(res).toBe('ALL');
    });

    it('integrante -> solo el mismo', async () => {
      const res = await m.scope.scopedUserIds(m.prisma, integrante());
      expect(res).toEqual(['ui']);
    });

    it('lider -> el mismo + personas con grant activo en sus procesos', async () => {
      (m.prismaObj.grant as any).findMany.mockResolvedValue([
        { userId: 'uA' },
        { userId: 'uB' },
      ]);
      const res = (await m.scope.scopedUserIds(m.prisma, lider(['p1']))) as string[];
      expect(res).toEqual(expect.arrayContaining(['ul', 'uA', 'uB']));
      expect(res).toHaveLength(3);
    });
  });
});
