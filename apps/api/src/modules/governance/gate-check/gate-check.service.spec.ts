import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestState } from '../../request/request-state';
import { RequestStateService } from '../../request/request-state.service';
import { GovernanceScopeService } from '../governance-scope.service';
import { GovernanceStateService } from '../governance-state.service';
import { GateCode, GateStatus, GOVERNANCE_ROUTE } from '../gate';
import { GateCheckService } from './gate-check.service';

/** Actor jefe de area (sin filtro de alcance). */
const JEFE: CurrentActor = {
  userId: 'u-jefe',
  name: 'Ana Jefa',
  identifier: 'jefe@demo.local',
  grants: [],
  roleCodes: new Set([RoleCode.JEFE_AREA]),
  scopedProcessIds: new Set(),
  isJefeArea: true,
  isAdmin: false,
};

type Mocks = {
  prisma: PrismaService;
  gateCheck: {
    upsert: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  gatePendingItem: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  validationRecord: { findMany: jest.Mock };
  request: { findFirst: jest.Mock; update: jest.Mock };
  user: { findUnique: jest.Mock };
  auditRecord: jest.Mock;
  service: GateCheckService;
};

function makeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'req-1',
    mainProcessId: 'proc-1',
    operationalState: RequestState.EN_EJECUCION,
    governanceRoute: GOVERNANCE_ROUTE.COMPLETA,
    blockedReason: null,
    blockedAt: null,
    blockedByUserId: null,
    blockedResolvedAt: null,
    blockedResolvedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeGate(gateCode: GateCode, overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: `gate-${gateCode}`,
    requestId: 'req-1',
    gateCode,
    status: GateStatus.PENDIENTE,
    conditionText: 'cond',
    authorityText: 'auth',
    waiverReason: null,
    decidedAt: null,
    decidedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(): Mocks {
  const gateCheck = {
    upsert: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  };
  const gatePendingItem = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const validationRecord = { findMany: jest.fn().mockResolvedValue([]) };
  const request = { findFirst: jest.fn(), update: jest.fn() };
  // Resolucion del nombre de quien decidio un control (solo cuando hay FK).
  const user = { findUnique: jest.fn().mockResolvedValue({ name: 'Decididor' }) };

  const prismaObj: Record<string, unknown> = {
    gateCheck,
    gatePendingItem,
    validationRecord,
    request,
    user,
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new GovernanceScopeService(prisma);
  const state = new RequestStateService(prisma);
  const governanceState = new GovernanceStateService(state);
  const service = new GateCheckService(prisma, audit, scope, state, governanceState);

  return {
    prisma,
    gateCheck,
    gatePendingItem,
    validationRecord,
    request,
    user,
    auditRecord,
    service,
  };
}

/** upsert devuelve el gate con el gateCode pedido (materializacion lazy). */
function stubUpsert(gateCheck: Mocks['gateCheck']) {
  gateCheck.upsert.mockImplementation((args: { where: { gate_check_request_gate_unique: { gateCode: GateCode } } }) =>
    Promise.resolve(makeGate(args.where.gate_check_request_gate_unique.gateCode)),
  );
  gateCheck.update.mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
    const code = args.where.id.replace('gate-', '') as GateCode;
    return Promise.resolve(makeGate(code, args.data));
  });
}

describe('GateCheckService', () => {
  describe('getForRequest (materializacion lazy + derivacion)', () => {
    it('materializa los 5 gates y deriva GC1-GC3 del estado real', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ operationalState: RequestState.EN_EJECUCION }),
      );
      stubUpsert(m.gateCheck);

      const board = await m.service.getForRequest(JEFE, 'req-1');

      expect(board.gates).toHaveLength(5);
      expect(m.gateCheck.upsert).toHaveBeenCalledTimes(5);
      // En EN_EJECUCION, GC1/GC2/GC3 ya estan CUMPLIDOs (fases previas).
      const byCode = Object.fromEntries(board.gates.map((g) => [g.gateCode, g]));
      expect(byCode[GateCode.GC1].status).toBe(GateStatus.CUMPLIDO);
      expect(byCode[GateCode.GC2].status).toBe(GateStatus.CUMPLIDO);
      expect(byCode[GateCode.GC3].status).toBe(GateStatus.CUMPLIDO);
      // Gates derivados sin decididor: decidedByName null y sin consultar User.
      expect(byCode[GateCode.GC1].decidedByName).toBeNull();
      expect(m.user.findUnique).not.toHaveBeenCalled();
    });

    it('EXPLORACION fuerza GC4 a NO_APLICA (no autoriza produccion)', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ governanceRoute: GOVERNANCE_ROUTE.EXPLORACION }),
      );
      stubUpsert(m.gateCheck);

      const board = await m.service.getForRequest(JEFE, 'req-1');
      const gc4 = board.gates.find((g) => g.gateCode === GateCode.GC4);
      expect(gc4?.status).toBe(GateStatus.NO_APLICA);
    });

    it('GC4 refleja bloqueo por validacion blocking sin resolver y se desbloquea tras resolve', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      stubUpsert(m.gateCheck);
      // Validacion bloqueante sin resolver.
      m.validationRecord.findMany.mockResolvedValue([
        { blocking: true, blockingResolved: false, validationTypeCode: 'FUNCIONAL_ACEPTACION', resultCode: 'APROBADA' },
      ]);

      let board = await m.service.getForRequest(JEFE, 'req-1');
      let gc4 = board.gates.find((g) => g.gateCode === GateCode.GC4);
      expect(gc4?.validationSummary?.approvable).toBe(false);
      expect(gc4?.validationSummary?.blockingUnresolved).toBe(1);

      // Tras resolver el bloqueo (y con obligatoria aprobatoria) GC4 es aprobable.
      m.validationRecord.findMany.mockResolvedValue([
        { blocking: true, blockingResolved: true, validationTypeCode: 'FUNCIONAL_ACEPTACION', resultCode: 'APROBADA' },
      ]);
      board = await m.service.getForRequest(JEFE, 'req-1');
      gc4 = board.gates.find((g) => g.gateCode === GateCode.GC4);
      expect(gc4?.validationSummary?.approvable).toBe(true);
    });
  });

  describe('advanceStage mark-ready (recomputo §1.5)', () => {
    it('rechaza (409) con validacion bloqueante sin resolver', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ operationalState: RequestState.EN_VALIDACION }),
      );
      m.validationRecord.findMany.mockResolvedValue([
        { blocking: true, blockingResolved: false, validationTypeCode: 'FUNCIONAL_ACEPTACION', resultCode: 'APROBADA' },
      ]);

      await expect(
        m.service.advanceStage(JEFE, 'req-1', 'mark-ready'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.request.update).not.toHaveBeenCalled();
    });

    it('rechaza (409) cuando falta la validacion obligatoria de la ruta', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ operationalState: RequestState.EN_VALIDACION }),
      );
      m.validationRecord.findMany.mockResolvedValue([]);

      await expect(
        m.service.advanceStage(JEFE, 'req-1', 'mark-ready'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('avanza EN_VALIDACION -> LISTA_PARA_LIBERAR con obligatoria aprobatoria y sin bloqueo', async () => {
      const m = setup();
      m.request.findFirst
        .mockResolvedValueOnce(
          makeRequest({ operationalState: RequestState.EN_VALIDACION }),
        )
        // segunda llamada (getForRequest final) ya en el nuevo estado.
        .mockResolvedValue(
          makeRequest({ operationalState: RequestState.LISTA_PARA_LIBERAR }),
        );
      m.validationRecord.findMany.mockResolvedValue([
        { blocking: false, blockingResolved: false, validationTypeCode: 'FUNCIONAL_ACEPTACION', resultCode: 'APROBADA' },
      ]);
      m.request.update.mockResolvedValue({ operationalState: RequestState.LISTA_PARA_LIBERAR });
      stubUpsert(m.gateCheck);

      await m.service.advanceStage(JEFE, 'req-1', 'mark-ready');

      expect(m.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { operationalState: RequestState.LISTA_PARA_LIBERAR },
        }),
      );
      // Auditoria del UPDATE de REQUEST dentro de $transaction.
      expect(m.auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'REQUEST', action: 'UPDATE' }),
      );
    });
  });

  describe('approve', () => {
    it('aprobar GC1/GC2/GC3 por este endpoint responde 409', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      stubUpsert(m.gateCheck);
      m.gateCheck.findUnique.mockImplementation((args: { where: { gate_check_request_gate_unique: { gateCode: GateCode } } }) =>
        Promise.resolve(makeGate(args.where.gate_check_request_gate_unique.gateCode)),
      );

      for (const gate of ['GC1', 'GC2', 'GC3']) {
        await expect(
          m.service.approve(JEFE, 'req-1', gate, {}),
        ).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('GC4 bloqueado por validacion blocking sin resolver responde 409', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ operationalState: RequestState.LISTA_PARA_LIBERAR }),
      );
      stubUpsert(m.gateCheck);
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC4));
      m.validationRecord.findMany.mockResolvedValue([
        { blocking: true, blockingResolved: false, validationTypeCode: 'FUNCIONAL_ACEPTACION', resultCode: 'APROBADA' },
      ]);

      await expect(
        m.service.approve(JEFE, 'req-1', 'GC4', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.request.update).not.toHaveBeenCalled();
    });

    it('GC4 aprobable mueve LISTA_PARA_LIBERAR -> EN_ESTABILIZACION y audita', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ operationalState: RequestState.LISTA_PARA_LIBERAR }),
      );
      stubUpsert(m.gateCheck);
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC4));
      m.validationRecord.findMany.mockResolvedValue([
        { blocking: false, blockingResolved: false, validationTypeCode: 'FUNCIONAL_ACEPTACION', resultCode: 'APROBADA' },
      ]);
      m.request.update.mockResolvedValue({ operationalState: RequestState.EN_ESTABILIZACION });

      const result = await m.service.approve(JEFE, 'req-1', 'GC4', {});

      // El gate decidido resuelve el nombre de quien decidio desde su FK.
      expect(result.decidedByName).toBe('Decididor');
      expect(m.user.findUnique).toHaveBeenCalledWith({
        where: { id: JEFE.userId },
        select: { name: true },
      });
      expect(m.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { operationalState: RequestState.EN_ESTABILIZACION },
        }),
      );
      expect(m.auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'GATE_CHECK' }),
      );
      expect(m.auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'REQUEST', action: 'UPDATE' }),
      );
    });
  });

  describe('waive', () => {
    it('requiere ruta compatible: COMPLETA rechaza (400)', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ governanceRoute: GOVERNANCE_ROUTE.COMPLETA }),
      );

      await expect(
        m.service.waive(JEFE, 'req-1', 'GC4', { waiverReason: 'motivo' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('SIMPLIFICADA permite NO_APLICA con motivo', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ governanceRoute: GOVERNANCE_ROUTE.SIMPLIFICADA }),
      );
      stubUpsert(m.gateCheck);
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC4));
      m.gateCheck.update.mockResolvedValue(
        makeGate(GateCode.GC4, { status: GateStatus.NO_APLICA, waiverReason: 'motivo' }),
      );

      const result = await m.service.waive(JEFE, 'req-1', 'GC4', {
        waiverReason: 'motivo',
      });
      expect(result.status).toBe(GateStatus.NO_APLICA);
    });
  });

  describe('parseGateCode / alcance de gestor', () => {
    it('rechaza (400) un gateCode desconocido antes de tocar BD', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());

      await expect(
        m.service.addPendingItem(JEFE, 'req-1', 'GC9', { description: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('403 si el actor no es gestor del proceso principal de la Request', async () => {
      const m = setup();
      const LIDER_AJENO: CurrentActor = {
        userId: 'u-lider',
        name: 'Beto',
        identifier: 'lider@demo.local',
        grants: [
          {
            processId: 'proc-OTRO',
            processCode: 'OTRO',
            processName: 'Otro',
            roleCode: RoleCode.LIDER_PROCESO,
            roleName: RoleCode.LIDER_PROCESO,
          },
        ],
        roleCodes: new Set([RoleCode.LIDER_PROCESO]),
        scopedProcessIds: new Set(['proc-1', 'proc-OTRO']),
        isJefeArea: false,
        isAdmin: false,
      };
      m.request.findFirst.mockResolvedValue(makeRequest());

      await expect(
        m.service.addPendingItem(LIDER_AJENO, 'req-1', 'GC1', {
          description: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('pendientes (addPendingItem / resolvePendingItem)', () => {
    it('addPendingItem crea el faltante y audita CREATE', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      stubUpsert(m.gateCheck);
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC1));
      m.gatePendingItem.create.mockResolvedValue({
        id: 'item-1',
        gateCheckId: 'gate-GC1',
        description: 'Falta evidencia',
        ownerUserId: null,
        reviewDate: null,
        resolved: false,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await m.service.addPendingItem(JEFE, 'req-1', 'GC1', {
        description: 'Falta evidencia',
      });

      expect(res.id).toBe('item-1');
      expect(res.resolved).toBe(false);
      expect(m.auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          objectType: 'GATE_PENDING_ITEM',
          action: 'CREATE',
        }),
      );
    });

    it('resolvePendingItem 404 si el faltante no pertenece al gate', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC1));
      m.gatePendingItem.findFirst.mockResolvedValue(null);

      await expect(
        m.service.resolvePendingItem(JEFE, 'req-1', 'GC1', 'item-x', {
          resolved: true,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolvePendingItem marca resuelto (resolvedAt Date) y audita UPDATE', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC1));
      m.gatePendingItem.findFirst.mockResolvedValue({
        id: 'item-1',
        gateCheckId: 'gate-GC1',
        resolved: false,
      });
      m.gatePendingItem.update.mockResolvedValue({
        id: 'item-1',
        gateCheckId: 'gate-GC1',
        description: 'd',
        ownerUserId: 'owner-1',
        reviewDate: new Date(),
        resolved: true,
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await m.service.resolvePendingItem(
        JEFE,
        'req-1',
        'GC1',
        'item-1',
        {
          resolved: true,
          description: 'd',
          ownerUserId: 'owner-1',
          reviewDate: '2026-02-01T00:00:00.000Z',
        },
      );

      expect(res.resolved).toBe(true);
      const data = m.gatePendingItem.update.mock.calls[0][0].data;
      expect(data.resolved).toBe(true);
      expect(data.resolvedAt).toBeInstanceOf(Date);
      expect(data.owner).toEqual({ connect: { id: 'owner-1' } });
      expect(data.reviewDate).toBeInstanceOf(Date);
    });

    it('resolvePendingItem con resolved:false limpia resolvedAt (null)', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC1));
      m.gatePendingItem.findFirst.mockResolvedValue({
        id: 'item-1',
        gateCheckId: 'gate-GC1',
        resolved: true,
      });
      m.gatePendingItem.update.mockResolvedValue({
        id: 'item-1',
        gateCheckId: 'gate-GC1',
        description: 'd',
        ownerUserId: null,
        reviewDate: null,
        resolved: false,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await m.service.resolvePendingItem(JEFE, 'req-1', 'GC1', 'item-1', {
        resolved: false,
      });

      const data = m.gatePendingItem.update.mock.calls[0][0].data;
      expect(data.resolved).toBe(false);
      expect(data.resolvedAt).toBeNull();
    });
  });

  describe('advanceStage request-validation / confirm-stabilization', () => {
    it('request-validation mueve EN_EJECUCION -> EN_VALIDACION', async () => {
      const m = setup();
      m.request.findFirst
        .mockResolvedValueOnce(
          makeRequest({ operationalState: RequestState.EN_EJECUCION }),
        )
        .mockResolvedValue(
          makeRequest({ operationalState: RequestState.EN_VALIDACION }),
        );
      m.request.update.mockResolvedValue({});
      stubUpsert(m.gateCheck);

      await m.service.advanceStage(JEFE, 'req-1', 'request-validation');

      expect(m.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { operationalState: RequestState.EN_VALIDACION },
        }),
      );
    });

    it('confirm-stabilization mueve EN_ESTABILIZACION -> OPERATIVA', async () => {
      const m = setup();
      m.request.findFirst
        .mockResolvedValueOnce(
          makeRequest({ operationalState: RequestState.EN_ESTABILIZACION }),
        )
        .mockResolvedValue(
          makeRequest({ operationalState: RequestState.OPERATIVA }),
        );
      m.request.update.mockResolvedValue({});
      stubUpsert(m.gateCheck);

      await m.service.advanceStage(JEFE, 'req-1', 'confirm-stabilization');

      expect(m.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { operationalState: RequestState.OPERATIVA },
        }),
      );
    });
  });

  describe('setRoute', () => {
    it('valida el code en catalogo, persiste la ruta y audita', async () => {
      const m = setup();
      m.request.findFirst
        .mockResolvedValueOnce(
          makeRequest({ governanceRoute: GOVERNANCE_ROUTE.COMPLETA }),
        )
        .mockResolvedValue(
          makeRequest({ governanceRoute: GOVERNANCE_ROUTE.SIMPLIFICADA }),
        );
      // assertCatalogCode consulta catalogItem.findFirst.
      (m.prisma as any).catalogItem = { findFirst: jest.fn() };
      const prismaAny = m.prisma as any;
      prismaAny.catalogItem.findFirst.mockResolvedValue({ id: 'c-1' });
      m.request.update.mockResolvedValue({});
      stubUpsert(m.gateCheck);

      await m.service.setRoute(JEFE, 'req-1', {
        route: GOVERNANCE_ROUTE.SIMPLIFICADA,
      });

      expect(m.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { governanceRoute: GOVERNANCE_ROUTE.SIMPLIFICADA },
        }),
      );
      expect(m.auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'REQUEST', action: 'UPDATE' }),
      );
    });
  });

  describe('gateToResponse: nombre del decididor nulo', () => {
    it('decidedByName null cuando el User existe sin nombre resoluble', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ operationalState: RequestState.LISTA_PARA_LIBERAR }),
      );
      stubUpsert(m.gateCheck);
      m.gateCheck.findUnique.mockResolvedValue(makeGate(GateCode.GC4));
      m.validationRecord.findMany.mockResolvedValue([
        {
          blocking: false,
          blockingResolved: false,
          validationTypeCode: 'FUNCIONAL_ACEPTACION',
          resultCode: 'APROBADA',
        },
      ]);
      m.request.update.mockResolvedValue({
        operationalState: RequestState.EN_ESTABILIZACION,
      });
      // El User existe pero findUnique lo devuelve null -> decidedByName null.
      m.user.findUnique.mockResolvedValue(null);

      const res = await m.service.approve(JEFE, 'req-1', 'GC4', {});
      expect(res.decidedByName).toBeNull();
    });
  });

  describe('block/unblock (flag transversal, D-B7)', () => {
    it('block setea el flag SIN cambiar operationalState ni invocar assertTransition', async () => {
      const m = setup();
      const assertSpy = jest.spyOn(RequestStateService.prototype, 'assertTransition');
      m.request.findFirst
        .mockResolvedValueOnce(
          makeRequest({ operationalState: RequestState.EN_VALIDACION }),
        )
        .mockResolvedValue(
          makeRequest({
            operationalState: RequestState.EN_VALIDACION,
            blockedAt: new Date(),
            blockedReason: 'motivo',
          }),
        );
      m.request.update.mockResolvedValue({});
      stubUpsert(m.gateCheck);

      const board = await m.service.block(JEFE, 'req-1', { blockReason: 'motivo' });

      expect(board.operationalState).toBe(RequestState.EN_VALIDACION);
      expect(board.blocked).toBe(true);
      // El update de block NO toca operationalState.
      const updateArg = m.request.update.mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('operationalState');
      expect(assertSpy).not.toHaveBeenCalled();
      assertSpy.mockRestore();
    });

    it('re-bloquear una Request ya bloqueada responde 409', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ blockedAt: new Date(), blockedResolvedAt: null }),
      );

      await expect(
        m.service.block(JEFE, 'req-1', { blockReason: 'otro' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('unblock sin bloqueo previo responde 409', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(
        makeRequest({ blockedAt: null, blockedResolvedAt: null }),
      );

      await expect(
        m.service.unblock(JEFE, 'req-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('unblock setea blockedResolvedAt sin forzar EN_EJECUCION', async () => {
      const m = setup();
      m.request.findFirst
        .mockResolvedValueOnce(
          makeRequest({
            operationalState: RequestState.EN_ESTABILIZACION,
            blockedAt: new Date(),
            blockedResolvedAt: null,
          }),
        )
        .mockResolvedValue(
          makeRequest({ operationalState: RequestState.EN_ESTABILIZACION }),
        );
      m.request.update.mockResolvedValue({});
      stubUpsert(m.gateCheck);

      const board = await m.service.unblock(JEFE, 'req-1', {});

      expect(board.operationalState).toBe(RequestState.EN_ESTABILIZACION);
      const updateArg = m.request.update.mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('operationalState');
      expect(updateArg.data.blockedResolvedAt).toBeInstanceOf(Date);
    });
  });
});
