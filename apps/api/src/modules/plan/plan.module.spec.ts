import 'reflect-metadata';
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PlanModule } from './plan.module';
import { TaskController } from './task/task.controller';
import { PlanController } from './plan.controller';

/**
 * Regresion de routing (hallazgo heredado de Fase 2): la ruta estatica
 * GET /my-work del TaskController NO debe compartir prefijo con GET /tasks/:id,
 * y el controller que la expone se registra antes que los demas por precaucion.
 * Ademas, dentro del TaskController, 'my-work' se declara antes que 'tasks/:id'.
 */
describe('PlanModule routing', () => {
  const controllers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PlanModule) ?? [];

  it('registra TaskController antes que PlanController', () => {
    const taskIndex = controllers.indexOf(TaskController);
    const planIndex = controllers.indexOf(PlanController);
    expect(taskIndex).toBeGreaterThanOrEqual(0);
    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(taskIndex).toBeLessThan(planIndex);
  });

  it('expone GET /my-work en una ruta propia (no bajo /tasks)', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      TaskController.prototype.myWork,
    );
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      TaskController.prototype.myWork,
    );
    expect(path).toBe('my-work');
    expect(method).toBe(RequestMethod.GET);
  });

  it('my-work se declara antes que tasks/:id dentro del controller', () => {
    const names = Object.getOwnPropertyNames(TaskController.prototype);
    expect(names.indexOf('myWork')).toBeLessThan(names.indexOf('findOne'));
  });
});
