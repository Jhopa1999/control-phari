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
import { ValidationService } from './validation.service';
import { withReferenceLookups } from '../../../testing/reference-lookups';

const JEFE: CurrentActor = {
  userId: 'u-jefe',
  name: 'Ana Jefa',
  identifier: 'jefe@demo.local',
  grants: [],
  roleCodes: new Set([RoleCode.JEFE_AREA]),
  scopedProcessIds: new Set(),
  isJefeArea: true,
  isLiderProceso: false,
  isAdmin: false,
};

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

/** Lider con alcance en `proc-1` (ve/gestiona ese proceso). */
const LIDER: CurrentActor = {
  userId: 'u-lider',
  name: 'Beto Lider',
  identifier: 'lider@demo.local',
  grants: [grantFor('proc-1', RoleCode.LIDER_PROCESO)],
  roleCodes: new Set([RoleCode.LIDER_PROCESO]),
  scopedProcessIds: new Set(['proc-1']),
  isJefeArea: false,
  isLiderProceso: false,
  isAdmin: false,
};

function makeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'req-1',
    mainProcessId: 'proc-1',
    operationalState: RequestState.EN_VALIDACION,
    governanceRoute: 'COMPLETA',
    blockedAt: null,
    blockedResolvedAt: null,
    ...overrides,
  };
}

type Mocks = {
  prisma: PrismaService;
  validationRecord: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  documentVersion: { findUnique: jest.Mock };
  document: { findUnique: jest.Mock };
  catalogItem: { findFirst: jest.Mock };
  request: { findFirst: jest.Mock };
  user: { findUnique: jest.Mock };
  auditRecord: jest.Mock;
  service: ValidationService;
};

function setup(): Mocks {
  const validationRecord = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const documentVersion = { findUnique: jest.fn() };
  const document = { findUnique: jest.fn() };
  // Catalogo: por defecto todo code existe (assertCatalogCode OK).
  const catalogItem = { findFirst: jest.fn().mockResolvedValue({ id: 'c-1' }) };
  const request = { findFirst: jest.fn() };
  // El ejecutor existe y está activo por defecto.
  const user = {
    findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, active: true }),
    ),
  };

  const prismaObj: Record<string, unknown> = {
    validationRecord,
    documentVersion,
    document,
    catalogItem,
    request,
    user,
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new GovernanceScopeService(prisma);
  const state = new RequestStateService(withReferenceLookups(prisma));
  const service = new ValidationService(prisma, audit, scope, state);

  return {
    prisma,
    validationRecord,
    documentVersion,
    document,
    catalogItem,
    request,
    user,
    auditRecord,
    service,
  };
}

const BASE_DTO = {
  validationTypeCode: 'FUNCIONAL_ACEPTACION',
  testCase: 'TC-1',
  resultCode: 'APROBADA',
  executedByUserId: '11111111-1111-1111-1111-111111111111',
  executedAt: '2026-01-02T00:00:00.000Z',
};

