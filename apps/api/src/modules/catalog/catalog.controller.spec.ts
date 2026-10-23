import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

describe('CatalogController (delegacion)', () => {
  const svc = {
    create: jest.fn().mockResolvedValue('create'),
    findMany: jest.fn().mockResolvedValue('findMany'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
  } as unknown as CatalogService;
  const controller = new CatalogController(svc);
  const a = actor();

  it('create delega actor y dto', async () => {
    const dto = { catalog: 'C', code: 'X', label: 'X' } as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('findMany delega los filtros', async () => {
    const filters = { catalog: 'C' } as never;
    await expect(controller.findMany(filters)).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith(filters);
  });

  it('findOne delega el id', async () => {
    await expect(controller.findOne('c1')).resolves.toBe('findOne');
    expect(svc.findOne).toHaveBeenCalledWith('c1');
  });

  it('update delega actor, id y dto', async () => {
    const dto = { label: 'Y' } as never;
    await expect(controller.update(a, 'c1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'c1', dto);
  });
});
