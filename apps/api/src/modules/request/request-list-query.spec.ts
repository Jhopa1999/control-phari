import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { resolvePage } from '../../common/pagination/pagination';
import { PrismaService } from '../../database/prisma.service';
import { ListRequestsDto } from './dto/list-requests.dto';
import {
  buildRequestWhere,
  orderByIds,
  pageRequestIds,
} from './request-list-query';

type Row = { id: string; operationalState: string };

function prismaWith(rows: Row[], evaluations: { requestId: string; score: number }[] = []) {
  const obj = {
    request: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    priorityEvaluation: { findMany: jest.fn().mockResolvedValue(evaluations) },
  };
  return { obj, prisma: obj as unknown as PrismaService };
}

const band = (score: number): string => (score >= 80 ? 'P1' : score >= 45 ? 'P3' : 'P4');

describe('request-list-query', () => {
  describe('buildRequestWhere', () => {
    const scope = { deletedAt: null };

    it('sin filtros devuelve solo el alcance', () => {
      expect(buildRequestWhere(scope, {}, { searchRequester: true })).toEqual({ AND: [scope] });
    });

    it('q busca en código, título y (opcional) solicitante', () => {
      const contains = { contains: 'abc', mode: 'insensitive' };
      expect(buildRequestWhere(scope, { q: ' abc ' }, { searchRequester: true }).AND).toContainEqual({
        OR: [{ code: contains }, { title: contains }, { requesterName: contains }],
      });
      expect(buildRequestWhere(scope, { q: 'abc' }, { searchRequester: false }).AND).toContainEqual({
        OR: [{ code: contains }, { title: contains }],
      });
    });

    it('q vacío no restringe', () => {
      expect(buildRequestWhere(scope, { q: '   ' }, { searchRequester: true })).toEqual({ AND: [scope] });
    });

    it('SIN_PROCESO se combina en OR con los UUID', () => {
      expect(
        buildRequestWhere(scope, { mainProcessId: ['u1', 'SIN_PROCESO'] }, { searchRequester: true }).AND,
      ).toContainEqual({ OR: [{ mainProcessId: { in: ['u1'] } }, { mainProcessId: null }] });
    });
  });

  describe('pageRequestIds', () => {
    it('orden en base de datos con desempate por id y count del mismo where', async () => {
      const { obj, prisma } = prismaWith([{ id: 'a', operationalState: 'REGISTRADA' }]);
      const where = { AND: [{ deletedAt: null }] };
      const res = await pageRequestIds(prisma, where, { sort: 'title', dir: 'desc' }, resolvePage({ page: 2, pageSize: 10 }), band);
      expect(obj.request.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ title: 'desc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
        select: { id: true },
      });
      expect(obj.request.count).toHaveBeenCalledWith({ where });
      expect(res).toEqual({ ids: ['a'], total: 1 });
    });

    it('code ordena por número (no alfabético) y asc por defecto', async () => {
      const { obj, prisma } = prismaWith([]);
      await pageRequestIds(prisma, {}, { sort: 'code' }, resolvePage({}), band);
      expect(obj.request.findMany.mock.calls[0][0].orderBy).toEqual([{ number: 'asc' }, { id: 'asc' }]);
    });

    it('banda: filtra antes de paginar y el total la descuenta', async () => {
      const rows = ['r1', 'r2', 'r3', 'r4'].map((id) => ({ id, operationalState: 'REGISTRADA' }));
      const { obj, prisma } = prismaWith(rows, [
        { requestId: 'r2', score: 90 },
        { requestId: 'r3', score: 20 },
        { requestId: 'r4', score: 85 },
      ]);
      const res = await pageRequestIds(prisma, {}, { band: ['P1', 'SIN_PRIORIZAR'] }, resolvePage({ page: 1, pageSize: 2 }), band);
      // r1 sin evaluación (SIN_PRIORIZAR), r2 y r4 en P1; r3 (P4) queda fuera.
      expect(res.total).toBe(3);
      expect(res.ids).toEqual(['r1', 'r2']);
      expect(obj.request.count).not.toHaveBeenCalled();
    });

    it('score: sin evaluación al final en ambas direcciones; orden estable', async () => {
      const rows = ['r1', 'r2', 'r3', 'r4'].map((id) => ({ id, operationalState: 'REGISTRADA' }));
      const evaluations = [
        { requestId: 'r2', score: 50 },
        { requestId: 'r4', score: 90 },
        // Una evaluación anterior (más abajo en el orden desc) no cuenta.
        { requestId: 'r2', score: 10 },
      ];
      const desc = await pageRequestIds(prismaWith(rows, evaluations).prisma, {}, { sort: 'score', dir: 'desc' }, resolvePage({}), band);
      expect(desc.ids).toEqual(['r4', 'r2', 'r1', 'r3']);
      const asc = await pageRequestIds(prismaWith(rows, evaluations).prisma, {}, { sort: 'score', dir: 'asc' }, resolvePage({}), band);
      expect(asc.ids).toEqual(['r2', 'r4', 'r1', 'r3']);
    });

    it('state ordena por el orden del flujo, no alfabético', async () => {
      const rows = [
        { id: 'a', operationalState: 'CERRADA' },
        { id: 'b', operationalState: 'REGISTRADA' },
        { id: 'c', operationalState: 'EN_TRIAGE' },
      ];
      const res = await pageRequestIds(prismaWith(rows).prisma, {}, { sort: 'state' }, resolvePage({}), band);
      expect(res.ids).toEqual(['b', 'c', 'a']);
    });
  });

  it('orderByIds conserva el orden de la ventana y omite ids desaparecidos', () => {
    expect(orderByIds(['b', 'x', 'a'], [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'b' }, { id: 'a' }]);
  });

  describe('ListRequestsDto (compatibilidad)', () => {
    it('un valor único de state y mainProcessId se convierte en lista', async () => {
      const dto = plainToInstance(ListRequestsDto, {
        state: 'REGISTRADA',
        mainProcessId: '11111111-1111-1111-1111-111111111111',
      });
      expect(dto.state).toEqual(['REGISTRADA']);
      expect(dto.mainProcessId).toEqual(['11111111-1111-1111-1111-111111111111']);
      expect(await validate(dto)).toEqual([]);
    });

    it('acepta SIN_PROCESO y rechaza sort fuera de la lista blanca', async () => {
      const ok = plainToInstance(ListRequestsDto, { mainProcessId: 'SIN_PROCESO', sort: 'score' });
      expect(await validate(ok)).toEqual([]);
      const bad = plainToInstance(ListRequestsDto, { sort: 'requesterName' });
      expect((await validate(bad)).map((e) => e.property)).toEqual(['sort']);
    });
  });
});
