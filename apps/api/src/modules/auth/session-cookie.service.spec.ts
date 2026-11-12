import { JwtService } from '@nestjs/jwt';
import { SessionCookieService } from './session-cookie.service';

describe('SessionCookieService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const service = new SessionCookieService(jwt);
  const original = process.env.COOKIE_SECURE;

  function makeRes() {
    return { setHeader: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() };
  }

  afterEach(() => {
    if (original === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = original;
  });

  it('emite portal_session HttpOnly/Lax/Path=/ con Max-Age del exp', async () => {
    delete process.env.COOKIE_SECURE;
    const token = await jwt.signAsync({ sub: 'u' }, { expiresIn: '1h' });
    const res = makeRes();
    service.issue({ secure: false }, res, token);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const [name, value, options] = res.cookie.mock.calls[0] as [
      string,
      string,
      { maxAge: number; httpOnly: boolean; sameSite: string; path: string; secure: boolean },
    ];
    expect(name).toBe('portal_session');
    expect(value).toBe(token);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    expect(options.maxAge).toBeGreaterThan(3590 * 1000);
    expect(options.maxAge).toBeLessThanOrEqual(3600 * 1000);
  });

  it('auto: Secure solo si la peticion llego por https', async () => {
    delete process.env.COOKIE_SECURE;
    const token = await jwt.signAsync({ sub: 'u' }, { expiresIn: '1h' });
    const res = makeRes();
    service.issue({ secure: true }, res, token);
    expect(res.cookie.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('COOKIE_SECURE=true fuerza Secure y false lo quita', async () => {
    const token = await jwt.signAsync({ sub: 'u' }, { expiresIn: '1h' });
    process.env.COOKIE_SECURE = 'true';
    const a = makeRes();
    service.issue({ secure: false }, a, token);
    expect(a.cookie.mock.calls[0][2]).toMatchObject({ secure: true });
    process.env.COOKIE_SECURE = 'false';
    const b = makeRes();
    service.issue({ secure: true }, b, token);
    expect(b.cookie.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it('sin exp emite cookie de sesion (sin maxAge)', () => {
    const res = makeRes();
    service.issue({ secure: false }, res, 'no-es-un-jwt');
    expect(res.cookie.mock.calls[0][2]).not.toHaveProperty('maxAge');
  });

  it('clear usa los mismos atributos de emision', () => {
    delete process.env.COOKIE_SECURE;
    const res = makeRes();
    service.clear({ secure: true }, res);
    expect(res.clearCookie).toHaveBeenCalledWith('portal_session', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
    });
  });
});
