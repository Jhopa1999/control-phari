import {
  MODULE_MATRIX,
  MODULE_KEYS,
  allowedModulesFor,
} from './module-matrix';
import { RoleCode } from './role-code';
describe('MODULE_MATRIX / allowedModulesFor', () => {
  it('expone exactamente las 27 claves (21 de design 3.3 + systemSettings + areas + processesAdmin + requesters + aiSettings + recurring)', () => {
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
      'systemSettings',
      'areas',
      'processesAdmin',
      'requesters',
      'aiSettings',
      'recurring',
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
  it('systemSettings es SOLO para ADMIN; ningun rol de area lo ve (design f)', () => {
    expect(allowedModulesFor([RoleCode.ADMIN])).toContain('systemSettings');
    for (const role of [
      RoleCode.JEFE_AREA,
      RoleCode.LIDER_PROCESO,
      RoleCode.INTEGRANTE,
    ]) {
      expect(allowedModulesFor([role])).not.toContain('systemSettings');
    }
  });
  it('ADMIN habilita solo modulos de sistema/administracion, no los de negocio', () => {
    // ADMIN es un rol global de administracion: concede systemSettings, areas y
    // processesAdmin; los modulos de negocio salen de los grants por proceso.
    expect(allowedModulesFor([RoleCode.ADMIN])).toEqual([
      'systemSettings',
      'areas',
      'processesAdmin',
      'requesters',
      'aiSettings',
    ]);
  });
  it('areas es SOLO para ADMIN; processesAdmin para ADMIN y JEFE_AREA', () => {
    expect(allowedModulesFor([RoleCode.ADMIN])).toContain('areas');
    expect(allowedModulesFor([RoleCode.JEFE_AREA])).not.toContain('areas');
    expect(allowedModulesFor([RoleCode.ADMIN])).toContain('processesAdmin');
    expect(allowedModulesFor([RoleCode.JEFE_AREA])).toContain('processesAdmin');
    expect(allowedModulesFor([RoleCode.LIDER_PROCESO])).not.toContain(
      'processesAdmin',
    );
  });
  it('coincide con la matriz literal de specs/10 para el INTEGRANTE', () => {
    // Matriz de modulos configurada (columna Integrante) de
    // specs/10-roles-permissions.md: los modulos marcados para integrante.
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
      'recurring',
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
  it('el jefe ve todos los modulos de area (todos MENOS systemSettings, areas y aiSettings)', () => {
    // systemSettings, areas y aiSettings son exclusivos de ADMIN: el jefe de
    // area NO es ADMIN, por lo que ve todos los modulos de la matriz excepto
    // esos tres (processesAdmin SI lo ve, porque gestiona los procesos de su
    // area).
    expect(allowedModulesFor([RoleCode.JEFE_AREA])).toEqual(
      MODULE_KEYS.filter(
        (key) =>
          key !== 'systemSettings' &&
          key !== 'areas' &&
          key !== 'aiSettings',
      ),
    );
  });
  it('ADMIN + JEFE_AREA ven todos los modulos (incluido systemSettings)', () => {
    expect(allowedModulesFor([RoleCode.ADMIN, RoleCode.JEFE_AREA])).toEqual(
      MODULE_KEYS,
    );
  });
  it('sin roles no hay modulos', () => {
    expect(allowedModulesFor([])).toEqual([]);
  });
});
