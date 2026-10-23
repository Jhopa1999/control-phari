import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isAdmin: false,
  };
}

describe('AssetController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue('list'),
    create: jest.fn().mockResolvedValue('create'),
    get: jest.fn().mockResolvedValue('get'),
    listRequests: jest.fn().mockResolvedValue('listRequests'),
    update: jest.fn().mockResolvedValue('update'),
    changeStatus: jest.fn().mockResolvedValue('changeStatus'),
  } as unknown as AssetService;
  const controller = new AssetController(svc);
  const a = actor();

  it('list delega actor y filtros', async () => {
    const filters = {} as never;
    await expect(controller.list(a, filters)).resolves.toBe('list');
    expect(svc.list).toHaveBeenCalledWith(a, filters);
  });

  it('create delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('get delega actor e id', async () => {
    await expect(controller.get(a, 'as1')).resolves.toBe('get');
    expect(svc.get).toHaveBeenCalledWith(a, 'as1');
  });

  it('listRequests delega actor e id', async () => {
    await expect(controller.listRequests(a, 'as1')).resolves.toBe(
      'listRequests',
    );
    expect(svc.listRequests).toHaveBeenCalledWith(a, 'as1');
  });

  it('update delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'as1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'as1', dto);
  });

  it('changeStatus delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.changeStatus(a, 'as1', dto)).resolves.toBe(
      'changeStatus',
    );
    expect(svc.changeStatus).toHaveBeenCalledWith(a, 'as1', dto);
  });
});
