import { Controller, Get, Inject, INestApplication, Module, Post, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { configureApp, parseCorsOrigins } from '../app.config';
import { ACTOR_RESOLVER, ActorResolver } from '../modules/auth/actor-resolver';
import { AuthLoginController } from '../modules/auth/auth-login.controller';
import { AuthLoginService } from '../modules/auth/auth-login.service';
import { CurrentActor } from '../modules/auth/current-actor';
import { CurrentUserGuard } from '../modules/auth/current-user.guard';
import { SessionCookieService } from '../modules/auth/session-cookie.service';

const ALLOWED = 'http://localhost:3100';

/** Resolver de prueba: valida el JWT con el mismo secreto que el login. */
class TestResolver implements ActorResolver {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}
  async resolve(raw: string | undefined): Promise<CurrentActor | null> {
    if (raw === 'dev-user') return { identifier: 'dev' } as unknown as CurrentActor;
    if (!raw?.startsWith('Bearer ')) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(raw.slice(7));
      return { identifier: payload.sub } as unknown as CurrentActor;
    } catch {
      return null;
    }
  }
}

@Controller('probe')
@UseGuards(CurrentUserGuard)
class ProbeController {
  @Get()
  read(): { ok: boolean } {
    return { ok: true };
  }

  @Post()
  write(): { ok: boolean } {
    return { ok: true };
  }
}

const loginService = {
  login: async (): Promise<unknown> => ({
    accessToken: await new JwtService({ secret: 's3cret' }).signAsync(
      { sub: 'jefe@demo.local' },
      { expiresIn: '8h' },
    ),
    expiresIn: '8h',
    user: { id: '1', name: 'Jefe', identifier: 'jefe@demo.local' },
  }),
};

@Module({
  imports: [JwtModule.register({ secret: 's3cret' })],
  controllers: [AuthLoginController, ProbeController],
  providers: [
    SessionCookieService,
    CurrentUserGuard,
    TestResolver,
    { provide: AuthLoginService, useValue: loginService },
    {
      provide: ACTOR_RESOLVER,
      useFactory: (r: TestResolver) => r,
      inject: [TestResolver],
    },
  ],
})
class TestModule {}

describe('Sesion por cookie, CSRF, CORS y cabeceras (HTTP real)', () => {
  let app: INestApplication;
  let base: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.AUTH_MODE = 'jwt';
    process.env.CORS_ORIGINS = ALLOWED;
    delete process.env.COOKIE_SECURE;
    app = await NestFactory.create(TestModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    process.env = saved;
  });

  async function login(extra: Record<string, string> = {}) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify({ identifier: 'jefe@demo.local', password: 'x' }),
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const body = (await res.json()) as { accessToken: string };
    return { res, setCookie, token: body.accessToken };
  }

  it('login emite portal_session HttpOnly; SameSite=Lax; Path=/; Max-Age y sin Secure en http', async () => {
    const { res, setCookie, token } = await login();
    expect(res.status).toBe(200);
    expect(setCookie).toContain(`portal_session=${token}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=2\d{4}/);
    expect(setCookie).not.toMatch(/Secure/i);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('login con X-Forwarded-Proto: https agrega Secure (COOKIE_SECURE=auto)', async () => {
    const { setCookie } = await login({ 'x-forwarded-proto': 'https' });
    expect(setCookie).toMatch(/Secure/i);
  });

  it('logout borra la cookie con los mismos atributos y es idempotente', async () => {
    const res = await fetch(`${base}/auth/logout`, { method: 'POST' });
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('portal_session=;');
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
  });

  it('logout con cookie exige CSRF', async () => {
    const { token } = await login();
    const cookie = `portal_session=${token}`;
    const sin = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie } });
    expect(sin.status).toBe(403);
    const con = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { cookie, 'x-portal-csrf': '1' },
    });
    expect(con.status).toBe(204);
  });

  it('el guard acepta cookie (GET) y Bearer, y rechaza sin nada', async () => {
    const { token } = await login();
    const porCookie = await fetch(`${base}/probe`, { headers: { cookie: `portal_session=${token}` } });
    expect(porCookie.status).toBe(200);
    const porBearer = await fetch(`${base}/probe`, { headers: { authorization: `Bearer ${token}` } });
    expect(porBearer.status).toBe(200);
    expect((await fetch(`${base}/probe`)).status).toBe(401);
    const malformada = await fetch(`${base}/probe`, { headers: { cookie: 'portal_session=%E0%A4%A' } });
    expect(malformada.status).toBe(401);
  });

  it('CSRF: escritura por cookie sin cabecera 403, con cabecera 201, Bearer sin cabecera 201', async () => {
    const { token } = await login();
    const cookie = `portal_session=${token}`;
    expect((await fetch(`${base}/probe`, { method: 'POST', headers: { cookie } })).status).toBe(403);
    expect(
      (await fetch(`${base}/probe`, { method: 'POST', headers: { cookie, 'x-portal-csrf': '1' } })).status,
    ).toBe(201);
    expect(
      (await fetch(`${base}/probe`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })).status,
    ).toBe(201);
  });

  it('CORS: credenciales solo para el origen permitido', async () => {
    const permitido = await fetch(`${base}/probe`, {
      method: 'OPTIONS',
      headers: {
        origin: ALLOWED,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-portal-csrf,content-type',
      },
    });
    expect(permitido.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(permitido.headers.get('access-control-allow-credentials')).toBe('true');
    expect(permitido.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-portal-csrf');

    const ajeno = await fetch(`${base}/probe`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(ajeno.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('cabeceras de seguridad presentes y sin x-powered-by', async () => {
    const res = await fetch(`${base}/probe`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('strict-transport-security')).toBeNull();
    const https = await fetch(`${base}/probe`, { headers: { 'x-forwarded-proto': 'https' } });
    expect(https.headers.get('strict-transport-security')).toBe('max-age=15552000');
  });

  it('dev-header intacto: X-Actor-Id funciona y la cookie se ignora', async () => {
    process.env.AUTH_MODE = 'dev-header';
    try {
      const { token } = await login();
      const ok = await fetch(`${base}/probe`, { method: 'POST', headers: { 'x-actor-id': 'dev-user' } });
      expect(ok.status).toBe(201);
      const cookie = await fetch(`${base}/probe`, { headers: { cookie: `portal_session=${token}` } });
      expect(cookie.status).toBe(401);
    } finally {
      process.env.AUTH_MODE = 'jwt';
    }
  });
});

describe('parseCorsOrigins', () => {
  const logger = { error: jest.fn() };

  it('sin CORS_ORIGINS no habilita nada', () => {
    expect(parseCorsOrigins(undefined, 'production', logger)).toEqual([]);
  });

  it('lista explicita se conserva', () => {
    expect(parseCorsOrigins(' https://a.com , ,https://b.com', 'production', logger)).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('"*" en produccion se descarta con log de error y no aborta', () => {
    expect(parseCorsOrigins('*,https://a.com', 'production', logger)).toEqual(['https://a.com']);
    expect(logger.error).toHaveBeenCalled();
    expect(parseCorsOrigins('*', 'production', logger)).toEqual([]);
  });

  it('"*" fuera de produccion falla el arranque', () => {
    expect(() => parseCorsOrigins('*', 'development', logger)).toThrow('CORS_ORIGINS');
    expect(() => parseCorsOrigins('*', undefined, logger)).toThrow('CORS_ORIGINS');
  });
});
