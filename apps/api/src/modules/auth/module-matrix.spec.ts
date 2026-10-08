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

  it('admin, team y frameworks solo son para JEFE_AREA', () => {
    const integrante = allowedModulesFor([RoleCode.INTEGRANTE]);
    expect(integrante).not.toContain('admin');
    expect(integrante).not.toContain('team');
    expect(integrante).not.toContain('frameworks');

    const jefe = allowedModulesFor([RoleCode.JEFE_AREA]);
    expect(jefe).toContain('admin');
    expect(jefe).toContain('team');
    expect(jefe).toContain('frameworks');
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
