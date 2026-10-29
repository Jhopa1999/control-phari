import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentStateService } from './document-state.service';
import { KnowledgeScopeService } from '../knowledge-scope.service';
import type { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';

function actor(role: RoleCode): CurrentActor {
  return {
    userId: role === RoleCode.JEFE_AREA ? 'jefe' : 'lider',
    isJefeArea: role === RoleCode.JEFE_AREA,
    isAdmin: false,
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(['p1']),
    grants: [{ roleCode: role, processId: 'p1' }],
  } as unknown as CurrentActor;
}

function build(doc: { status: string; categoryCode?: string | null; requestId?: string | null }, requestState = 'EN_EJECUCION') {
  const row = {
    id: 'd1',
    assetId: 'a1',
    title: 'Acta de cierre',
    categoryCode: doc.categoryCode ?? 'CIERRE',
    status: doc.status,
    requestId: doc.requestId ?? 'r1',
    currentVersionId: null,
    submittedAt: null,
    submittedByUserId: 'lider',
    reviewedAt: null,
    reviewedByUserId: null,
    reviewReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersion: null,
  };
  const tx = {
    document: { update: jest.fn().mockImplementation(({ data }) => ({ ...row, ...data })) },
  };
  const prisma = {
    document: { findFirst: jest.fn().mockResolvedValue(row) },
    asset: { findFirst: jest.fn().mockResolvedValue({ id: 'a1', processId: 'p1', status: 'ACTIVO' }) },
    request: { findFirst: jest.fn().mockResolvedValue({ operationalState: requestState }) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = {
    notify: jest.fn(),
    areaHeadsForProcess: jest.fn().mockResolvedValue(['jefe']),
    processLeaders: jest.fn().mockResolvedValue([]),
  };
  const service = new DocumentService(
    prisma as never,
    { record: jest.fn() } as never,
    new KnowledgeScopeService(),
    new DocumentStateService(),
    notifications as never,
  );
  return { service, tx, notifications };
}

describe('DocumentService · aprobación documental', () => {
  it('enviar a aprobación registra quién envía y notifica a los jefes', async () => {
    const { service, tx, notifications } = build({ status: 'BORRADOR' });
    await service.submitForApproval(actor(RoleCode.LIDER_PROCESO), 'd1');
    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDIENTE_APROBACION', submittedByUserId: 'lider' }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOCUMENT_PENDING_APPROVAL' }),
    );
  });

  it('solo el jefe aprueba o rechaza, y el rechazo exige motivo', async () => {
    await expect(
      build({ status: 'PENDIENTE_APROBACION' }).service.review(actor(RoleCode.LIDER_PROCESO), 'd1', {
        decision: 'APROBAR',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      build({ status: 'PENDIENTE_APROBACION' }).service.review(actor(RoleCode.JEFE_AREA), 'd1', {
        decision: 'RECHAZAR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const { service, notifications } = build({ status: 'PENDIENTE_APROBACION' });
    await service.review(actor(RoleCode.JEFE_AREA), 'd1', { decision: 'APROBAR' });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOCUMENT_APPROVED', userIds: ['lider'] }),
    );
  });

  it('la documentación de cierre no se publica sin aprobación', async () => {
    const { service } = build({ status: 'BORRADOR' });
    await expect(
      service.changeStatus(actor(RoleCode.JEFE_AREA), 'd1', { targetStatus: 'VIGENTE' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('un proyecto cerrado bloquea los cambios de su documentación', async () => {
    const { service } = build({ status: 'BORRADOR' }, 'CERRADA');
    await expect(
      service.submitForApproval(actor(RoleCode.JEFE_AREA), 'd1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
