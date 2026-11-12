import { AuthLoginController } from './auth-login.controller';
import { AuthLoginService } from './auth-login.service';
import { SessionCookieService } from './session-cookie.service';

describe('AuthLoginController (delegacion)', () => {
  const session = { accessToken: 'jwt', expiresIn: '8h', user: {} };
  const svc = {
    login: jest.fn().mockResolvedValue(session),
  } as unknown as AuthLoginService;
  const cookies = {
    issue: jest.fn(),
    clear: jest.fn(),
  } as unknown as SessionCookieService;
  const controller = new AuthLoginController(svc, cookies);
  const req = { secure: true };
  const res = {
    setHeader: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };

  it('login delega el dto y emite la cookie con el accessToken', async () => {
    const dto = { identifier: 'u@demo.local', password: 'x' } as never;
    await expect(controller.login(dto, req, res)).resolves.toBe(session);
    expect(svc.login).toHaveBeenCalledWith(dto);
    expect(cookies.issue).toHaveBeenCalledWith(req, res, 'jwt');
  });

  it('logout sin cookie borra la cookie', () => {
    controller.logout({}, req, res);
    expect(cookies.clear).toHaveBeenCalledWith(req, res);
  });

  it('logout con cookie y sin CSRF responde 403 sin borrar', () => {
    expect(() =>
      controller.logout({ cookie: 'portal_session=abc' }, req, res),
    ).toThrow('CSRF');
    expect(cookies.clear).not.toHaveBeenCalled();
  });

  it('logout con cookie y CSRF borra la cookie', () => {
    controller.logout(
      { cookie: 'portal_session=abc', 'x-portal-csrf': '1' },
      req,
      res,
    );
    expect(cookies.clear).toHaveBeenCalledWith(req, res);
  });
});
