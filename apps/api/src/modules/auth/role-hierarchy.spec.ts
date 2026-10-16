import { CurrentActor } from './current-actor';
import { RoleCode } from './role-code';
import { ROLE_RANK, actorMaxRank, canAssignRole } from './role-hierarchy';

function actorWith(...codes: RoleCode[]): CurrentActor {
  return {
    userId: 'u',
    name: 'Actor',
    identifier: 'actor@demo.local',
    grants: [],
    roleCodes: new Set(codes),
    scopedProcessIds: new Set(),
    isJefeArea: codes.includes(RoleCode.JEFE_AREA),
    isAdmin: codes.includes(RoleCode.ADMIN),
  };
}

const ROLES: RoleCode[] = [
  RoleCode.ADMIN,
  RoleCode.JEFE_AREA,
  RoleCode.LIDER_PROCESO,
  RoleCode.INTEGRANTE,
];

// Tabla de verdad 4x4: canAssignRole(actor con rol de fila, rol de columna).
// true solo cuando el rango de la fila es ESTRICTAMENTE mayor al de la columna.
const TRUTH_TABLE: Record<RoleCode, Record<RoleCode, boolean>> = {
  [RoleCode.ADMIN]: {
    [RoleCode.ADMIN]: false,
    [RoleCode.JEFE_AREA]: true,
    [RoleCode.LIDER_PROCESO]: true,
    [RoleCode.INTEGRANTE]: true,
  },
  [RoleCode.JEFE_AREA]: {
    [RoleCode.ADMIN]: false,
    [RoleCode.JEFE_AREA]: false,
    [RoleCode.LIDER_PROCESO]: true,
    [RoleCode.INTEGRANTE]: true,
  },
  [RoleCode.LIDER_PROCESO]: {
    [RoleCode.ADMIN]: false,
    [RoleCode.JEFE_AREA]: false,
    [RoleCode.LIDER_PROCESO]: false,
    [RoleCode.INTEGRANTE]: true,
  },
  [RoleCode.INTEGRANTE]: {
    [RoleCode.ADMIN]: false,
    [RoleCode.JEFE_AREA]: false,
    [RoleCode.LIDER_PROCESO]: false,
    [RoleCode.INTEGRANTE]: false,
  },
};

describe('role-hierarchy', () => {
  describe('actorMaxRank', () => {
    it('es 0 cuando el actor no tiene roles', () => {
      expect(actorMaxRank(actorWith())).toBe(0);
    });

    it('toma el rango maximo sobre varios roles', () => {
      expect(
        actorMaxRank(actorWith(RoleCode.INTEGRANTE, RoleCode.JEFE_AREA)),
      ).toBe(ROLE_RANK[RoleCode.JEFE_AREA]);
    });
  });

  describe('canAssignRole (tabla de verdad 4x4)', () => {
    for (const actorRole of ROLES) {
      for (const target of ROLES) {
        const expected = TRUTH_TABLE[actorRole][target];
        it(`${actorRole} -> ${target} = ${expected}`, () => {
          expect(canAssignRole(actorWith(actorRole), target)).toBe(expected);
        });
      }
    }

    it('ADMIN -> ADMIN = false (nadie asigna su propio nivel)', () => {
      expect(canAssignRole(actorWith(RoleCode.ADMIN), RoleCode.ADMIN)).toBe(
        false,
      );
    });

    it('un actor sin roles no puede asignar nada', () => {
      for (const target of ROLES) {
        expect(canAssignRole(actorWith(), target)).toBe(false);
      }
    });
  });
});
