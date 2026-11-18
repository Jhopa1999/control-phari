import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { AuditService } from './audit.service';

/** Etiquetas y código del objeto en Auditoría, y filtro por código (oleada 3, PR-D). */
function actor(roles: RoleCode[], userId = 'u1'): CurrentActor {
  return {
    userId,
    name: 'Actor',
    identifier: 'actor@demo.local',
    grants: [],
    roleCodes: new Set(roles),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: roles.includes(RoleCode.JEFE_AREA),
    isLiderProceso: false,
    isAdmin: false,
  };
}

function event(objectType: string, objectId: string) {
  return {
    id: `e-${objectType}-${objectId}`,
    actorUserId: 'u1',
    action: 'UPDATE',
    objectType,
    objectId,
    scopeProcessId: null,
    before: null,
    after: null,
    createdAt: new Date('2026-11-18T10:00:00Z'),
  };
}

function build() {
  const prisma = {
    auditEvent: { findMany: jest.fn(), count: jest.fn() },
    request: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    planPhase: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    task: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    asset: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    document: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    area: { findMany: jest.fn().mockResolvedValue([]) },
    process: { findMany: jest.fn().mockResolvedValue([]) },
    catalogItem: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const service = new AuditService(prisma as unknown as PrismaService);
  return { prisma, service };
}

type FindUniqueDelegates = Record<string, { findUnique: jest.Mock }>;

describe('AuditService · código y etiqueta del objeto', () => {
  it('devuelve código y etiqueta de solicitud, activo y documento con una consulta por tipo', async () => {
    const { prisma, service } = build();
    prisma.auditEvent.findMany.mockResolvedValue([
      event('REQUEST', '00000000-0000-4000-8000-000000000001'),
      event('REQUEST', '00000000-0000-4000-8000-000000000002'),
      event('ASSET', '00000000-0000-4000-8000-0000000000a1'),
      event('DOCUMENT', '00000000-0000-4000-8000-0000000000d1'),
    ]);
    prisma.auditEvent.count.mockResolvedValue(4);
    prisma.request.findMany.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000001', code: 'PRY-0012', title: 'Demanda uno' },
      { id: '00000000-0000-4000-8000-000000000002', code: 'PRY-0013', title: 'Demanda dos' },
    ]);
    prisma.asset.findMany.mockResolvedValue([{ id: '00000000-0000-4000-8000-0000000000a1', number: 7, name: 'Contrato marco' }]);
    prisma.document.findMany.mockResolvedValue([{ id: '00000000-0000-4000-8000-0000000000d1', number: 3, title: 'Manual' }]);

    const res = await service.findMany(actor([RoleCode.JEFE_AREA]), {});

    expect(res.data.map((e) => [e.objectCode, e.objectLabel])).toEqual([
      ['PRY-0012', 'Demanda uno'],
      ['PRY-0013', 'Demanda dos'],
      ['ACT-0007', 'Contrato marco'],
      ['DOC-0003', 'Manual'],
    ]);
    // Sin N+1: una consulta por tipo presente.
    expect(prisma.request.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.asset.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('los tipos de configuración llevan etiqueta pero no código; un objeto eliminado no lleva ninguno', async () => {
    const { prisma, service } = build();
    prisma.auditEvent.findMany.mockResolvedValue([
      event('USER', '00000000-0000-4000-8000-000000000009'),
      event('CATALOG_ITEM', '00000000-0000-4000-8000-0000000000c1'),
      event('TASK', '00000000-0000-4000-8000-0000000000bb'),
      event('GRANT', '00000000-0000-4000-8000-0000000000f1'),
    ]);
    prisma.auditEvent.count.mockResolvedValue(4);
    prisma.user.findMany.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000009', name: 'Ana Pérez' }]);
    prisma.catalogItem.findMany.mockResolvedValue([{ id: '00000000-0000-4000-8000-0000000000c1', label: 'Categoría X' }]);

    const res = await service.findMany(actor([RoleCode.JEFE_AREA]), {});

    expect(res.data.map((e) => [e.objectCode, e.objectLabel])).toEqual([
      [null, 'Ana Pérez'],
      [null, 'Categoría X'],
      [null, null],
      [null, null],
    ]);
  });

  it('un objectId que no es UUID (LOGIN_FAILED guarda el identificador) no rompe la consulta ni recibe etiqueta', async () => {
    const { prisma, service } = build();
    const uuid = '00000000-0000-4000-8000-000000000009';
    prisma.auditEvent.findMany.mockResolvedValue([event('USER', 'alguien@demo.local'), event('USER', uuid)]);
    prisma.auditEvent.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([{ id: uuid, name: 'Ana Pérez' }]);

    const res = await service.findMany(actor([RoleCode.JEFE_AREA]), {});

    // Solo el UUID llega a la consulta: un texto en una columna uuid haría fallar todo (500).
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [uuid] } } }),
    );
    expect(res.data.map((e) => e.objectLabel)).toEqual([null, 'Ana Pérez']);
  });

  it('no calcula etiquetas si la página está vacía', async () => {
    const { prisma, service } = build();
    prisma.auditEvent.findMany.mockResolvedValue([]);
    prisma.auditEvent.count.mockResolvedValue(0);
    await service.findMany(actor([RoleCode.INTEGRANTE]), {});
    expect(prisma.request.findMany).not.toHaveBeenCalled();
  });
});

describe('AuditService · filtro por código del objeto', () => {
  it.each([
    ['PRY-0012', 'request', 'REQUEST', { code: 'PRY-0012' }],
    ['pry-0012-f2', 'planPhase', 'PLAN_PHASE', { code: 'PRY-0012-F2' }],
    ['PRY-0012-T07', 'task', 'TASK', { code: 'PRY-0012-T07' }],
    ['ACT-0007', 'asset', 'ASSET', { number: 7 }],
    ['doc-0003', 'document', 'DOCUMENT', { number: 3 }],
  ])('%s se traduce a tipo e id y mantiene el alcance del rol', async (code, delegate, type, where) => {
    const { prisma, service } = build();
    const delegates = prisma as unknown as FindUniqueDelegates;
    delegates[delegate].findUnique.mockResolvedValue({ id: 'obj-1' });
    prisma.auditEvent.findMany.mockResolvedValue([]);
    prisma.auditEvent.count.mockResolvedValue(0);

    await service.findMany(actor([RoleCode.INTEGRANTE], 'u7'), { objectCode: code });

    expect(delegates[delegate].findUnique).toHaveBeenCalledWith(expect.objectContaining({ where }));
    const used = prisma.auditEvent.findMany.mock.calls[0][0].where;
    // El filtro intersecta el alcance: el integrante sigue limitado a su actividad.
    expect(used).toMatchObject({ actorUserId: 'u7', objectType: type, objectId: 'obj-1' });
  });

  it('un código que no existe devuelve la lista vacía sin consultar eventos (nunca 404)', async () => {
    const { prisma, service } = build();
    prisma.asset.findUnique.mockResolvedValue(null);
    const res = await service.findMany(actor([RoleCode.JEFE_AREA]), { objectCode: 'ACT-9999', page: 2 });
    expect(res).toEqual({ data: [], page: 2, pageSize: 25, total: 0, hasMore: false });
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it('un tipo de objeto distinto al del código devuelve la lista vacía', async () => {
    const { prisma, service } = build();
    prisma.request.findUnique.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' });
    const res = await service.findMany(actor([RoleCode.JEFE_AREA]), {
      objectCode: 'PRY-0012',
      objectType: 'ASSET',
    });
    expect(res.total).toBe(0);
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });
});
