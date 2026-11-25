import 'reflect-metadata';
import { AreaController } from '../area/area.controller';
import { CatalogController } from '../catalog/catalog.controller';
import { ClosureController } from '../closure/closure.controller';
import { WorklogController } from '../coordination/worklog/worklog.controller';
import { GateCheckController } from '../governance/gate-check/gate-check.controller';
import { AssetController } from '../knowledge/asset/asset.controller';
import { DocumentController } from '../knowledge/document/document.controller';
import { PlanController } from '../plan/plan.controller';
import { TaskController } from '../plan/task/task.controller';
import { ApprovalController } from '../request/approval/approval.controller';
import { PriorityController } from '../request/priority/priority.controller';
import { SmtpConfigController } from '../system-settings/smtp-config.controller';
import { UserInviteController } from '../user/user-invite.controller';
import {
  CAPABILITY_CATALOG,
  CapabilityKey,
  capabilitiesFor,
} from './capability-matrix';
import { ROLES_KEY } from './roles.decorator';
import { RoleCode } from './role-code';

const CONTROLLERS: Record<string, { prototype: object }> = {
  AreaController,
  CatalogController,
  ClosureController,
  WorklogController,
  GateCheckController,
  AssetController,
  DocumentController,
  PlanController,
  TaskController,
  ApprovalController,
  PriorityController,
  SmtpConfigController,
  UserInviteController,
};

function rolesOf(controller: string, handler: string): RoleCode[] {
  const ctor = CONTROLLERS[controller] as unknown as { prototype: Record<string, unknown> };
  const method = ctor.prototype[handler] as object;
  const own = Reflect.getMetadata(ROLES_KEY, method) as RoleCode[] | undefined;
  const fromClass = Reflect.getMetadata(ROLES_KEY, ctor) as RoleCode[] | undefined;
  return own ?? fromClass ?? [];
}

function allowedKeys(roles: RoleCode[]): string[] {
  return capabilitiesFor(roles)
    .filter((c) => c.allowed)
    .map((c) => c.key);
}

describe('capability-matrix', () => {
  it('cada capacidad respalda su lista de roles en el @Roles real de los controladores', () => {
    for (const def of CAPABILITY_CATALOG) {
      for (const { controller, handler } of def.enforcedBy ?? []) {
        expect(CONTROLLERS[controller]).toBeDefined();
        const actual = new Set(rolesOf(controller, handler));
        expect({ key: def.key, controller, handler, roles: [...actual].sort() }).toEqual({
          key: def.key,
          controller,
          handler,
          roles: [...def.roles].sort(),
        });
      }
    }
  });

  it('las claves son únicas y el orden es estable', () => {
    const keys = CAPABILITY_CATALOG.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(capabilitiesFor([]).map((c) => c.key));
    expect(Object.values(CapabilityKey).sort()).toEqual([...keys].sort());
  });

  it('un actor sin roles no puede hacer nada y ve quién sí', () => {
    const all = capabilitiesFor([]);
    expect(all.every((c) => !c.allowed)).toBe(true);
    expect(all.every((c) => c.allowedRoles.length > 0)).toBe(true);
    expect(all.find((c) => c.key === CapabilityKey.REQUEST_TRIAGE)?.allowedRoles).toEqual([
      { code: RoleCode.JEFE_AREA, name: 'Jefe de área' },
      { code: RoleCode.LIDER_PROCESO, name: 'Líder de proceso' },
    ]);
  });

  it('el integrante registra solicitudes y ejecuta tareas, pero no decide triage ni aprueba', () => {
    const keys = allowedKeys([RoleCode.INTEGRANTE]);
    expect(keys).toEqual(
      expect.arrayContaining(['request.create', 'task.execute', 'log.record']),
    );
    expect(keys).not.toContain('request.triage');
    expect(keys).not.toContain('request.approve');
    expect(keys).not.toContain('task.review');
  });

  it('el líder decide triage y revisa tareas, pero no aprueba cierres', () => {
    const keys = allowedKeys([RoleCode.LIDER_PROCESO]);
    expect(keys).toEqual(expect.arrayContaining(['request.triage', 'task.review', 'plan.manage']));
    expect(keys).not.toContain('closure.approve');
    expect(keys).not.toContain('asset.manage');
  });

  it('el jefe puede todo salvo la configuración del sistema', () => {
    const keys = allowedKeys([RoleCode.JEFE_AREA]);
    expect(keys).toContain('closure.approve');
    expect(keys).toContain('admin.structure');
    expect(keys).not.toContain('system.settings');
  });

  it('el administrador solo configura el sistema y la estructura', () => {
    expect(allowedKeys([RoleCode.ADMIN])).toEqual(['admin.structure', 'system.settings']);
  });

  it('jefe y administrador suman sus capacidades', () => {
    const keys = allowedKeys([RoleCode.JEFE_AREA, RoleCode.ADMIN]);
    expect(keys).toContain('system.settings');
    expect(keys).toContain('closure.approve');
  });

  it('ignora roles desconocidos', () => {
    expect(allowedKeys(['OTRO' as RoleCode])).toEqual([]);
  });
});
