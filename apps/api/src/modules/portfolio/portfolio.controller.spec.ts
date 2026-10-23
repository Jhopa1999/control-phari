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
    isAdmin: false,
  };
}

describe('PortfolioController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue('list'),
  } as unknown as PortfolioService;
  const controller = new PortfolioController(svc);

  it('list delega actor y filtros', async () => {
    const a = actor();
    const filters = {} as never;
    await expect(controller.list(a, filters)).resolves.toBe('list');
    expect(svc.list).toHaveBeenCalledWith(a, filters);
  });
});
