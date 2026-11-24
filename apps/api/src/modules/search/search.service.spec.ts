import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { requestScopeWhere } from '../request/request-scope.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

function actor(role: RoleCode): CurrentActor {
  return {
    userId: 'u1',
    name: 'Persona',
    identifier: 'persona@demo.local',
    grants: [],
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: role === RoleCode.JEFE_AREA,
    isLiderProceso: role === RoleCode.LIDER_PROCESO,
    isAdmin: false,
  };
}

const requestRow = (n: number) => ({
  id: `r${n}`,
  code: `PRY-${String(n).padStart(4, '0')}`,
  title: `Portal ${n}`,
  operationalState: 'EN_EJECUCION',
  mainProcess: n % 2 === 0 ? { name: 'Datos' } : null,
});

const taskRow = (n: number) => ({
  id: `t${n}`,
  code: `PRY-0001-T${String(n).padStart(2, '0')}`,
  title: `Tarea ${n}`,
  status: 'EN_CURSO',
  phase: {
    id: 'ph1',
    name: 'Diseño',
    plan: { request: { id: 'r1', code: 'PRY-0001', title: 'Portal 1', operationalState: 'EN_EJECUCION' } },
  },
});

function build() {
  const prisma = {
    request: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  };
  // Por defecto sin coincidencias; cada prueba fija lo que necesita.
  prisma.request.findMany.mockResolvedValue([]);
  prisma.task.findMany.mockResolvedValue([]);
  return { prisma, service: new SearchService(prisma as never) };
}

