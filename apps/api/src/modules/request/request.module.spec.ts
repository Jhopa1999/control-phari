import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { RequestModule } from './request.module';
import { RequestController } from './request.controller';
import { ApprovalController } from './approval/approval.controller';

/**
 * Regresion de routing (descubierta en la verificacion de Fase 2): la ruta
 * estatica GET /requests/pending-approval (ApprovalController) comparte prefijo
 * con la parametrica GET /requests/:id (RequestController). En NestJS/Express el
 * match sigue el orden de registro de los controllers, por lo que el que expone
 * la ruta estatica DEBE registrarse antes que el de la parametrica; de lo
 * contrario ParseUUIDPipe de :id intercepta 'pending-approval' y responde 400.
 */
describe('RequestModule routing order', () => {
  const controllers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RequestModule) ?? [];

  it('registra ApprovalController antes que RequestController', () => {
    const approvalIndex = controllers.indexOf(ApprovalController);
    const requestIndex = controllers.indexOf(RequestController);

    expect(approvalIndex).toBeGreaterThanOrEqual(0);
    expect(requestIndex).toBeGreaterThanOrEqual(0);
    // La ruta estatica (pending-approval) debe resolverse antes que :id.
    expect(approvalIndex).toBeLessThan(requestIndex);
  });
});