describe('ValidationService', () => {
  describe('findForRequest', () => {
    it('lista el historial en alcance ordenado por executedAt desc', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.validationRecord.findMany.mockResolvedValue([
        {
          id: 'v-1',
          requestId: 'req-1',
          gateCheckId: null,
          validationTypeCode: 'FUNCIONAL_ACEPTACION',
          testCase: 'TC-1',
          version: null,
          environment: null,
          resultCode: 'APROBADA',
          blocking: false,
          blockingResolved: false,
          blockingResolvedAt: null,
          blockingResolvedByUserId: null,
          blockingResolvedBy: null,
          evidenceRef: null,
          evidenceDocumentId: null,
          evidenceDocumentVersionId: null,
          executedByUserId: BASE_DTO.executedByUserId,
          executedBy: { id: BASE_DTO.executedByUserId, name: 'Eje Cutor' },
          executedAt: new Date(),
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await m.service.findForRequest(JEFE, 'req-1');

      expect(res).toHaveLength(1);
      expect(res[0].executedByName).toBe('Eje Cutor');
      const arg = m.validationRecord.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ requestId: 'req-1' });
      expect(arg.orderBy).toEqual({ executedAt: 'desc' });
    });

    it('404 si la Request esta fuera del alcance de lectura', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(null);
      await expect(
        m.service.findForRequest(LIDER, 'req-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create (registrar != aprobar, BR-008)', () => {
    it('registra la validacion sin cambiar estado ni aprobar gate', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.validationRecord.create.mockResolvedValue({
        id: 'v-1',
        requestId: 'req-1',
        gateCheckId: null,
        validationTypeCode: 'FUNCIONAL_ACEPTACION',
        testCase: 'TC-1',
        version: null,
        environment: null,
        resultCode: 'APROBADA',
        blocking: false,
        blockingResolved: false,
        blockingResolvedAt: null,
        blockingResolvedByUserId: null,
        evidenceRef: null,
        evidenceDocumentId: null,
        evidenceDocumentVersionId: null,
        executedByUserId: BASE_DTO.executedByUserId,
        executedBy: { id: BASE_DTO.executedByUserId, name: 'Eje Cutor' },
        executedAt: new Date(BASE_DTO.executedAt),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await m.service.create(JEFE, 'req-1', { ...BASE_DTO });

      expect(result.id).toBe('v-1');
      // Nombre del ejecutor resuelto desde la relacion incluida en la query; sin
      // relacion blockingResolvedBy -> nombre null.
      expect(result.executedByName).toBe('Eje Cutor');
      expect(result.blockingResolvedByName).toBeNull();
      expect(m.validationRecord.create.mock.calls[0][0].include).toMatchObject({
        executedBy: { select: { id: true, name: true } },
        blockingResolvedBy: { select: { id: true, name: true } },
      });
      // No se escribe operationalState: el mock de request no tiene update.
      expect(m.auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'VALIDATION_RECORD', action: 'CREATE' }),
      );
    });

    it('rechaza (400) un validationTypeCode fuera de catalogo', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.catalogItem.findFirst.mockResolvedValue(null); // code inexistente

      await expect(
        m.service.create(JEFE, 'req-1', { ...BASE_DTO }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza (400) una version de evidencia cuyo documentId no coincide', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.document.findUnique.mockResolvedValue({ asset: { processId: 'proc-1' } });
      m.documentVersion.findUnique.mockResolvedValue({ documentId: 'doc-OTRO' });

      await expect(
        m.service.create(JEFE, 'req-1', {
          ...BASE_DTO,
          evidenceDocumentId: '22222222-2222-2222-2222-222222222222',
          evidenceDocumentVersionId: '33333333-3333-3333-3333-333333333333',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza (400) una version de evidencia inexistente', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.document.findUnique.mockResolvedValue({ asset: { processId: 'proc-1' } });
      m.documentVersion.findUnique.mockResolvedValue(null);

      await expect(
        m.service.create(JEFE, 'req-1', {
          ...BASE_DTO,
          evidenceDocumentId: '22222222-2222-2222-2222-222222222222',
          evidenceDocumentVersionId: '33333333-3333-3333-3333-333333333333',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si el documento de evidencia no existe', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.document.findUnique.mockResolvedValue(null);

      await expect(
        m.service.create(JEFE, 'req-1', {
          ...BASE_DTO,
          evidenceDocumentId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 si el documento de evidencia esta fuera del alcance del lider', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      // El activo del documento cuelga de un proceso ajeno al alcance del lider.
      m.document.findUnique.mockResolvedValue({ asset: { processId: 'proc-AJENO' } });

      await expect(
        m.service.create(LIDER, 'req-1', {
          ...BASE_DTO,
          evidenceDocumentId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('permite documento de evidencia dentro del alcance del lider', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.document.findUnique.mockResolvedValue({ asset: { processId: 'proc-1' } });
      m.validationRecord.create.mockResolvedValue({
        id: 'v-2',
        requestId: 'req-1',
        gateCheckId: null,
        validationTypeCode: 'FUNCIONAL_ACEPTACION',
        testCase: 'TC-1',
        version: null,
        environment: null,
        resultCode: 'APROBADA',
        blocking: false,
        blockingResolved: false,
        blockingResolvedAt: null,
        blockingResolvedByUserId: null,
        blockingResolvedBy: null,
        evidenceRef: null,
        evidenceDocumentId: '22222222-2222-2222-2222-222222222222',
        evidenceDocumentVersionId: null,
        executedByUserId: BASE_DTO.executedByUserId,
        executedBy: { id: BASE_DTO.executedByUserId, name: 'Eje Cutor' },
        executedAt: new Date(BASE_DTO.executedAt),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await m.service.create(LIDER, 'req-1', {
        ...BASE_DTO,
        evidenceDocumentId: '22222222-2222-2222-2222-222222222222',
      });

      expect(res.id).toBe('v-2');
      expect(res.evidenceDocumentId).toBe(
        '22222222-2222-2222-2222-222222222222',
      );
    });
  });

  describe('resolveBlocking (D-C5)', () => {
    it('setea los 3 campos sin cambiar estado ni aprobar gate', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.validationRecord.findFirst.mockResolvedValue({
        id: 'v-1',
        requestId: 'req-1',
        blocking: true,
        blockingResolved: false,
      });
      m.validationRecord.update.mockResolvedValue({
        id: 'v-1',
        requestId: 'req-1',
        gateCheckId: null,
        validationTypeCode: 'FUNCIONAL_ACEPTACION',
        testCase: 'TC-1',
        version: null,
        environment: null,
        resultCode: 'APROBADA',
        blocking: true,
        blockingResolved: true,
        blockingResolvedAt: new Date(),
        blockingResolvedByUserId: JEFE.userId,
        blockingResolvedBy: { id: JEFE.userId, name: 'Ana Jefa' },
        evidenceRef: null,
        evidenceDocumentId: null,
        evidenceDocumentVersionId: null,
        executedByUserId: BASE_DTO.executedByUserId,
        executedBy: { id: BASE_DTO.executedByUserId, name: 'Eje Cutor' },
        executedAt: new Date(),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await m.service.resolveBlocking(JEFE, 'req-1', 'v-1', {});

      expect(result.blockingResolved).toBe(true);
      expect(result.blockingResolvedByUserId).toBe(JEFE.userId);
      // Nombre de quien resolvio el bloqueo resuelto desde la relacion incluida.
      expect(result.blockingResolvedByName).toBe('Ana Jefa');
      const updateArg = m.validationRecord.update.mock.calls[0][0];
      expect(updateArg.data).toMatchObject({ blockingResolved: true });
      expect(updateArg.data.blockingResolvedAt).toBeInstanceOf(Date);
      expect(updateArg.include).toMatchObject({
        executedBy: { select: { id: true, name: true } },
        blockingResolvedBy: { select: { id: true, name: true } },
      });
    });

    it('rechaza (400) si el registro no es un defecto bloqueante', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.validationRecord.findFirst.mockResolvedValue({
        id: 'v-1',
        requestId: 'req-1',
        blocking: false,
        blockingResolved: false,
      });

      await expect(
        m.service.resolveBlocking(JEFE, 'req-1', 'v-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('responde 404 si la validacion no pertenece a la Request', async () => {
      const m = setup();
      m.request.findFirst.mockResolvedValue(makeRequest());
      m.validationRecord.findFirst.mockResolvedValue(null);

      await expect(
        m.service.resolveBlocking(JEFE, 'req-1', 'v-x', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('ValidationService.create · quién registra y cierre (oleada 2, D11)', () => {
  const OTHER = '22222222-2222-2222-2222-222222222222';
  const INTEGRANTE: CurrentActor = {
    userId: BASE_DTO.executedByUserId,
    name: 'Ines Integrante',
    identifier: 'integrante@demo.local',
    grants: [grantFor('proc-1', RoleCode.INTEGRANTE)],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['proc-1']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };

  function prepared(m: Mocks): void {
    m.request.findFirst.mockResolvedValue(makeRequest());
    m.validationRecord.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'v-1',
        gateCheckId: null,
        version: null,
        environment: null,
        blockingResolved: false,
        blockingResolvedAt: null,
        blockingResolvedByUserId: null,
        blockingResolvedBy: null,
        evidenceRef: null,
        evidenceDocumentId: null,
        evidenceDocumentVersionId: null,
        notes: null,
        executedBy: { id: String(data.executedByUserId), name: 'Eje' },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    );
  }

  it('409 si la solicitud está cerrada y no escribe', async () => {
    const m = setup();
    m.request.findFirst.mockResolvedValue(makeRequest({ operationalState: RequestState.CERRADA }));
    const attempt = m.service.create(JEFE, 'req-1', { ...BASE_DTO });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      'El proyecto está cerrado; reabre el proyecto para modificar sus controles.',
    );
    expect(m.validationRecord.create).not.toHaveBeenCalled();
  });

  it('409 al resolver un bloqueo de una solicitud cerrada', async () => {
    const m = setup();
    m.request.findFirst.mockResolvedValue(makeRequest({ operationalState: RequestState.CERRADA }));
    await expect(m.service.resolveBlocking(JEFE, 'req-1', 'v-1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(m.validationRecord.update).not.toHaveBeenCalled();
  });

  it('el integrante no registra una validación a nombre de otra persona (403)', async () => {
    const m = setup();
    prepared(m);
    const attempt = m.service.create(INTEGRANTE, 'req-1', { ...BASE_DTO, executedByUserId: OTHER });
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(
      'Solo puedes registrar validaciones ejecutadas por ti. El líder del proceso o el jefe de área pueden registrarlas a nombre de otra persona.',
    );
    expect(m.validationRecord.create).not.toHaveBeenCalled();
  });

  it('el integrante sí registra las suyas', async () => {
    const m = setup();
    prepared(m);
    const result = await m.service.create(INTEGRANTE, 'req-1', { ...BASE_DTO });
    expect(result.executedByUserId).toBe(INTEGRANTE.userId);
  });

  it('el líder del proceso principal y el jefe registran a nombre de otra persona', async () => {
    for (const actor of [LIDER, JEFE]) {
      const m = setup();
      prepared(m);
      const result = await m.service.create(actor, 'req-1', { ...BASE_DTO, executedByUserId: OTHER });
      expect(result.executedByUserId).toBe(OTHER);
    }
  });

  it('400 en español si el ejecutor no existe o está inactivo (en vez del 500 de la FK)', async () => {
    const m = setup();
    prepared(m);
    m.user.findUnique.mockResolvedValueOnce(null);
    await expect(m.service.create(JEFE, 'req-1', { ...BASE_DTO })).rejects.toThrow(
      'La persona que ejecutó la validación no existe o está inactiva.',
    );
    m.user.findUnique.mockResolvedValueOnce({ id: OTHER, active: false });
    await expect(m.service.create(JEFE, 'req-1', { ...BASE_DTO })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(m.validationRecord.create).not.toHaveBeenCalled();
  });

  it('400 si la fecha de ejecución es posterior a hoy', async () => {
    const m = setup();
    prepared(m);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const attempt = m.service.create(JEFE, 'req-1', { ...BASE_DTO, executedAt: future });
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toThrow('La fecha de ejecución no puede ser posterior a hoy.');
    expect(m.validationRecord.create).not.toHaveBeenCalled();
  });
});
