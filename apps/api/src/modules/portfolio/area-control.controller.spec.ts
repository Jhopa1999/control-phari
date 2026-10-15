import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RolesGuard } from '../auth/roles.guard';
import { AreaControlController } from './area-control.controller';
import { PortfolioController } from './portfolio.controller';

function actor(roles: RoleCode[]): CurrentActor {
  return {
    userId: 'u',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set(roles),
    scopedProcessIds: new Set(),
    isJefeArea: roles.includes(RoleCode.JEFE_AREA),
    isAdmin: false,
  };
}

function contextFor(
  handler: (...args: never[]) => unknown,
  controllerClass: new (...args: never[]) => unknown,
  current: CurrentActor,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({
      getRequest: () => ({ actor: current }),
    }),
  } as unknown as ExecutionContext;
}

describe('AreaControl / Portfolio guards (RolesGuard por ruta)', () => {
  const guard = new RolesGuard(new Reflector());

  describe('GET /area-control/indicators (@Roles jefe/lider)', () => {
    const handler = AreaControlController.prototype.indicators;

    it('integrante -> 403 (frontera por rol en el guard de ruta)', () => {
      const ctx = contextFor(
        handler,
        AreaControlController,
        actor([RoleCode.INTEGRANTE]),
      );
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('jefe -> permitido', () => {
      const ctx = contextFor(
        handler,
        AreaControlController,
        actor([RoleCode.JEFE_AREA]),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('lider -> permitido', () => {
      const ctx = contextFor(
        handler,
        AreaControlController,
        actor([RoleCode.LIDER_PROCESO]),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('GET /area-control/demand-summary (@Roles 3 roles)', () => {
    const handler = AreaControlController.prototype.demandSummary;

    it('integrante -> permitido (panorama es de los 3 roles)', () => {
      const ctx = contextFor(
        handler,
        AreaControlController,
        actor([RoleCode.INTEGRANTE]),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('GET /portfolio (@Roles 3 roles)', () => {
    const handler = PortfolioController.prototype.list;

    it('integrante -> permitido (alcance en el where)', () => {
      const ctx = contextFor(
        handler,
        PortfolioController,
        actor([RoleCode.INTEGRANTE]),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