describe('SearchService', () => {
  it('jefe y líder: el alcance es el de lectura de todas las no eliminadas', async () => {
    for (const role of [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO]) {
      const { service, prisma } = build();
      await service.search(actor(role), 'portal');
      const where = prisma.request.findMany.mock.calls[1][0].where;
      expect(where.AND[0].AND[0]).toEqual({ deletedAt: null });
    }
  });

  it('integrante: solicitudes y tareas llevan el alcance por procesos o creador', async () => {
    const { service, prisma } = build();
    const a = actor(RoleCode.INTEGRANTE);
    await service.search(a, 'portal');
    const scope = requestScopeWhere(a);
    expect(scope.OR).toBeDefined();
    const requestWhere = prisma.request.findMany.mock.calls[1][0].where;
    expect(requestWhere.AND[0].AND[0]).toEqual(scope);
    const taskWhere = prisma.task.findMany.mock.calls[1][0].where;
    expect(taskWhere.AND[0].AND[0]).toEqual({ phase: { plan: { request: scope } } });
  });

  it('el texto busca en código, título y solicitante de las solicitudes', async () => {
    const { service, prisma } = build();
    await service.search(actor(RoleCode.JEFE_AREA), 'ana');
    const and = prisma.request.findMany.mock.calls[1][0].where.AND[0].AND;
    const contains = { contains: 'ana', mode: 'insensitive' };
    expect(and[1]).toEqual({
      OR: [{ code: contains }, { title: contains }, { requesterName: contains }],
    });
  });

  it('el texto busca en código y título de las tareas', async () => {
    const { service, prisma } = build();
    await service.search(actor(RoleCode.JEFE_AREA), 'ana');
    const and = prisma.task.findMany.mock.calls[1][0].where.AND[0].AND;
    const contains = { contains: 'ana', mode: 'insensitive' };
    expect(and[1]).toEqual({ OR: [{ code: contains }, { title: contains }] });
  });

  it('el filtro nunca amplía el alcance: el exacto y el resto parten del mismo where con alcance', async () => {
    const { service, prisma } = build();
    const a = actor(RoleCode.INTEGRANTE);
    await service.search(a, 'pry-0001');
    const scope = requestScopeWhere(a);
    for (const call of prisma.request.findMany.mock.calls) {
      expect(call[0].where.AND[0].AND[0]).toEqual(scope);
    }
    for (const call of prisma.task.findMany.mock.calls) {
      expect(call[0].where.AND[0].AND[0]).toEqual({ phase: { plan: { request: scope } } });
    }
  });

  it('pide el código exacto normalizado y lo pone primero', async () => {
    const { service, prisma } = build();
    prisma.request.findMany
      .mockResolvedValueOnce([requestRow(12)])
      .mockResolvedValueOnce([requestRow(3), requestRow(2)]);
    const res = await service.search(actor(RoleCode.JEFE_AREA), 'pry 0012');
    expect(prisma.request.findMany.mock.calls[0][0].where.AND[1]).toEqual({ code: 'PRY-0012' });
    expect(res.requests.map((r) => r.code)).toEqual(['PRY-0012', 'PRY-0003', 'PRY-0002']);
    // El resto excluye al exacto y se ordena por registro descendente.
    const rest = prisma.request.findMany.mock.calls[1][0];
    expect(rest.where.AND[1]).toEqual({ id: { notIn: ['r12'] } });
    expect(rest.orderBy[0]).toEqual({ registeredAt: 'desc' });
  });

  it('mapea solicitudes y tareas al formato de CodeResolutionDto', async () => {
    const { service, prisma } = build();
    prisma.request.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([requestRow(2)]);
    prisma.task.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([taskRow(7)]);
    const res = await service.search(actor(RoleCode.JEFE_AREA), 'portal');
    expect(res.requests[0]).toEqual({
      type: 'REQUEST',
      id: 'r2',
      code: 'PRY-0002',
      title: 'Portal 2',
      requestId: 'r2',
      requestCode: 'PRY-0002',
      requestTitle: 'Portal 2',
      requestStatus: 'EN_EJECUCION',
      status: 'EN_EJECUCION',
      processName: 'Datos',
    });
    expect(res.tasks[0]).toMatchObject({
      type: 'TASK',
      code: 'PRY-0001-T07',
      requestCode: 'PRY-0001',
      phaseName: 'Diseño',
      status: 'EN_CURSO',
    });
    expect(res.truncated).toBe(false);
  });

  describe('tope y truncated', () => {
    it('toma uno más que el tope y recorta; truncated verdadero', async () => {
      const { service, prisma } = build();
      prisma.request.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([requestRow(5), requestRow(4), requestRow(3)]);
      const res = await service.search(actor(RoleCode.JEFE_AREA), 'portal', 2);
      expect(prisma.request.findMany.mock.calls[1][0].take).toBe(3);
      expect(res.requests).toHaveLength(2);
      expect(res.truncated).toBe(true);
    });

    it('con exacto, pide limit + 1 - 1 del resto', async () => {
      const { service, prisma } = build();
      prisma.request.findMany
        .mockResolvedValueOnce([requestRow(1)])
        .mockResolvedValueOnce([requestRow(5), requestRow(4)]);
      const res = await service.search(actor(RoleCode.JEFE_AREA), 'pry-0001', 2);
      expect(prisma.request.findMany.mock.calls[1][0].take).toBe(2);
      expect(res.requests.map((r) => r.id)).toEqual(['r1', 'r5']);
      expect(res.truncated).toBe(true);
    });

    it('truncated si solo las tareas superan el tope', async () => {
      const { service, prisma } = build();
      prisma.task.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([taskRow(3), taskRow(2), taskRow(1)]);
      const res = await service.search(actor(RoleCode.JEFE_AREA), 'tarea', 2);
      expect(res.tasks).toHaveLength(2);
      expect(res.requests).toHaveLength(0);
      expect(res.truncated).toBe(true);
    });

    it('sin exceso, truncated falso; el límite por defecto es 10', async () => {
      const { service, prisma } = build();
      prisma.request.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([requestRow(1)]);
      const res = await service.search(actor(RoleCode.JEFE_AREA), 'portal');
      expect(prisma.request.findMany.mock.calls[1][0].take).toBe(11);
      expect(res.truncated).toBe(false);
    });
  });

  describe('SearchQueryDto (q de 2 a 80 caracteres; limit de 1 a 20)', () => {
    async function errors(plain: Record<string, unknown>) {
      const dto = plainToInstance(SearchQueryDto, plain);
      return { dto, errors: await validate(dto) };
    }

    it('recorta q y la acepta con 2 caracteres', async () => {
      const { dto, errors: e } = await errors({ q: '  ab  ' });
      expect(e).toHaveLength(0);
      expect(dto.q).toBe('ab');
    });

    it.each(['', ' ', 'a', '  a  '])('q corta "%s" -> error en español', async (q) => {
      const { errors: e } = await errors({ q });
      expect(e).toHaveLength(1);
      expect(Object.values(e[0].constraints ?? {}).join(' ')).toContain('al menos 2 caracteres');
    });

    it('q ausente -> error', async () => {
      expect((await errors({})).errors).toHaveLength(1);
    });

    it('q de 81 caracteres -> error; de 80 -> válida', async () => {
      const long = await errors({ q: 'a'.repeat(81) });
      expect(Object.values(long.errors[0].constraints ?? {}).join(' ')).toContain('80 caracteres');
      expect((await errors({ q: 'a'.repeat(80) })).errors).toHaveLength(0);
    });

    it.each(['0', '21', '1.5', 'x'])('limit %s -> error', async (limit) => {
      expect((await errors({ q: 'ab', limit })).errors).toHaveLength(1);
    });

    it.each(['1', '20'])('limit %s -> válido (convierte a número)', async (limit) => {
      const { dto, errors: e } = await errors({ q: 'ab', limit });
      expect(e).toHaveLength(0);
      expect(dto.limit).toBe(Number(limit));
    });
  });
});
