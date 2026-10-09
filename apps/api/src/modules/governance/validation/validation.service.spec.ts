import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestState } from '../../request/request-state';
import { RequestStateService } from '../../request/request-state.service';
import { GovernanceScopeService } from '../governance-scope.service';
import { ValidationService } from './validation.service';

const JEFE: CurrentActor = {
  userId: 'u-jefe',
  name: 'Ana Jefa',
  identifier: 'jefe@demo.local',
  grants: [],
  roleCodes: new Set([RoleCode.JEFE_AREA]),
  scopedProcessIds: new Set(),
  isJefeArea: true,
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

  const prismaObj: Record<string, unknown> = {
    validationRecord,
    documentVersion,
    document,
    catalogItem,
    request,
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new GovernanceScopeService(prisma);
  const state = new RequestStateService(prisma);
  const service = new ValidationService(prisma, audit, scope, state);

  return {
    prisma,
    validationRecord,
    documentVersion,
    document,
    catalogItem,
    request,
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
        executedAt: new Date(BASE_DTO.executedAt),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await m.service.create(JEFE, 'req-1', { ...BASE_DTO });

      expect(result.id).toBe('v-1');
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
        evidenceRef: null,
        evidenceDocumentId: null,
        evidenceDocumentVersionId: null,
        executedByUserId: BASE_DTO.executedByUserId,
        executedAt: new Date(),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await m.service.resolveBlocking(JEFE, 'req-1', 'v-1', {});

      expect(result.blockingResolved).toBe(true);
      expect(result.blockingResolvedByUserId).toBe(JEFE.userId);
      const updateArg = m.validationRecord.update.mock.calls[0][0];
      expect(updateArg.data).toMatchObject({ blockingResolved: true });
      expect(updateArg.data.blockingResolvedAt).toBeInstanceOf(Date);
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
