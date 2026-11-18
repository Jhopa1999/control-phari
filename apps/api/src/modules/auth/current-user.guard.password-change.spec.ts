import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ActorResolver } from './actor-resolver';
import { AllowPasswordChangePending } from './allow-password-change-pending.decorator';
import { PASSWORD_CHANGE_REQUIRED_CODE } from './auth-error-codes';
import { CurrentActor } from './current-actor';
import { CurrentUserGuard, RequestWithActor } from './current-user.guard';

class Handlers {
  normal(): void {}
  @AllowPasswordChangePending()
  allowed(): void {}
}

describe('CurrentUserGuard: cambio de contraseña obligatorio', () => {
  const pending = { identifier: 'p@demo.local', mustChangePassword: true } as unknown as CurrentActor;
  const clear = { identifier: 'c@demo.local', mustChangePassword: false } as unknown as CurrentActor;
  const resolver: ActorResolver = {
    resolve: jest.fn(async (raw: string | undefined) => {
      if (raw === 'Bearer pending' || raw === 'pending') return pending;
      if (raw === 'Bearer clear' || raw === 'clear') return clear;
      return null;
    }),
  };
  const guard = new CurrentUserGuard(resolver);
  const originalMode = process.env.AUTH_MODE;

  function run(req: RequestWithActor, handler: () => void): Promise<boolean> {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
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

    it('marcado por Bearer: 403 con el código en una ruta normal', async () => {
      const err = await run(
        { method: 'GET', headers: { authorization: 'Bearer pending' } },
        Handlers.prototype.normal,
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        code: PASSWORD_CHANGE_REQUIRED_CODE,
      });
    });

    it('marcado por cookie con CSRF: 403 con el código', async () => {
      await expect(
        run(
          { method: 'POST', headers: { cookie: 'portal_session=pending', 'x-portal-csrf': '1' } },
          Handlers.prototype.normal,
        ),
      ).rejects.toMatchObject({ response: { code: PASSWORD_CHANGE_REQUIRED_CODE } });
    });

    it('marcado: deja pasar la ruta con el decorador y adjunta el actor', async () => {
      const req: RequestWithActor = { method: 'GET', headers: { authorization: 'Bearer pending' } };
      await expect(run(req, Handlers.prototype.allowed)).resolves.toBe(true);
      expect(req.actor).toBe(pending);
    });

    it('no marcado: pasa en una ruta normal', async () => {
      await expect(
        run({ method: 'GET', headers: { authorization: 'Bearer clear' } }, Handlers.prototype.normal),
      ).resolves.toBe(true);
    });

    it('cookie sin CSRF en una escritura sigue dando el 403 de CSRF, sin código', async () => {
      const err = await run(
        { method: 'POST', headers: { cookie: 'portal_session=pending' } },
        Handlers.prototype.normal,
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).not.toHaveProperty('code');
    });
  });

  it('modo dev-header: ignora el indicador', async () => {
    process.env.AUTH_MODE = 'dev-header';
    await expect(
      run({ method: 'GET', headers: { 'x-actor-id': 'pending' } }, Handlers.prototype.normal),
    ).resolves.toBe(true);
  });
});
