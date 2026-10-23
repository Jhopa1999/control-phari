import { AreaController } from './area.controller';
import { AreaService } from './area.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isAdmin: true,
  };
}

describe('AreaController (delegacion)', () => {
  const svc = {
    findMany: jest.fn().mockResolvedValue('findMany'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    create: jest.fn().mockResolvedValue('create'),
    update: jest.fn().mockResolvedValue('update'),
  } as unknown as AreaService;
  const controller = new AreaController(svc);

  it('findMany delega los filtros', async () => {
    const filters = { active: true } as never;
    await expect(controller.findMany(filters)).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith(filters);
  });

  it('findOne delega el id', async () => {
    await expect(controller.findOne('a1')).resolves.toBe('findOne');
    expect(svc.findOne).toHaveBeenCalledWith('a1');
  });

  it('create delega actor y dto', async () => {
    const a = actor();
    const dto = { code: 'X', name: 'X' } as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('update delega actor, id y dto', async () => {
    const a = actor();
    const dto = { name: 'Y' } as never;
    await expect(controller.update(a, 'a1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'a1', dto);
  });
});
