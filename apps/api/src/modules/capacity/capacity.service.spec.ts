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
    task: { findMany: jest.fn() },
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
    isAdmin: false,
  };
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

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => grantFor(p, RoleCode.LIDER_PROCESO)),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
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
    isAdmin: false,
  };
}

/**
 * Integrante CON grant INTEGRANTE en un proceso (p1). Comparte proceso con el
 * lider, pero per specs/10 "Capacidad: Propia" NO debe ver/escribir la
 * capacidad de otras personas del proceso: su alcance es solo el mismo.
 */
function integranteConProceso(processId = 'p1'): CurrentActor {
  return {
    userId: 'ui2',
    name: 'Integrante con proceso',
    identifier: 'integrante.p1@demo.local',
    grants: [grantFor(processId, RoleCode.INTEGRANTE)],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set([processId]),
    isJefeArea: false,
    isAdmin: false,
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

/**
 * Fila candidata de Task tal como la devuelve 	ask.findMany del service
 * (solo los campos seleccionados). Por defecto startDate dentro de 2025-03.
 */
function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    responsibleUserId: 'ui',
    estimateHours: 10,
    startDate: new Date(Date.UTC(2025, 2, 5)),
    endDate: null,
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
    // Por defecto no hay tareas de plan: los tests existentes no esperan plan.
    (m.prismaObj.task as any).findMany.mockResolvedValue([]);
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
      // Sin tareas de plan por defecto: planificado 0, utilizacionPlan 0%.
      expect(row.planificado).toBe(0);
      expect(row.utilizacionPlan).toBe(0);
      expect(row.planSobreDisponible).toBe(false);
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

  // --- Resumen: planificado (vinculacion CAPACIDAD ↔ PLAN, ADITIVO) --------

  describe('summary - planificado', () => {
    it('(a) suma estimateHours de varias tareas de la persona en el mes; utilizacionPlan = round(plan/disponible*100)', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ userId: 'ui', availableHours: 160 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ userId: 'ui', committedHours: 40 })])
        .mockResolvedValueOnce([]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({ responsibleUserId: 'ui', estimateHours: 30 }),
        taskRow({ responsibleUserId: 'ui', estimateHours: 50 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.planificado).toBe(80);
      expect(row.utilizacionPlan).toBe(50); // round(80/160*100)
      expect(row.planSobreDisponible).toBe(false);
      // ADITIVO: comprometido sigue reflejando SOLO asignaciones manuales.
      expect(row.comprometido).toBe(40);
      expect(row.utilizacion).toBe(25);
      expect(row.estado).toBe('OK');
    });

    it('(b) tarea con startDate null pero endDate dentro del mes -> cuenta por endDate', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ userId: 'ui', availableHours: 100 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({
          responsibleUserId: 'ui',
          estimateHours: 25,
          startDate: null,
          endDate: new Date(Date.UTC(2025, 2, 20)),
        }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.planificado).toBe(25);
    });

    it('(c) el where filtra TERMINADA, estimateHours > 0 y responsable; tarea sin fecha no suma (mapeo en memoria)', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ userId: 'ui', availableHours: 100 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      // El mock devuelve una tarea con ambas fechas null: aunque el where la
      // excluye en BD, el mapeo en memoria tampoco la cuenta (ref null).
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({
          responsibleUserId: 'ui',
          estimateHours: 99,
          startDate: null,
          endDate: null,
        }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.planificado).toBe(0);
      // El where excluye TERMINADA, hitos (estimateHours 0) y responsable null.
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ not: 'TERMINADA' });
      expect(where.estimateHours).toEqual({ gt: 0 });
      expect(where.responsibleUserId).toEqual({ not: null });
    });

    it('(d) disponible 0 o null -> utilizacionPlan null (sin division por cero), planificado conserva su valor', async () => {
      // disponible 0
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValueOnce([
        availabilityRow({ userId: 'ui', availableHours: 0 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (m.prismaObj.task as any).findMany.mockResolvedValueOnce([
        taskRow({ responsibleUserId: 'ui', estimateHours: 20 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValueOnce([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [rowZero] = await service.summary(jefe(), { month: '2025-03' });
      expect(rowZero.planificado).toBe(20);
      expect(rowZero.utilizacionPlan).toBeNull();
      expect(rowZero.planSobreDisponible).toBe(false);
      // disponible null (persona con solo plan, sin disponibilidad)
      m = createMocks();
      service = new CapacityService(m.prisma, m.audit, m.scope);
      (m.prismaObj.grant as any).findMany.mockResolvedValue([]);
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({ responsibleUserId: 'ui', estimateHours: 20 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [rowNull] = await service.summary(jefe(), { month: '2025-03' });
      expect(rowNull.disponible).toBeNull();
      expect(rowNull.planificado).toBe(20);
      expect(rowNull.utilizacionPlan).toBeNull();
      expect(rowNull.planSobreDisponible).toBe(false);
    });

    it('(e) planificado > disponible -> planSobreDisponible true; estado/sobrecargado siguen derivando SOLO de comprometido', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ userId: 'ui', availableHours: 100 }),
      ]);
      // Comprometido BAJO (10): estado OK, no sobrecargado, aunque el plan exceda.
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([assignmentRow({ userId: 'ui', committedHours: 10 })])
        .mockResolvedValueOnce([]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({ responsibleUserId: 'ui', estimateHours: 130 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [row] = await service.summary(jefe(), { month: '2025-03' });
      expect(row.planificado).toBe(130);
      expect(row.planSobreDisponible).toBe(true);
      expect(row.utilizacionPlan).toBe(130);
      // El estado sigue siendo OK (comprometido 10 < 100) y no sobrecargado.
      expect(row.comprometido).toBe(10);
      expect(row.estado).toBe('OK');
      expect(row.sobrecargado).toBe(false);
    });

    it('(f) persona con SOLO plan aparece con planificado>0 y comprometido 0; respeta alcance en el where', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([]) // visibles
        .mockResolvedValueOnce([]); // fuera de alcance (lider)
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({ responsibleUserId: 'ul', estimateHours: 15 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ul', name: 'Lider' },
      ]);
      const [row] = await service.summary(lider(['p1']), { month: '2025-03' });
      expect(row.userId).toBe('ul');
      expect(row.planificado).toBe(15);
      expect(row.comprometido).toBe(0);
      // Alcance: para lider/integrante el where usa responsibleUserId IN [...].
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toEqual({ in: ['ul'] });
    });

    it('(f-jefe) alcance ALL -> el where usa responsibleUserId { not: null }', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (m.prismaObj.task as any).findMany.mockResolvedValue([]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([]);
      await service.summary(jefe(), { month: '2025-03' });
      const where = (m.prismaObj.task as any).findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toEqual({ not: null });
    });

    it('tarea con startDate en otro mes no cuenta (mapeo exacto en memoria)', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ userId: 'ui', availableHours: 100 }),
      ]);
      (m.prismaObj.assignment as any).findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      // startDate en abril: la cota de BD la trajo, pero el mapeo la descarta.
      (m.prismaObj.task as any).findMany.mockResolvedValue([
        taskRow({
          responsibleUserId: 'ui',
          estimateHours: 40,
          startDate: new Date(Date.UTC(2025, 3, 2)),
          endDate: new Date(Date.UTC(2025, 2, 28)),
        }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);
      const [row] = await service.summary(jefe(), { month: '2025-03' });
      // startDate manda sobre endDate; abril != marzo -> no suma.
      expect(row.planificado).toBe(0);
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

  // --- Integrante PURO: su PROPIA asignacion (FINDING HIGH, UC-011/US-007) --
  // Un integrante sin grant de lider tiene scopedProcessIds vacio; su alcance
  // de asignaciones es por userId (= el mismo), no por processId IN []. El flujo
  // crear/leer/editar/borrar/resumen de su propia asignacion debe operar.
  describe('integrante PURO opera su propia asignacion', () => {
    it('crea su propia asignacion (processId existente, sin scopedProcessIds -> sin 404)', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.assignment as any).create.mockResolvedValue(
        assignmentRow({ userId: 'ui' }),
      );

      const res = await service.createAssignment(integrante(), {
        userId: 'ui',
        month: '2025-03',
        processId: 'p1',
        committedHours: 40,
      });

      expect(res.userId).toBe('ui');
      expect(res.processId).toBe('p1');
      // El filtro de proceso NO restringe a id IN [] para el integrante puro.
      const processWhere = (m.prismaObj.process as any).findFirst.mock.calls[0][0]
        .where.AND[1];
      expect(processWhere).toEqual({});
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'ASSIGNMENT',
        scopeProcessId: 'p1',
      });
    });

    it('lista: where acota por su userId y NO por processId IN []', async () => {
      (m.prismaObj.assignment as any).findMany.mockResolvedValue([
        assignmentRow({ userId: 'ui' }),
      ]);

      const rows = await service.listAssignments(integrante(), {
        month: '2025-03',
      });

      expect(rows).toHaveLength(1);
      const where = (m.prismaObj.assignment as any).findMany.mock.calls[0][0]
        .where;
      expect(where.userId).toEqual({ in: ['ui'] });
      expect(where.processId).toBeUndefined();
    });

    it('edita su propia asignacion resuelta por id (userId en scope, sin processId IN [])', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(
        assignmentRow({ userId: 'ui' }),
      );
      (m.prismaObj.assignment as any).update.mockResolvedValue(
        assignmentRow({ userId: 'ui', committedHours: 55 }),
      );

      const res = await service.updateAssignment(integrante(), 'as1', {
        committedHours: 55,
      });

      expect(res.committedHours).toBe(55);
      const where = (m.prismaObj.assignment as any).findFirst.mock.calls[0][0]
        .where;
      // Alcance por persona presente; el filtro de proceso es {} (no id IN []).
      expect(where.AND).toContainEqual({ userId: { in: ['ui'] } });
      expect(where.AND).toContainEqual({});
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'ASSIGNMENT',
      });
    });

    it('borra su propia asignacion resuelta por id', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(
        assignmentRow({ userId: 'ui' }),
      );
      (m.prismaObj.assignment as any).delete.mockResolvedValue(
        assignmentRow({ userId: 'ui' }),
      );

      await service.removeAssignment(integrante(), 'as1');

      expect((m.prismaObj.assignment as any).delete).toHaveBeenCalledWith({
        where: { id: 'as1' },
      });
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'DELETE',
        objectType: 'ASSIGNMENT',
        after: null,
      });
    });

    it('resumen: comprometido suma su propia carga, cargaParcial false, estado real', async () => {
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        availabilityRow({ userId: 'ui', availableHours: 160 }),
      ]);
      // Solo UNA llamada a assignment.findMany: la de asignaciones visibles.
      // El integrante puro NO consulta "fuera de alcance" (no tiene frontera).
      (m.prismaObj.assignment as any).findMany.mockResolvedValueOnce([
        assignmentRow({ userId: 'ui', committedHours: 120 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui', name: 'Integrante' },
      ]);

      const [row] = await service.summary(integrante(), { month: '2025-03' });

      expect(row.comprometido).toBe(120);
      expect(row.cargaParcial).toBe(false);
      expect(row.utilizacion).toBe(75);
      expect(row.libre).toBe(40);
      expect(row.estado).toBe('OK');
      // No se dispara la consulta de "fuera de alcance" para el integrante puro.
      expect((m.prismaObj.assignment as any).findMany).toHaveBeenCalledTimes(1);
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

    it('integrante CON grant en un proceso -> SOLO el mismo (specs/10 Capacidad: Propia)', async () => {
      // No debe expandir a personas del proceso: un integrante no es lider.
      const res = await m.scope.scopedUserIds(
        m.prisma,
        integranteConProceso('p1'),
      );
      expect(res).toEqual(['ui2']);
      // Nunca consulta grants del proceso para un integrante.
      expect((m.prismaObj.grant as any).findMany).not.toHaveBeenCalled();
    });
  });

  describe('listAssignments: filtros opcionales intersectan el alcance', () => {
    it('jefe: processId/userId/requestId se aplican directo al where', async () => {
      (m.prismaObj.assignment as any).findMany.mockResolvedValue([]);
      await service.listAssignments(jefe(), {
        month: '2025-03',
        processId: 'pX',
        userId: 'uX',
        requestId: 'rX',
      } as any);
      const where = (m.prismaObj.assignment as any).findMany.mock.calls[0][0]
        .where;
      expect(where.processId).toBe('pX');
      expect(where.userId).toBe('uX');
      expect(where.requestId).toBe('rX');
    });

    it('lider: processId se intersecta con scopedProcessIds (no amplia)', async () => {
      (m.prismaObj.grant as any).findMany.mockResolvedValue([]);
      (m.prismaObj.assignment as any).findMany.mockResolvedValue([]);
      await service.listAssignments(lider(['p1']), {
        month: '2025-03',
        // Pide un proceso fuera de su alcance: la interseccion queda vacia.
        processId: 'pFUERA',
      } as any);
      const where = (m.prismaObj.assignment as any).findMany.mock.calls[0][0]
        .where;
      expect(where.processId).toEqual({ in: [] });
    });

    it('lider: userId pedido se intersecta con scopedUserIds', async () => {
      (m.prismaObj.grant as any).findMany.mockResolvedValue([{ userId: 'uA' }]);
      (m.prismaObj.assignment as any).findMany.mockResolvedValue([]);
      await service.listAssignments(lider(['p1']), {
        month: '2025-03',
        userId: 'uA',
      } as any);
      const where = (m.prismaObj.assignment as any).findMany.mock.calls[0][0]
        .where;
      expect(where.userId).toEqual({ in: ['uA'] });
    });
  });

  describe('updateAssignment: cambios de processId y religado de requestId', () => {
    it('jefe reasigna processId (valida alcance) y religa requestId (valida)', async () => {
      (m.prismaObj.assignment as any).findFirst.mockResolvedValue(
        assignmentRow({ processId: 'p1', requestId: null }),
      );
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p2' });
      (m.prismaObj.request as any).findFirst.mockResolvedValue({ id: 'r-new' });
      (m.prismaObj.assignment as any).update.mockResolvedValue(
        assignmentRow({ processId: 'p2', requestId: 'r-new' }),
      );

      const res = await service.updateAssignment(jefe(), 'as1', {
        processId: 'p2',
        requestId: 'r-new',
        committedHours: 20,
        description: 'nota',
      } as any);

      // Se valido el proceso y la solicitud destino.
      expect((m.prismaObj.process as any).findFirst).toHaveBeenCalled();
      expect((m.prismaObj.request as any).findFirst).toHaveBeenCalled();
      const data = (m.prismaObj.assignment as any).update.mock.calls[0][0].data;
      expect(data.processId).toBe('p2');
      expect(data.requestId).toBe('r-new');
      expect(data.committedHours).toBe(20);
      expect(data.description).toBe('nota');
      expect(res.processId).toBe('p2');
    });
  });

  describe('alcance de escritura del integrante con proceso', () => {
    it('integrante con grant en p1 crea disponibilidad de otra persona de p1 -> 403', async () => {
      // Comparte proceso con el objetivo, pero sigue siendo "solo la suya".
      await expect(
        service.createAvailability(integranteConProceso('p1'), {
          userId: 'otro-de-p1',
          month: '2025-03',
          availableHours: 100,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((m.prismaObj.grant as any).findMany).not.toHaveBeenCalled();
    });

    it('integrante con grant en p1 ve su carga TOTAL agregada de todos sus procesos, sin CARGA_PARCIAL (AC-013)', async () => {
      // Tiene asignaciones en p1 (su proceso) y p2 (otro): debe sumar ambas y
      // NO marcarse parcial, porque su alcance es por userId (todo lo suyo), no
      // por proceso.
      (m.prismaObj.monthlyAvailability as any).findMany.mockResolvedValue([
        { userId: 'ui2', availableHours: 160 },
      ]);
      // Una sola consulta de asignaciones visibles (sin frontera de proceso):
      // suma p1 + p2 = 190. No debe haber segunda consulta "fuera de alcance".
      (m.prismaObj.assignment as any).findMany.mockResolvedValueOnce([
        assignmentRow({ userId: 'ui2', committedHours: 100 }),
        assignmentRow({ userId: 'ui2', committedHours: 90 }),
      ]);
      (m.prismaObj.user as any).findMany.mockResolvedValue([
        { id: 'ui2', name: 'Integrante con proceso' },
      ]);

      const [row] = await service.summary(integranteConProceso('p1'), {
        month: '2025-03',
      });

      expect(row.comprometido).toBe(190);
      expect(row.cargaParcial).toBe(false);
      // No se dispara la consulta de "fuera de alcance" para un integrante.
      expect((m.prismaObj.assignment as any).findMany).toHaveBeenCalledTimes(1);
    });
  });
});
