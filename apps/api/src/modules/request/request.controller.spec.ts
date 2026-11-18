import { RequestController } from './request.controller';
import { RequestService } from './request.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

describe('RequestController (delegacion)', () => {
  const svc = {
    findMany: jest.fn().mockResolvedValue({ rows: ['fila'], total: 7, truncated: false, window: { paginated: true, page: 2, pageSize: 5, skip: 5, take: 5 } }),
    findOne: jest.fn().mockResolvedValue('findOne'),
    create: jest.fn().mockResolvedValue('create'),
    update: jest.fn().mockResolvedValue('update'),
  } as unknown as RequestService;
  const controller = new RequestController(svc);
  const a = actor();

  it('findMany delega actor y filtros', async () => {
    const filters = {} as never;
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
    await expect(controller.findMany(a, filters, res)).resolves.toEqual(['fila']);
    // El total y la ventana viajan en cabeceras; el cuerpo sigue siendo un arreglo.
    expect(headers).toEqual({
      'X-Total-Count': '7',
      'X-Page': '2',
      'X-Page-Size': '5',
      'X-Truncated': 'false',
    });
    expect(svc.findMany).toHaveBeenCalledWith(a, filters);
  });

  it('findOne delega actor e id', async () => {
    await expect(controller.findOne(a, 'r1')).resolves.toBe('findOne');
    expect(svc.findOne).toHaveBeenCalledWith(a, 'r1');
  });

  it('findByCode delega actor y código', async () => {
    (svc as unknown as { findByCode: jest.Mock }).findByCode = jest.fn().mockResolvedValue('byCode');
    await expect(controller.findByCode(a, 'PRY-0012')).resolves.toBe('byCode');
    expect(svc.findByCode).toHaveBeenCalledWith(a, 'PRY-0012');
  });
  it('create delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('update delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'r1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'r1', dto);
  });
});
