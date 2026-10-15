import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { RoleCode } from './role-code';
import { CurrentActor } from './current-actor';

function makeActor(roles: RoleCode[]): CurrentActor {
  return {
    userId: 'u1',
    name: 'Actor',
    identifier: 'actor@demo.local',
    grants: [],
    roleCodes: new Set(roles),
    scopedProcessIds: new Set(),
    isJefeArea: roles.includes(RoleCode.JEFE_AREA),
    isAdmin: false,
  };
}

function makeContext(actor: CurrentActor | undefined): ExecutionContext {
  const request = { actor };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(required: RoleCode[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('deja pasar cuando no hay roles declarados', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext(makeActor([])))).toBe(true);
  });

  it('deja pasar cuando el array de roles declarados esta vacio', () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext(makeActor([])))).toBe(true);
  });

  it('permite si el actor tiene uno de los roles requeridos', () => {
    const guard = new RolesGuard(makeReflector([RoleCode.JEFE_AREA]));
    const actor = makeActor([RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO]);
    expect(guard.canActivate(makeContext(actor))).toBe(true);
  });

  it('lanza 403 si el actor no tiene ninguno de los roles requeridos', () => {
    const guard = new RolesGuard(makeReflector([RoleCode.JEFE_AREA]));
    const actor = makeActor([RoleCode.LIDER_PROCESO]);
    expect(() => guard.canActivate(makeContext(actor))).toThrow(
      ForbiddenException,
    );
  });

  it('lanza 403 si no hay actor en el request', () => {
    const guard = new RolesGuard(makeReflector([RoleCode.JEFE_AREA]));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
