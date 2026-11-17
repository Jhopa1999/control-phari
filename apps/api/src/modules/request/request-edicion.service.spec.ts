import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestService } from './request.service';
import { RequestStateService } from './request-state.service';
import { withReferenceLookups } from '../../testing/reference-lookups';

/**
 * Oleada 2 · D3 y D4: quién edita una solicitud según su estado, justificación
 * obligatoria desde «Comprometida» y «Reenviar a triage» de una solicitud
 * devuelta (creador, líder del proceso o jefe).
 */

const REASON = 'Falta definir el alcance y el resultado esperado.';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), update: jest.fn() },
    requester: { findFirst: jest.fn() },
    triage: { findFirst: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    priorityEvaluation: { findFirst: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const notifications = {
    notify: jest.fn(),
    areaHeadsForProcess: jest.fn().mockResolvedValue(['uj']),
    allAreaHeads: jest.fn().mockResolvedValue(['uj', 'uj2']),
  };
  return {
    prisma,
    prismaObj,
    audit,
    auditRecord: audit.record as unknown as jest.Mock,
    notifications,
    state: new RequestStateService(withReferenceLookups(prisma)),
  };
}

function actor(overrides: Partial<CurrentActor> & { userId: string }): CurrentActor {
  return {
    name: overrides.userId,
    identifier: `${overrides.userId}@demo.local`,
    grants: [],
    roleCodes: new Set<RoleCode>([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set<string>(['p1']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
    ...overrides,
  };
}

const jefe = (): CurrentActor =>
  actor({ userId: 'uj', isJefeArea: true, roleCodes: new Set([RoleCode.JEFE_AREA]) });

/** Líder del proceso indicado (grant LIDER_PROCESO activo). */
const lider = (processId = 'p1'): CurrentActor =>
  actor({
    userId: 'ul',
    isLiderProceso: true,
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    grants: [
      {
        processId,
        processCode: 'BI',
        processName: 'BI',
        roleCode: RoleCode.LIDER_PROCESO,
        roleName: 'Líder',
      },
    ],
    scopedProcessIds: new Set([processId]),
  });

const creador = (): CurrentActor => actor({ userId: 'uc' });
const ajeno = (): CurrentActor => actor({ userId: 'ux' });

function row(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'r1',
    code: 'PRY-0012',
    title: 'Solicitud',
    registeredAt: now,
    requesterId: null,
    requesterArea: null,
    requesterName: null,
    functionalOwner: null,
    targetDate: null,
    referenceUrl: null,
    expectedResult: null,
    mainProcessId: 'p1',
    assetId: null,
    createdByUserId: 'uc',
    operationalState: 'REGISTRADA',
    initialCommitmentDate: null,
    changeJustification: null,
    createdAt: now,
    updatedAt: now,
    participants: [{ id: 'rp1', processId: 'p1' }],
    ...overrides,
  };
}

describe('RequestService · edición por estado (D4)', () => {
  let service: RequestService;
  let m: ReturnType<typeof createMocks>;
  const requestMock = () => m.prismaObj.request as { findFirst: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    m = createMocks();
    service = new RequestService(m.prisma, m.audit, m.state, m.notifications as never);
    (m.prismaObj.triage as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    (m.prismaObj.priorityEvaluation as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
  });

  function givenState(state: string, overrides: Record<string, unknown> = {}): void {
    requestMock().findFirst.mockResolvedValue(row({ operationalState: state, ...overrides }));
    requestMock().update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row({ operationalState: state, ...overrides, ...data }),
    );
  }

  describe.each(['REGISTRADA', 'DEVUELTA'])('en %s', (state) => {
    it('el creador edita', async () => {
      givenState(state);
      await expect(service.update(creador(), 'r1', { title: 'Nuevo' })).resolves.toMatchObject({
        title: 'Nuevo',
      });
    });

    it('el líder del proceso y el jefe editan', async () => {
      givenState(state);
      await service.update(lider(), 'r1', { title: 'A' });
      await service.update(jefe(), 'r1', { title: 'B' });
      expect(requestMock().update).toHaveBeenCalledTimes(2);
    });

    it('un integrante que no la creó recibe 403 en español y no se escribe nada', async () => {
      givenState(state);
      const attempt = service.update(ajeno(), 'r1', { title: 'Nuevo' });
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toThrow(/Solo quien la registró, el líder del proceso o el jefe de área/);
      expect(requestMock().update).not.toHaveBeenCalled();
      expect(m.auditRecord).not.toHaveBeenCalled();
    });
  });

  describe.each(['EN_TRIAGE', 'BACKLOG_PRIORIZADO', 'RECHAZADA', 'RETIRADA'])('en %s', (state) => {
    it('el creador deja de poder editar (403)', async () => {
      givenState(state);
      await expect(service.update(creador(), 'r1', { title: 'Nuevo' })).rejects.toThrow(
        /Solo el líder del proceso o el jefe de área pueden editar una solicitud en este estado/,
      );
      expect(requestMock().update).not.toHaveBeenCalled();
    });

    it('el líder del proceso y el jefe editan sin justificación', async () => {
      givenState(state);
      await service.update(lider(), 'r1', { title: 'A' });
      await service.update(jefe(), 'r1', { title: 'B' });
      expect(requestMock().update).toHaveBeenCalledTimes(2);
    });

    it('el líder de OTRO proceso recibe 403', async () => {
      givenState(state);
      await expect(service.update(lider('p9'), 'r1', { title: 'A' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe.each([
    'COMPROMETIDA',
    'EN_PLANIFICACION',
    'EN_EJECUCION',
    'BLOQUEADA',
    'EN_VALIDACION',
    'LISTA_PARA_LIBERAR',
    'EN_ESTABILIZACION',
    'OPERATIVA',
  ])('desde %s', (state) => {
    it('exige justificación: sin ella 400 y no se escribe nada', async () => {
      givenState(state);
      for (const dto of [{ title: 'Nuevo' }, { title: 'Nuevo', changeJustification: '   ' }]) {
        await expect(service.update(jefe(), 'r1', dto)).rejects.toThrow(
          'La justificación del cambio es obligatoria desde que la solicitud está comprometida.',
        );
      }
      expect(requestMock().update).not.toHaveBeenCalled();
    });

    it('una justificación de menos de 10 caracteres da 400', async () => {
      givenState(state);
      const attempt = service.update(jefe(), 'r1', { title: 'Nuevo', changeJustification: 'corto' });
      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toThrow('La justificación debe tener al menos 10 caracteres.');
    });

    it('con justificación el líder y el jefe guardan y queda auditada', async () => {
      givenState(state);
      await service.update(lider(), 'r1', { title: 'Nuevo', changeJustification: 'Cambia el alcance acordado.' });
      expect(requestMock().update.mock.calls[0][0].data.changeJustification).toBe('Cambia el alcance acordado.');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'REQUEST',
        after: expect.objectContaining({ changeJustification: 'Cambia el alcance acordado.' }),
      });
    });

    it('el creador (aunque sea el solicitante) recibe 403', async () => {
      givenState(state);
      await expect(
        service.update(creador(), 'r1', { title: 'Nuevo', changeJustification: 'Cambia el alcance acordado.' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('CERRADA sigue dando 409 incluso al jefe', async () => {
    givenState('CERRADA');
    await expect(
      service.update(jefe(), 'r1', { title: 'Nuevo', changeJustification: 'Cambia el alcance acordado.' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sin proceso principal (aún sin triar) cualquier líder y el jefe pueden editar', async () => {
    givenState('EN_TRIAGE', { mainProcessId: null });
    await service.update(lider('p9'), 'r1', { title: 'A' });
    await service.update(jefe(), 'r1', { title: 'B' });
    expect(requestMock().update).toHaveBeenCalledTimes(2);
  });

  it('editar una solicitud DEVUELTA no cambia su estado: solo «Reenviar a triage» la mueve', async () => {
    givenState('DEVUELTA');
    await service.update(creador(), 'r1', { title: 'Corregida' });
    expect(requestMock().update.mock.calls[0][0].data.operationalState).toBeUndefined();
  });
});

describe('RequestService · reenviar a triage (D3)', () => {
  let service: RequestService;
  let m: ReturnType<typeof createMocks>;
  const requestMock = () => m.prismaObj.request as { findFirst: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    m = createMocks();
    service = new RequestService(m.prisma, m.audit, m.state, m.notifications as never);
    (m.prismaObj.triage as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    (m.prismaObj.priorityEvaluation as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    requestMock().findFirst.mockResolvedValue(row({ operationalState: 'DEVUELTA' }));
    requestMock().update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row({ operationalState: 'DEVUELTA', ...data }),
    );
  });

  it.each([
    ['el creador', creador],
    ['el líder del proceso', lider],
    ['el jefe de área', jefe],
  ])('%s la reenvía: pasa a REGISTRADA, queda auditada y avisa al jefe', async (_who, make) => {
    const res = await service.resubmit(make(), 'r1', {});

    expect(res.operationalState).toBe('REGISTRADA');
    expect(requestMock().update.mock.calls[0][0].data.operationalState).toBe('REGISTRADA');
    expect(m.auditRecord).toHaveBeenCalledTimes(1);
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'UPDATE',
      objectType: 'REQUEST',
      objectId: 'r1',
      before: expect.objectContaining({ operationalState: 'DEVUELTA' }),
      after: expect.objectContaining({ operationalState: 'REGISTRADA' }),
    });
    expect(m.notifications.areaHeadsForProcess).toHaveBeenCalledWith('p1');
    expect(m.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['uj'],
        type: 'REQUEST_RESUBMITTED',
        requestId: 'r1',
        link: '/demanda/triage?requestId=r1',
        title: expect.stringContaining('PRY-0012'),
        message: expect.stringContaining('PRY-0012'),
      }),
    );
  });

  it('un integrante que no la creó recibe 403 y no cambia nada', async () => {
    const attempt = service.resubmit(ajeno(), 'r1', {});
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(
      'Solo quien registró la solicitud, el líder del proceso o el jefe de área pueden reenviarla a triage.',
    );
    expect(requestMock().update).not.toHaveBeenCalled();
    expect(m.notifications.notify).not.toHaveBeenCalled();
  });

  it.each(['REGISTRADA', 'EN_TRIAGE', 'BACKLOG_PRIORIZADO', 'RECHAZADA', 'COMPROMETIDA'])(
    'desde %s responde 409 en español',
    async (state) => {
      requestMock().findFirst.mockResolvedValue(row({ operationalState: state }));
      const attempt = service.resubmit(jefe(), 'r1', {});
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow('Solo se puede reenviar a triage una solicitud devuelta.');
      expect(requestMock().update).not.toHaveBeenCalled();
    },
  );

  it('al reenviar se pueden corregir los campos de la ficha en el mismo paso', async () => {
    await service.resubmit(creador(), 'r1', { title: 'Título corregido', expectedResult: 'Resultado claro' });
    const data = requestMock().update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      operationalState: 'REGISTRADA',
      title: 'Título corregido',
      expectedResult: 'Resultado claro',
    });
    expect(m.auditRecord).toHaveBeenCalledTimes(1);
  });

  it('conserva el historial de triages: no borra ni reescribe decisiones anteriores', async () => {
    await service.resubmit(creador(), 'r1', {});
    const triage = m.prismaObj.triage as { create: jest.Mock; deleteMany: jest.Mock };
    expect(triage.deleteMany).not.toHaveBeenCalled();
    expect(triage.create).not.toHaveBeenCalled();
  });

  it('sin proceso principal avisa a todos los jefes en vez de a nadie', async () => {
    requestMock().findFirst.mockResolvedValue(row({ operationalState: 'DEVUELTA', mainProcessId: null }));
    await service.resubmit(creador(), 'r1', {});
    expect(m.notifications.allAreaHeads).toHaveBeenCalled();
    expect(m.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['uj', 'uj2'], type: 'REQUEST_RESUBMITTED' }),
    );
  });

});

describe('RequestStateService · decisión del triage visible al solicitante (D4)', () => {
  function build() {
    const m = createMocks();
    const triage = m.prismaObj.triage as { findFirst: jest.Mock };
    return { m, triage };
  }

  it('expone solo el motivo de la última devolución o rechazo, nunca notas ni dependencias', async () => {
    const { m, triage } = build();
    triage.findFirst.mockResolvedValue({
      decision: 'DEVOLVER',
      decisionReason: REASON,
      notes: 'NOTA INTERNA',
      dependencies: 'DEPENDENCIA INTERNA',
      decidedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    (m.prismaObj.priorityEvaluation as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);

    const res = await m.state.buildResponse(row({ operationalState: 'DEVUELTA' }) as never);

    expect(res.currentTriageDecision).toBe('DEVOLVER');
    expect(res.currentTriageReason).toBe(REASON);
    expect(res.currentTriageDecidedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain('NOTA INTERNA');
    expect(serialized).not.toContain('DEPENDENCIA INTERNA');
  });

  it('con CONTINUAR o sin triage el motivo es null', async () => {
    const { m, triage } = build();
    (m.prismaObj.priorityEvaluation as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    triage.findFirst.mockResolvedValue({ decision: 'CONTINUAR', decisionReason: null, decidedAt: new Date() });
    expect((await m.state.buildResponse(row() as never)).currentTriageReason).toBeNull();
    triage.findFirst.mockResolvedValue(null);
    const none = await m.state.buildResponse(row() as never);
    expect(none.currentTriageReason).toBeNull();
    expect(none.currentTriageDecidedAt).toBeNull();
  });
});
