import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

describe('PortfolioController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue({ rows: ['fila'], total: 7, truncated: false, window: { paginated: true, page: 2, pageSize: 5, skip: 5, take: 5 } }),
  } as unknown as PortfolioService;
  const controller = new PortfolioController(svc);

  it('summary y execution delegan en el servicio con el actor', async () => {
    const a = actor();
    const summarySvc = {
      summary: jest.fn().mockResolvedValue({ total: 1 }),
      execution: jest.fn().mockResolvedValue({ requestId: 'r1' }),
    } as unknown as PortfolioService;
    const ctrl = new PortfolioController(summarySvc);
    const filters = {} as never;
    await expect(ctrl.summary(a, filters)).resolves.toEqual({ total: 1 });
    await expect(ctrl.execution(a, 'r1')).resolves.toEqual({ requestId: 'r1' });
    expect(summarySvc.summary).toHaveBeenCalledWith(a, filters);
    expect(summarySvc.execution).toHaveBeenCalledWith(a, 'r1');
  });

  it('summary se declara antes de la ruta con parámetro', () => {
    const names = Object.getOwnPropertyNames(PortfolioController.prototype);
    expect(names.indexOf('summary')).toBeLessThan(names.indexOf('execution'));
  });

  it('list delega actor y filtros', async () => {
    const a = actor();
    const filters = {} as never;
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
    await expect(controller.list(a, filters, res)).resolves.toEqual(['fila']);
    // El total y la ventana viajan en cabeceras; el cuerpo sigue siendo un arreglo.
    expect(headers).toEqual({
      'X-Total-Count': '7',
      'X-Page': '2',
      'X-Page-Size': '5',
      'X-Truncated': 'false',
    });
    expect(svc.list).toHaveBeenCalledWith(a, filters);
  });
});
