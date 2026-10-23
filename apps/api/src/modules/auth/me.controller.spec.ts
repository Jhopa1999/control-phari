import { MeController } from './me.controller';
import { CurrentActor } from './current-actor';
import { RoleCode } from './role-code';
import { allowedModulesFor } from './module-matrix';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'Beto',
    identifier: 'u@demo.local',
    grants: [
      {
        processId: 'p1',
        processCode: 'PROC',
        processName: 'Proceso',
        roleCode: RoleCode.LIDER_PROCESO,
        roleName: 'Lider',
      },
    ],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isAdmin: false,
  };
}

describe('MeController (delegacion)', () => {
  const controller = new MeController();

  it('getPermissions proyecta el actor a su DTO de permisos', () => {
    const a = actor();
    const result = controller.getPermissions(a);

    expect(result).toEqual({
      userId: 'u1',
      name: 'Beto',
      identifier: 'u@demo.local',
      grants: [
        {
          processId: 'p1',
          processCode: 'PROC',
          processName: 'Proceso',
          roleCode: RoleCode.LIDER_PROCESO,
          roleName: 'Lider',
        },
      ],
      allowedModules: allowedModulesFor(a.roleCodes),
      roleCodes: [RoleCode.LIDER_PROCESO],
    });
  });
});
