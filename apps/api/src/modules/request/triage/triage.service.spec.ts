import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AssetService } from '../../knowledge/asset/asset.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestState } from '../request-state';
import { RequestStateService } from '../request-state.service';
import { TriageService } from './triage.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), update: jest.fn() },
    triage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    priorityEvaluation: { findFirst: jest.fn() },
    catalogItem: { findFirst: jest.fn() },
    grant: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const state = new RequestStateService(prisma);
  const assetService = {
    // El triage ya no crea activos: solo asocia uno existente via `get`.
    get: jest.fn(),
  } as unknown as AssetService;
  const assetGet = assetService.get as unknown as jest.Mock;
  return {
    prisma,
    prismaObj,
    audit,
    auditRecord,
    state,
    assetService,
    assetGet,
  };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
  };
}

function makeRequest(state: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    mainProcessId: 'p1',
    operationalState: state,
    ...overrides,
  };
}

describe('TriageService', () => {
  let service: TriageService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new TriageService(m.prisma, m.audit, m.state, m.assetService);
  });

  it('CONTINUAR deja EN_TRIAGE, crea Triage y audita (CREATE + UPDATE)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.triage as any).create.mockResolvedValue({
      id: 't1',
      requestId: 'r1',
      decision: 'CONTINUAR',
      routeCode: null,
      demandTypeCode: null,
      criticalityCode: null,
      sizeCode: null,
      dataAvailabilityCode: null,
      totalEffortHours: null,
      mainResponsibleUserId: null,
      mainResponsible: null,
      dependencies: null,
      notes: null,
      decidedAt: new Date(),
      decidedByUserId: 'ul',
      createdAt: new Date(),
    });
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );

    await service.create(lider(), 'r1', { decision: 'CONTINUAR' });

    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.EN_TRIAGE,
    });
    // CREATE Triage + UPDATE Request.
    expect(m.auditRecord).toHaveBeenCalledTimes(2);
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'TRIAGE',
      scopeProcessId: 'p1',
    });
    expect(m.auditRecord.mock.calls[1][1]).toMatchObject({
      action: 'UPDATE',
      objectType: 'REQUEST',
      scopeProcessId: 'p1',
    });
  });

  it('DEVOLVER lleva a DEVUELTA', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.triage as any).create.mockResolvedValue({
      id: 't1',
      requestId: 'r1',
      decision: 'DEVOLVER',
      decidedAt: new Date(),
      decidedByUserId: 'ul',
      createdAt: new Date(),
    });
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.DEVUELTA),
    );

    await service.create(lider(), 'r1', { decision: 'DEVOLVER' });
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.DEVUELTA,
    });
  });

  it('RECHAZAR lleva a RECHAZADA', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.triage as any).create.mockResolvedValue({
      id: 't1',
      requestId: 'r1',
      decision: 'RECHAZAR',
      decidedAt: new Date(),
      decidedByUserId: 'ul',
      createdAt: new Date(),
    });
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.RECHAZADA),
    );

    await service.create(lider(), 'r1', { decision: 'RECHAZAR' });
    expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
      operationalState: RequestState.RECHAZADA,
    });
  });

  it('2o POST sobre EN_TRIAGE -> 409 sin mutacion (HIGH-1)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );
    await expect(
      service.create(lider(), 'r1', { decision: 'CONTINUAR' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((m.prismaObj.triage as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('triage sobre DEVUELTA -> 409 (no reabre)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.DEVUELTA),
    );
    await expect(
      service.create(lider(), 'r1', { decision: 'CONTINUAR' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((m.prismaObj.triage as any).create).not.toHaveBeenCalled();
  });

  it('code maestro inexistente -> 400 sin mutacion', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.catalogItem as any).findFirst.mockResolvedValue(null);
    await expect(
      service.create(lider(), 'r1', { decision: 'CONTINUAR', routeCode: 'ZZZ' }),
    ).rejects.toMatchObject({ status: 400 });
    expect((m.prismaObj.triage as any).create).not.toHaveBeenCalled();
  });

  it('Request de otro proceso -> 404 (where por mainProcessId)', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
    await expect(
      service.create(lider(['p1']), 'r1', { decision: 'CONTINUAR' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ id: 'r1' }, { mainProcessId: { in: ['p1'] } }]);
  });

  // --- Responsable principal como FK (design §7) ---

  function triageRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 't1',
      requestId: 'r1',
      decision: 'CONTINUAR',
      routeCode: null,
      demandTypeCode: null,
      criticalityCode: null,
      sizeCode: null,
      dataAvailabilityCode: null,
      totalEffortHours: null,
      mainResponsibleUserId: null,
      mainResponsible: null,
      dependencies: null,
      notes: null,
      decidedAt: new Date(),
      decidedByUserId: 'ul',
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('responsable = lider del proceso principal -> OK y persiste la FK', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    // Primer findMany (lideres) contiene al candidato.
    (m.prismaObj.grant as any).findMany.mockResolvedValueOnce([
      { userId: 'u-lider' },
    ]);
    (m.prismaObj.triage as any).create.mockResolvedValue(
      triageRow({
        mainResponsibleUserId: 'u-lider',
        mainResponsible: { id: 'u-lider', name: 'Lider Uno' },
      }),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );

    const result = await service.create(lider(), 'r1', {
      decision: 'CONTINUAR',
      mainResponsibleUserId: 'u-lider',
    });

    expect((m.prismaObj.triage as any).create.mock.calls[0][0].data).toMatchObject(
      { mainResponsibleUserId: 'u-lider' },
    );
    expect(result.mainResponsibleUserId).toBe('u-lider');
    expect(result.mainResponsibleName).toBe('Lider Uno');
  });

  it('responsable NO elegible con proceso que SI tiene lideres -> 400 sin mutacion', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.grant as any).findMany.mockResolvedValueOnce([
      { userId: 'u-lider' },
    ]);

    await expect(
      service.create(lider(), 'r1', {
        decision: 'CONTINUAR',
        mainResponsibleUserId: 'u-otro',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((m.prismaObj.triage as any).create).not.toHaveBeenCalled();
    expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
  });

  it('proceso sin lideres (respaldo) + miembro del proceso -> OK', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    // Lideres vacio; respaldo (equipo del proceso) contiene al candidato.
    (m.prismaObj.grant as any).findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'u-miembro' }]);
    (m.prismaObj.triage as any).create.mockResolvedValue(
      triageRow({
        mainResponsibleUserId: 'u-miembro',
        mainResponsible: { id: 'u-miembro', name: 'Miembro' },
      }),
    );
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );

    const result = await service.create(lider(), 'r1', {
      decision: 'CONTINUAR',
      mainResponsibleUserId: 'u-miembro',
    });
    expect(result.mainResponsibleUserId).toBe('u-miembro');
  });

  it('proceso sin lideres + persona que no es miembro -> 400', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.grant as any).findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'u-miembro' }]);

    await expect(
      service.create(lider(), 'r1', {
        decision: 'CONTINUAR',
        mainResponsibleUserId: 'u-ajeno',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((m.prismaObj.triage as any).create).not.toHaveBeenCalled();
  });

  it('mainResponsibleUserId undefined -> OK sin consultar candidatos', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.triage as any).create.mockResolvedValue(triageRow());
    (m.prismaObj.request as any).update.mockResolvedValue(
      makeRequest(RequestState.EN_TRIAGE),
    );

    const result = await service.create(lider(), 'r1', { decision: 'CONTINUAR' });

    expect((m.prismaObj.grant as any).findMany).not.toHaveBeenCalled();
    expect(result.mainResponsibleUserId).toBeNull();
    expect(result.mainResponsibleName).toBeNull();
  });

  it('findForRequest publica los mismos candidatos que valida create', async () => {
    (m.prismaObj.request as any).findFirst.mockResolvedValue(
      makeRequest(RequestState.REGISTRADA),
    );
    (m.prismaObj.grant as any).findMany.mockResolvedValue([
      { userId: 'u-lider' },
    ]);
    (m.prismaObj.triage as any).findMany.mockResolvedValue([]);
    (m.prismaObj.user as any).findMany.mockResolvedValue([
      { id: 'u-lider', name: 'Lider Uno' },
    ]);

    const ctx = await service.findForRequest(lider(), 'r1');

    expect(ctx.triages).toEqual([]);
    expect(ctx.eligibleResponsibles).toEqual([
      { id: 'u-lider', name: 'Lider Uno' },
    ]);
    // La query de usuarios usa exactamente los ids del conjunto elegible.
    expect((m.prismaObj.user as any).findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['u-lider'] },
    });
  });

  // --- Asociacion de activo base en el triage (FEAT-002) ---

  describe('associateAsset', () => {
    it('activo existente habilitado (propietario del mainProcess) -> OK, escribe assetId y audita UPDATE REQUEST', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE, { assetId: null }),
      );
      // Propietario = p1 (mainProcessId), visible para la solicitud.
      m.assetGet.mockResolvedValue({
        id: 'a-existente',
        processId: 'p1',
        visibleProcessIds: [],
      });
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE, {
          assetId: 'a-existente',
          participants: [],
        }),
      );

      const result = await service.associateAsset(lider(), 'r1', {
        assetId: 'a-existente',
      });

      expect(m.assetGet).toHaveBeenCalledWith(expect.anything(), 'a-existente');
      expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
        assetId: 'a-existente',
      });
      expect(result.assetId).toBe('a-existente');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: 'r1',
        scopeProcessId: 'p1',
        before: { assetId: null },
        after: { assetId: 'a-existente' },
      });
    });

    it('activo habilitado por visibilidad (no propietario) -> OK', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE, { assetId: null }),
      );
      // Propietario de otro proceso, pero p1 esta en visibleProcessIds.
      m.assetGet.mockResolvedValue({
        id: 'a-visible',
        processId: 'p-otro',
        visibleProcessIds: ['p1'],
      });
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE, {
          assetId: 'a-visible',
          participants: [],
        }),
      );

      const result = await service.associateAsset(lider(), 'r1', {
        assetId: 'a-visible',
      });

      expect(result.assetId).toBe('a-visible');
    });

    it('activo accesible pero NO habilitado para el mainProcess -> 409 sin mutacion', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE, { assetId: null }),
      );
      // El actor ve el activo por p-otro, pero p1 (mainProcess) no esta habilitado.
      m.assetGet.mockResolvedValue({
        id: 'a-otro',
        processId: 'p-otro',
        visibleProcessIds: ['p-otro-2'],
      });
      await expect(
        service.associateAsset(lider(), 'r1', { assetId: 'a-otro' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
    });

    it('estado no asociable (COMPROMETIDA) -> 409 sin mutacion', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA, { assetId: null }),
      );
      await expect(
        service.associateAsset(lider(), 'r1', { assetId: 'a-existente' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
      expect(m.assetGet).not.toHaveBeenCalled();
    });

    it('activo fuera de alcance del actor -> 404 (propaga de AssetService.get)', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE, { assetId: null }),
      );
      m.assetGet.mockRejectedValue(new NotFoundException('Activo no encontrado.'));
      await expect(
        service.associateAsset(lider(), 'r1', { assetId: 'a-oculto' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
    });

    it('solicitud fuera de alcance -> 404', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(
        service.associateAsset(lider(['p1']), 'r1', { assetId: 'a-existente' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((m.prismaObj.request as any).update).not.toHaveBeenCalled();
    });
  });
});
