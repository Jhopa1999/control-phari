import {
  computeDueAlert,
  computeProgressPercent,
  dueSoonDaysFromEnv,
} from './progress';

const TODAY = new Date('2026-10-29T15:00:00.000Z');

describe('computeProgressPercent', () => {
  it('sin tareas -> null', () => {
    expect(computeProgressPercent([])).toBeNull();
  });

  it('promedia el avance y cuenta TERMINADA como 100', () => {
    expect(
      computeProgressPercent([
        { status: 'TERMINADA', progress: 0 },
        { status: 'EN_CURSO', progress: 50 },
        { status: 'POR_HACER', progress: 0 },
        { status: 'POR_HACER', progress: 0 },
      ]),
    ).toBe(38);
  });
});

describe('computeDueAlert', () => {
  it('estados cerrados no generan alerta', () => {
    expect(computeDueAlert(new Date('2020-01-01'), 'CERRADA', TODAY, 7).dueStatus).toBe(
      'NO_APLICA',
    );
  });

  it('sin fecha objetivo -> SIN_FECHA', () => {
    expect(computeDueAlert(null, 'EN_EJECUCION', TODAY, 7).dueStatus).toBe('SIN_FECHA');
  });

  it('fecha pasada -> VENCIDO con dias negativos', () => {
    expect(computeDueAlert(new Date('2026-10-28'), 'EN_EJECUCION', TODAY, 7)).toEqual({
      dueStatus: 'VENCIDO',
      daysToTarget: -1,
    });
  });

  it('hoy y dentro del umbral -> PROXIMO_A_VENCER', () => {
    expect(computeDueAlert(new Date('2026-10-29'), 'EN_EJECUCION', TODAY, 7).dueStatus).toBe(
      'PROXIMO_A_VENCER',
    );
    expect(computeDueAlert(new Date('2026-11-05'), 'EN_EJECUCION', TODAY, 7).dueStatus).toBe(
      'PROXIMO_A_VENCER',
    );
  });

  it('mas alla del umbral -> EN_TIEMPO', () => {
    expect(computeDueAlert(new Date('2026-11-06'), 'EN_EJECUCION', TODAY, 7).dueStatus).toBe(
      'EN_TIEMPO',
    );
  });
});

describe('dueSoonDaysFromEnv', () => {
  it('usa el valor valido o el default', () => {
    expect(dueSoonDaysFromEnv('14')).toBe(14);
    expect(dueSoonDaysFromEnv(undefined)).toBe(7);
    expect(dueSoonDaysFromEnv('abc')).toBe(7);
    expect(dueSoonDaysFromEnv('-3')).toBe(7);
  });
});
