import { AuthResetController } from './auth-reset.controller';
import { AuthResetService } from './auth-reset.service';

describe('AuthResetController (delegacion)', () => {
  const svc = {
    forgotPassword: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue('reset'),
  } as unknown as AuthResetService;
  const controller = new AuthResetController(svc);

  it('forgotPassword delega el dto', async () => {
    const dto = { identifier: 'u@demo.local' } as never;
    await expect(controller.forgotPassword(dto)).resolves.toBeUndefined();
    expect(svc.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('resetPassword delega el dto', async () => {
    const dto = { token: 't', password: 'nuevo' } as never;
    await expect(controller.resetPassword(dto)).resolves.toBe('reset');
    expect(svc.resetPassword).toHaveBeenCalledWith(dto);
  });
});
