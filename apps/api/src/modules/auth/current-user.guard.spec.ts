import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ActorResolver } from './actor-resolver';
import { CurrentActor } from './current-actor';
import { CurrentUserGuard, RequestWithActor } from './current-user.guard';

describe('CurrentUserGuard (cookie, Bearer y dev-header)', () => {
  const actor = { identifier: 'u@demo.local' } as unknown as CurrentActor;
  const resolver: ActorResolver = {
    resolve: jest.fn(async (raw: string | undefined) =>
      raw === 'Bearer good' || raw === 'dev-user' ? actor : null,
    ),
  };
  const guard = new CurrentUserGuard(resolver);
  const originalMode = process.env.AUTH_MODE;

  function run(req: RequestWithActor): Promise<boolean> {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return guard.canActivate(ctx);
  }

  afterEach(() => {
    if (originalMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalMode;
  });

  describe('modo jwt', () => {
    beforeEach(() => {
      process.env.AUTH_MODE = 'jwt';
    });

    it('acepta Bearer sin CSRF en una escritura', async () => {
      const req: RequestWithActor = {
        method: 'POST',
        headers: { authorization: 'Bearer good' },
      };
      await expect(run(req)).resolves.toBe(true);
      expect(req.authSource).toBe('bearer');
      expect(req.bearer).toBe('Bearer good');
    });

    it('acepta la cookie en un GET sin CSRF', async () => {
      const req: RequestWithActor = {
        method: 'GET',
        headers: { cookie: 'portal_session=good' },
      };
      await expect(run(req)).resolves.toBe(true);
      expect(req.authSource).toBe('cookie');
      expect(req.bearer).toBe('Bearer good');
    });

    it('rechaza con 403 una escritura por cookie sin CSRF', async () => {
      const req: RequestWithActor = {
        method: 'POST',
        headers: { cookie: 'portal_session=good' },
      };
      await expect(run(req)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('acepta una escritura por cookie con CSRF', async () => {
      const req: RequestWithActor = {
        method: 'DELETE',
        headers: { cookie: 'portal_session=good', 'x-portal-csrf': '1' },
      };
      await expect(run(req)).resolves.toBe(true);
    });

    it('rechaza sin credenciales', async () => {
      await expect(run({ method: 'GET', headers: {} })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza cookie invalida o malformada con 401 (nunca 500)', async () => {
      for (const cookie of ['portal_session=mala', 'portal_session=%E0%A4%A']) {
        await expect(
          run({ method: 'GET', headers: { cookie } }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
    });

    it('un Bearer invalido no cae a la cookie valida', async () => {
      await expect(
        run({
          method: 'GET',
          headers: { authorization: 'Bearer mala', cookie: 'portal_session=good' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('modo dev-header', () => {
    it('usa X-Actor-Id e ignora la cookie', async () => {
      process.env.AUTH_MODE = 'dev-header';
      const ok: RequestWithActor = {
        method: 'POST',
        headers: { 'x-actor-id': 'dev-user' },
      };
      await expect(run(ok)).resolves.toBe(true);
      expect(ok.authSource).toBe('dev-header');
      expect(ok.bearer).toBeUndefined();
      await expect(
        run({ method: 'GET', headers: { cookie: 'portal_session=good' } }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('sin AUTH_MODE se comporta como dev-header', async () => {
      delete process.env.AUTH_MODE;
      await expect(
        run({ method: 'POST', headers: { 'x-actor-id': 'dev-user' } }),
      ).resolves.toBe(true);
    });
  });
});
