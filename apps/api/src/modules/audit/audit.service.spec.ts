import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from './audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

type AuditDelegateMock = {
  create: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};

/** Fila minima de auditoria para los stubs del delegado (lo que devuelve findMany). */
type AuditEventRow = { id: string };

function createMocks() {
  const auditEvent: AuditDelegateMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  // findMany usa this.prisma.$transaction([findMany, count]); el mock resuelve
  // el array de promesas en orden, como lo hace Prisma con operaciones batch.
  const $transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));
  const prisma = { auditEvent, $transaction } as unknown as PrismaService;
  return { prisma, auditEvent };
}

function actorWith(roles: RoleCode[], scoped: string[]): CurrentActor {
  return {
    userId: 'u1',
    name: 'Actor',
    identifier: 'actor@demo.local',
    grants: [],
    roleCodes: new Set(roles),
    scopedProcessIds: new Set(scoped),
    isJefeArea: roles.includes(RoleCode.JEFE_AREA),
    isAdmin: false,
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let mocks: ReturnType<typeof createMocks>;

  /** Prepara una pagina: findMany devuelve `rows` y count devuelve `total`. */
  function stubPage(rows: AuditEventRow[] = [], total = 0): void {
    mocks.auditEvent.findMany.mockResolvedValue(rows);
    mocks.auditEvent.count.mockResolvedValue(total);
  }

  beforeEach(() => {
    mocks = createMocks();
    service = new AuditService(mocks.prisma);
  });

  describe('record', () => {
    it('inserta con el cliente transaccional y convierte null a Prisma.JsonNull', async () => {
      const tx = { auditEvent: { create: jest.fn() } };
      await service.record(tx as unknown as Prisma.TransactionClient, {
        actorUserId: 'u1',
        action: 'CREATE',
        objectType: 'GRANT',
        objectId: 'g1',
        scopeProcessId: 'p1',
        before: null,
        after: { active: true },
      });

      const data = tx.auditEvent.create.mock.calls[0][0].data;
      expect(data.before).toBe(Prisma.JsonNull);
      expect(data.after).toEqual({ active: true });
      // No se usa el prisma no-transaccional para escribir.
      expect(mocks.auditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('findMany - alcance por rol', () => {
    it('integrante: solo sus propios eventos (actorUserId)', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.INTEGRANTE], ['p1']), {});
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.actorUserId).toBe('u1');
      expect(where.scopeProcessId).toBeUndefined();
    });

    it('lider: eventos de sus procesos MAS sus propios eventos sin proceso (OR)', async () => {
      stubPage();
      await service.findMany(
        actorWith([RoleCode.LIDER_PROCESO], ['p1', 'p2']),
        {},
      );
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { scopeProcessId: { in: ['p1', 'p2'] } },
        { scopeProcessId: null, actorUserId: 'u1' },
      ]);
      expect(where.actorUserId).toBeUndefined();
    });

    it('jefe: area completa, SIN filtro de proceso (ve eventos con y sin scopeProcessId)', async () => {
      // El jefe debe ver tambien MONTHLY_AVAILABILITY/USER/GRANT/CATALOG_ITEM,
      // que se auditan con scopeProcessId=null; filtrar por proceso los ocultaria.
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {});
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.scopeProcessId).toBeUndefined();
      expect(where.OR).toBeUndefined();
      expect(where.actorUserId).toBeUndefined();
    });

    it('jefe: con filtro objectType=MONTHLY_AVAILABILITY ve esos eventos (sin proceso)', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        objectType: 'MONTHLY_AVAILABILITY',
      });
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.scopeProcessId).toBeUndefined();
      expect(where.objectType).toBe('MONTHLY_AVAILABILITY');
    });

    it('count y findMany reciben el MISMO where de alcance (la paginacion va DESPUES del alcance)', async () => {
      // INTEGRANTE: el total y hasMore se calculan sobre lo propio, nunca sobre todo.
      stubPage([], 0);
      await service.findMany(actorWith([RoleCode.INTEGRANTE], ['p1']), {});
      const findManyWhere = mocks.auditEvent.findMany.mock.calls[0][0].where;
      const countWhere = mocks.auditEvent.count.mock.calls[0][0].where;
      expect(countWhere).toEqual(findManyWhere);
      expect(countWhere.actorUserId).toBe('u1');
    });
  });

  describe('findMany - paginacion y orden', () => {
    it('pagina por defecto page=1, pageSize=25 y orden createdAt desc', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {});
      const arg = mocks.auditEvent.findMany.mock.calls[0][0];
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(25);
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('acota pageSize a <= 100 aunque pidan mas, nunca ilimitado', async () => {
      stubPage();
      const result = await service.findMany(
        actorWith([RoleCode.JEFE_AREA], ['p1']),
        { pageSize: 999 },
      );
      expect(mocks.auditEvent.findMany.mock.calls[0][0].take).toBe(100);
      expect(result.pageSize).toBe(100);
    });

    it('calcula skip = (page - 1) * pageSize', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        page: 3,
        pageSize: 10,
      });
      expect(mocks.auditEvent.findMany.mock.calls[0][0].skip).toBe(20);
    });

    it('hasMore true cuando hay mas paginas despues de la actual', async () => {
      stubPage([], 100);
      const result = await service.findMany(
        actorWith([RoleCode.JEFE_AREA], ['p1']),
        { page: 1, pageSize: 25 },
      );
      expect(result).toMatchObject({ page: 1, pageSize: 25, total: 100, hasMore: true });
    });

    it('hasMore false en la ultima pagina', async () => {
      stubPage([], 30);
      const result = await service.findMany(
        actorWith([RoleCode.JEFE_AREA], ['p1']),
        { page: 2, pageSize: 25 },
      );
      // page*pageSize (50) >= total (30) => no hay mas.
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(30);
    });

    it('devuelve la envoltura { data, page, pageSize, total, hasMore } proyectando las filas', async () => {
      const rows = [
        {
          id: 'e1',
          actorUserId: 'u1',
          action: 'CREATE',
          objectType: 'GRANT',
          objectId: 'g1',
          scopeProcessId: null,
          before: null,
          after: { active: true },
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ] as unknown as AuditEventRow[];
      stubPage(rows, 1);
      const result = await service.findMany(
        actorWith([RoleCode.JEFE_AREA], ['p1']),
        {},
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'e1',
        action: 'CREATE',
        objectType: 'GRANT',
        after: { active: true },
      });
      expect(result).toMatchObject({ page: 1, pageSize: 25, total: 1, hasMore: false });
    });

    it('filtra por objectType cuando se indica (count y findMany)', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        objectType: 'GRANT',
      });
      expect(mocks.auditEvent.findMany.mock.calls[0][0].where.objectType).toBe('GRANT');
      expect(mocks.auditEvent.count.mock.calls[0][0].where.objectType).toBe('GRANT');
    });

    it('filtra por action cuando se indica (se suma al where de count y findMany)', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], ['p1']), {
        action: 'DELETE',
      });
      expect(mocks.auditEvent.findMany.mock.calls[0][0].where.action).toBe('DELETE');
      expect(mocks.auditEvent.count.mock.calls[0][0].where.action).toBe('DELETE');
    });

    it('visibilidad de eventos de Fase 2 por alcance (NIT-8): lider A ve REQUEST de p1 por scopeProcessId', async () => {
      // Los eventos de Fase 2 se escriben con scopeProcessId = mainProcessId,
      // de modo que la lectura por rol de Fase 1 los filtra por scope: un lider
      // de p1 ve los eventos REQUEST con scopeProcessId p1 (primera rama del OR)
      // y no los de p2.
      stubPage();
      await service.findMany(actorWith([RoleCode.LIDER_PROCESO], ['p1']), {
        objectType: 'REQUEST',
      });
      const where = mocks.auditEvent.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { scopeProcessId: { in: ['p1'] } },
        { scopeProcessId: null, actorUserId: 'u1' },
      ]);
      expect(where.objectType).toBe('REQUEST');
    });
  });
});
