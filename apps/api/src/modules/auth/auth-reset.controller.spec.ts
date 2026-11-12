import { AuthResetController } from './auth-reset.controller';
import { AuthResetService } from './auth-reset.service';
import { SessionCookieService } from './session-cookie.service';

describe('AuthResetController (delegacion)', () => {
  const svc = {
    forgotPassword: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue({ accessToken: 'jwt' }),
  } as unknown as AuthResetService;
  const cookies = { issue: jest.fn() } as unknown as SessionCookieService;
  const controller = new AuthResetController(svc, cookies);

  it('forgotPassword delega el dto', async () => {
    const dto = { identifier: 'u@demo.local' } as never;
    await expect(controller.forgotPassword(dto)).resolves.toBeUndefined();
    expect(svc.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('resetPassword delega el dto y emite la cookie de sesion', async () => {
    const dto = { token: 't', password: 'nuevo' } as never;
    const req = { secure: false };
    const res = { setHeader: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() };
    await expect(controller.resetPassword(dto, req, res)).resolves.toEqual({
      accessToken: 'jwt',
    });
    expect(svc.resetPassword).toHaveBeenCalledWith(dto);
    expect(cookies.issue).toHaveBeenCalledWith(req, res, 'jwt');
  });
});