import { UserController } from './user.controller';
import { UserService } from './user.service';
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

describe('UserController (delegacion)', () => {
  const svc = {
    findMany: jest.fn().mockResolvedValue('findMany'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    create: jest.fn().mockResolvedValue('create'),
    update: jest.fn().mockResolvedValue('update'),
  } as unknown as UserService;
  const controller = new UserController(svc);
  const a = actor();

  it('findMany delega sin argumentos', async () => {
    await expect(controller.findMany()).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith();
  });

  it('findOne delega el id', async () => {
    await expect(controller.findOne('us1')).resolves.toBe('findOne');
    expect(svc.findOne).toHaveBeenCalledWith('us1');
  });

  it('create delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, dto);
  });

  it('update delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'us1', dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, 'us1', dto);
  });
});
