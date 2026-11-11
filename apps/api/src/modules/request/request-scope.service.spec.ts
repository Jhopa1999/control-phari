import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { PortfolioScopeService } from '../portfolio/portfolio-scope.service';
import { RequestScopeService, requestScopeWhere } from './request-scope.service';

function actor(overrides: Partial<CurrentActor>): CurrentActor {
  return {
    userId: 'u1',
    name: 'Persona',
    identifier: 'persona@demo.local',
    grants: [],
    roleCodes: new Set(),
    scopedProcessIds: new Set(['p1', 'p2']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
    ...overrides,
  };
}

const jefe = actor({ roleCodes: new Set([RoleCode.JEFE_AREA]), isJefeArea: true });
const lider = actor({
  roleCodes: new Set([RoleCode.LIDER_PROCESO]),
  isLiderProceso: true,
});
const integrante = actor({ roleCodes: new Set([RoleCode.INTEGRANTE]) });
const admin = actor({
  roleCodes: new Set([RoleCode.ADMIN]),
  isAdmin: true,
  scopedProcessIds: new Set(),
});

describe('requestScopeWhere (alcance único de solicitudes)', () => {
  it('jefe y líder ven todas las no eliminadas (con o sin proceso, de cualquier proceso)', () => {
    expect(requestScopeWhere(jefe)).toEqual({ deletedAt: null });
    expect(requestScopeWhere(lider)).toEqual({ deletedAt: null });
  });

  it('integrante ve sus procesos más lo que creó, aunque no tenga proceso', () => {
    expect(requestScopeWhere(integrante)).toEqual({
      deletedAt: null,
      OR: [
        { mainProcessId: { in: ['p1', 'p2'] } },
        { createdByUserId: 'u1' },
      ],
    });
  });

  it('ADMIN no amplía el alcance (sin grants solo ve lo que creó)', () => {
    expect(requestScopeWhere(admin)).toEqual({
      deletedAt: null,
      OR: [{ mainProcessId: { in: [] } }, { createdByUserId: 'u1' }],
    });
  });

  it('el provider y el alcance de Portafolio/Panel devuelven exactamente lo mismo', () => {
    const shared = new RequestScopeService();
    const portfolio = new PortfolioScopeService(shared);
    for (const a of [jefe, lider, integrante, admin]) {
      expect(portfolio.requestScope(a)).toEqual(shared.requestScope(a));
      expect(portfolio.requestScope(a)).toEqual(requestScopeWhere(a));
      expect(portfolio.taskScope(a)).toEqual({
        phase: { plan: { request: requestScopeWhere(a) } },
      });
    }
  });
});
