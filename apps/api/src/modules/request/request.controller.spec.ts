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
    isAdmin: false,
  };
}

describe('RequestController (delegacion)', () => {
  const svc = {
    findMany: jest.fn().mockResolvedValue('findMany'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    create: jest.fn().mockResolvedValue('create'),
    update: jest.fn().mockResolvedValue('update'),
  } as unknown as RequestService;
  const controller = new RequestController(svc);
  const a = actor();

  it('findMany delega actor y filtros', async () => {
    const filters = {} as never;
    await expect(controller.findMany(a, filters)).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith(a, filters);
  });

  it('findOne delega actor e id', async () => {
    await expect(controller.findOne(a, 'r1')).resolves.toBe('findOne');
    expect(svc.findOne).toHaveBeenCalledWith(a, 'r1');
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
