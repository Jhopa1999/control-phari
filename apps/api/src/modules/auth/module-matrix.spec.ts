import {
  MODULE_MATRIX,
  MODULE_KEYS,
  allowedModulesFor,
} from './module-matrix';
import { RoleCode } from './role-code';

describe('MODULE_MATRIX / allowedModulesFor', () => {
  it('expone exactamente las 21 claves de design 3.3', () => {
    expect(MODULE_KEYS).toEqual([
      'demandOverview',
      'dashboard',
      'requests',
      'triage',
      'priority',
      'plan',
      'portfolio',
      'project',
      'assigned',
      'task',
      'log',
      'meeting',
      'asset',
      'docs',
      'capacity',
      'admin',
      'frameworks',
      'review',
      'audit',
      'team',
      'permissions',
    ]);
  });

  it('admin y team solo son para JEFE_AREA (specs/10)', () => {
    const integrante = allowedModulesFor([RoleCode.INTEGRANTE]);
    expect(integrante).not.toContain('admin');
    expect(integrante).not.toContain('team');

    const lider = allowedModulesFor([RoleCode.LIDER_PROCESO]);
    expect(lider).not.toContain('admin');
    expect(lider).not.toContain('team');

    const jefe = allowedModulesFor([RoleCode.JEFE_AREA]);
    expect(jefe).toContain('admin');
    expect(jefe).toContain('team');
  });

  it('coincide con la matriz literal de specs/10 para el INTEGRANTE', () => {
    // Matriz de modulos configurada (columna Integrante) de
    // specs/10-roles-permissions.md: los modulos marcados ✓ para integrante.
    const esperadosIntegrante: string[] = [
      'dashboard',
      'requests',
      'portfolio',
      'project',
      'assigned',
      'task',
      'log',
      'meeting',
      'asset',
      'docs',
      'capacity',
      'frameworks',
      'audit',
      'permissions',
    ];
    expect(allowedModulesFor([RoleCode.INTEGRANTE]).sort()).toEqual(
      [...esperadosIntegrante].sort(),
    );
  });

  it('demandOverview NO es para integrante pero si para lider y jefe (specs/10)', () => {
    expect(allowedModulesFor([RoleCode.INTEGRANTE])).not.toContain(
      'demandOverview',
    );
    expect(allowedModulesFor([RoleCode.LIDER_PROCESO])).toContain(
      'demandOverview',
    );
    expect(allowedModulesFor([RoleCode.JEFE_AREA])).toContain('demandOverview');
  });

  it('portfolio y frameworks son para los tres roles (specs/10)', () => {
    for (const role of [
      RoleCode.JEFE_AREA,
      RoleCode.LIDER_PROCESO,
      RoleCode.INTEGRANTE,
    ]) {
      expect(allowedModulesFor([role])).toContain('portfolio');
      expect(allowedModulesFor([role])).toContain('frameworks');
    }
  });

  it('plan NO es para integrante; integrante ejecuta via assigned/task (specs/10)', () => {
    const integrante = allowedModulesFor([RoleCode.INTEGRANTE]);
    expect(integrante).not.toContain('plan');
    expect(integrante).toContain('assigned');
    expect(integrante).toContain('task');
  });

  it('permissions y audit estan disponibles para los tres roles', () => {
    for (const role of [
      RoleCode.JEFE_AREA,
      RoleCode.LIDER_PROCESO,
      RoleCode.INTEGRANTE,
    ]) {
      const modules = allowedModulesFor([role]);
      expect(modules).toContain('permissions');
      expect(modules).toContain('audit');
    }
  });

  it('triage es para jefe y lider, no para integrante', () => {
    expect(allowedModulesFor([RoleCode.LIDER_PROCESO])).toContain('triage');
    expect(allowedModulesFor([RoleCode.INTEGRANTE])).not.toContain('triage');
  });

  it('la union de roles acumula modulos de ambos', () => {
    const combined = allowedModulesFor([
      RoleCode.INTEGRANTE,
      RoleCode.JEFE_AREA,
    ]);
    expect(combined).toContain('admin'); // de jefe
    expect(combined).toContain('requests'); // comun
  });

  it('el jefe ve todos los modulos de la matriz', () => {
    expect(allowedModulesFor([RoleCode.JEFE_AREA])).toEqual(MODULE_KEYS);
  });

  it('sin roles no hay modulos', () => {
    expect(allowedModulesFor([])).toEqual([]);
  });
});
