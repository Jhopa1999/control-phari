import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CapacityModule } from './capacity.module';
import { CapacityController } from './capacity.controller';

/**
 * Contrato de registro del modulo de capacidad (patron request.module.spec.ts):
 * el CapacityController esta registrado. Las rutas estaticas (summary/people/
 * availability/assignments) no colisionan con las parametricas `:id`, que
 * cuelgan de prefijos propios (availability/:id, assignments/:id), por lo que no
 * hace falta un orden especifico de controllers.
 */
describe('CapacityModule routing', () => {
  const controllers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CapacityModule) ?? [];

  it('registra CapacityController', () => {
    expect(controllers).toContain(CapacityController);
  });
});
