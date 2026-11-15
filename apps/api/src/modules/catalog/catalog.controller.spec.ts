import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_MATRIX } from '../auth/module-matrix';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
    isLiderProceso: false,
    isAdmin: false,
  };
}

describe('CatalogController: escritura solo para el módulo «admin» de la matriz', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (handler: (...args: never[]) => unknown, roles: RoleCode[]) =>
    ({
      getHandler: () => handler,
      getClass: () => CatalogController,
      switchToHttp: () => ({
        getRequest: () => ({
          actor: { roleCodes: new Set(roles) },
        }),
      }),
    }) as never;
  const writes = [
    ['POST', CatalogController.prototype.create],
    ['PATCH', CatalogController.prototype.update],
  ] as const;

  it.each(writes)('%s declara exactamente los roles de MODULE_MATRIX.admin', (_name, handler) => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([...MODULE_MATRIX.admin]);
  });

  it.each(writes)('%s rechaza con 403 a integrante, líder y administrador', (_name, handler) => {
    for (const role of [RoleCode.INTEGRANTE, RoleCode.LIDER_PROCESO, RoleCode.ADMIN]) {
      expect(() => guard.canActivate(context(handler, [role]))).toThrow(ForbiddenException);
    }
  });

  it.each(writes)('%s deja pasar al jefe de área', (_name, handler) => {
    expect(guard.canActivate(context(handler, [RoleCode.JEFE_AREA]))).toBe(true);
  });

  it('la lectura sigue abierta a cualquier rol (los formularios usan las maestras)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CatalogController.prototype.findMany)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, CatalogController.prototype.findOne)).toBeUndefined();
  });
});

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
