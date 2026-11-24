import { BadRequestException } from '@nestjs/common';
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
  const user = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma = { auditEvent, user, $transaction } as unknown as PrismaService;
  return { prisma, auditEvent, user };
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
    isLiderProceso: false,
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

  describe('findMany - filtros de investigación', () => {
    const U1 = '11111111-1111-4111-8111-111111111111';
    const U2 = '22222222-2222-4222-8222-222222222222';
    const P1 = '33333333-3333-4333-8333-333333333333';

    function lastWhere() {
      return mocks.auditEvent.findMany.mock.calls[0][0].where;
    }

    it('actorUserId, processId y fechas van en AND y no tocan el alcance del integrante', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.INTEGRANTE], ['p1']), {
        actorUserId: U2,
        processId: P1,
        from: '2026-03-01',
        to: '2026-03-31',
      });
      const where = lastWhere();
      expect(where.actorUserId).toBe('u1');
      expect(where.AND).toEqual([
        { actorUserId: U2 },
        { scopeProcessId: P1 },
        { createdAt: { gte: new Date(2026, 2, 1), lt: new Date(2026, 3, 1) } },
      ]);
      expect(mocks.auditEvent.count.mock.calls[0][0].where).toEqual(where);
    });

    it('líder: el OR de alcance sigue intacto y los filtros se intersectan en AND', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.LIDER_PROCESO], ['p1', 'p2']), {
        actorUserId: U1,
        processId: P1,
      });
      const where = lastWhere();
      expect(where.OR).toEqual([
        { scopeProcessId: { in: ['p1', 'p2'] } },
        { scopeProcessId: null, actorUserId: 'u1' },
      ]);
      expect(where.AND).toEqual([{ actorUserId: U1 }, { scopeProcessId: P1 }]);
    });

    it('jefe: sin filtros nuevos no añade AND', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], []), {});
      expect(lastWhere().AND).toBeUndefined();
    });

    it('from y to son inclusivos: desde las 00:00 del primer día hasta el fin del último', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], []), { from: '2026-03-05', to: '2026-03-05' });
      expect(lastWhere().AND).toEqual([
        { createdAt: { gte: new Date(2026, 2, 5), lt: new Date(2026, 2, 6) } },
      ]);
    });

    it('acepta solo from o solo to', async () => {
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], []), { from: '2026-03-05' });
      expect(lastWhere().AND).toEqual([{ createdAt: { gte: new Date(2026, 2, 5) } }]);
    });

    it('rechaza con 400 un rango invertido', async () => {
      await expect(
        service.findMany(actorWith([RoleCode.JEFE_AREA], []), { from: '2026-03-10', to: '2026-03-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(mocks.auditEvent.findMany).not.toHaveBeenCalled();
    });

    it('rechaza con 400 un rango de más de 366 días y acepta exactamente 366', async () => {
      await expect(
        service.findMany(actorWith([RoleCode.JEFE_AREA], []), { from: '2025-01-01', to: '2026-01-02' }),
      ).rejects.toThrow('El rango máximo es de un año');
      stubPage();
      await service.findMany(actorWith([RoleCode.JEFE_AREA], []), { from: '2025-01-01', to: '2026-01-01' });
      expect(mocks.auditEvent.findMany).toHaveBeenCalledTimes(1);
    });

    it('rechaza con 400 una fecha inexistente', async () => {
      await expect(
        service.findMany(actorWith([RoleCode.JEFE_AREA], []), { from: '2026-02-30' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findMany - actorName', () => {
    const U1 = '11111111-1111-4111-8111-111111111111';
    const U2 = '22222222-2222-4222-8222-222222222222';
    const row = (id: string, actorUserId: string | null) => ({
      id,
      actorUserId,
      action: 'UPDATE',
      objectType: 'GRANT',
      objectId: 'g1',
      scopeProcessId: null,
      before: null,
      after: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    it('resuelve los nombres con una sola consulta por página y deja nulo al sistema', async () => {
      stubPage(
        [row('e1', U1), row('e2', U1), row('e3', null), row('e4', U2)] as unknown as AuditEventRow[],
        4,
      );
      mocks.user.findMany.mockResolvedValue([{ id: U1, name: 'Ana Pérez' }]);
      const result = await service.findMany(actorWith([RoleCode.JEFE_AREA], []), {});
      expect(mocks.user.findMany).toHaveBeenCalledTimes(1);
      expect(mocks.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: [U1, U2] } });
      expect(result.data.map((e) => e.actorName)).toEqual(['Ana Pérez', 'Ana Pérez', null, null]);
    });

    it('no consulta usuarios si todos los eventos son del sistema', async () => {
      stubPage([row('e1', null)] as unknown as AuditEventRow[], 1);
      const result = await service.findMany(actorWith([RoleCode.JEFE_AREA], []), {});
      expect(mocks.user.findMany).not.toHaveBeenCalled();
      expect(result.data[0].actorName).toBeNull();
    });
  });
});
