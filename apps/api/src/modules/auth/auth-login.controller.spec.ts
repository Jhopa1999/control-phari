import { AuthLoginController } from './auth-login.controller';
import { AuthLoginService } from './auth-login.service';

describe('AuthLoginController (delegacion)', () => {
  const svc = {
    login: jest.fn().mockResolvedValue('login'),
  } as unknown as AuthLoginService;
  const controller = new AuthLoginController(svc);

  it('login delega el dto', async () => {
    const dto = { identifier: 'u@demo.local', password: 'x' } as never;
    await expect(controller.login(dto)).resolves.toBe('login');
    expect(svc.login).toHaveBeenCalledWith(dto);
  });
});
