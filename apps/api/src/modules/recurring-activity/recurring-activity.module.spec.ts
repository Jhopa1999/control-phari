import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';

// El scheduler (provider del modulo) importa `@nestjs/schedule`, que se publica
// como ESM y el transform de ts-jest no puede cargar como CommonJS. No es
// relevante para este test (solo inspeccionamos metadata del modulo), asi que
// se mockea con un stub minimo para poder importar el modulo sin ejecutar la
// cadena ESM.
jest.mock('@nestjs/schedule', () => ({
  SchedulerRegistry: class {},
  ScheduleModule: { forRoot: () => ({}) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecurringActivityModule } = require('./recurring-activity.module') as {
  RecurringActivityModule: new () => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OccurrenceController } = require('./occurrence.controller') as {
  OccurrenceController: new (...args: never[]) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecurringActivityController } = require('./recurring-activity.controller') as {
  RecurringActivityController: new (...args: never[]) => unknown;
};

/**
 * Regresion del bug de autorizacion de "que me toca" (GET
 * /recurring-activities/occurrences devolvia 403 a un LIDER_PROCESO).
 *
 * Causa raiz: colision de rutas por orden de registro. El router (Express)
 * resuelve los handlers en el orden en que se registran los controllers del
 * modulo. `RecurringActivityController` expone `recurring-activities/:id` y
 * `OccurrenceController` expone `recurring-activities/occurrences`. Si el
 * controller con `:id` se registra ANTES, la peticion a `.../occurrences` casa
 * con `:id` (= "occurrences") y nunca llega al listado de ocurrencias:
 *  - LIDER_PROCESO/INTEGRANTE -> 403 (RolesGuard de `:id`, solo JEFE_AREA/ADMIN)
 *  - JEFE_AREA/ADMIN          -> 400 (ParseUUIDPipe de `:id`)
 *
 * El contrato que evita la colision es registrar la ruta estatica mas
 * especifica (`occurrences`) ANTES que la parametrizada (`:id`). Este test fija
 * ese orden para que no se reintroduzca.
 */
describe('RecurringActivityModule (orden de controllers / colision de rutas)', () => {
  const controllers = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    RecurringActivityModule,
  ) as unknown[];

  it('registra ambos controllers del modulo', () => {
    expect(controllers).toContain(OccurrenceController);
    expect(controllers).toContain(RecurringActivityController);
  });

  it('OccurrenceController (ruta estatica) se registra ANTES que RecurringActivityController (ruta :id)', () => {
    const occIndex = controllers.indexOf(OccurrenceController);
    const defIndex = controllers.indexOf(RecurringActivityController);
    expect(occIndex).toBeGreaterThanOrEqual(0);
    expect(defIndex).toBeGreaterThanOrEqual(0);
    expect(occIndex).toBeLessThan(defIndex);
  });
});
