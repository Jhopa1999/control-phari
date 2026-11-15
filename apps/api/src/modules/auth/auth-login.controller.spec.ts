import { AuthLoginController } from './auth-login.controller';
import { AuthLoginService } from './auth-login.service';
import { TooManyAttemptsException } from './too-many-attempts.exception';
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
    expect(svc.login).toHaveBeenCalledWith(dto, undefined);
    expect(cookies.issue).toHaveBeenCalledWith(req, res, 'jwt');
  });

  it('pasa la IP del cliente al servicio', async () => {
    const dto = { identifier: 'u@demo.local', password: 'x' } as never;
    await controller.login(dto, { secure: true, ip: '203.0.113.7' }, res);
    expect(svc.login).toHaveBeenLastCalledWith(dto, '203.0.113.7');
  });

  it('ante el límite de intentos responde 429 y emite Retry-After sin crear sesión', async () => {
    const limited = {
      login: jest.fn().mockRejectedValue(new TooManyAttemptsException(125)),
    } as unknown as AuthLoginService;
    const issue = jest.fn();
    const ctrl = new AuthLoginController(limited, { issue, clear: jest.fn() } as unknown as SessionCookieService);
    const setHeader = jest.fn();
    const dto = { identifier: 'u@demo.local', password: 'x' } as never;
    await expect(
      ctrl.login(dto, req, { ...res, setHeader }),
    ).rejects.toMatchObject({ status: 429 });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '125');
    expect(issue).not.toHaveBeenCalled();
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
