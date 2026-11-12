import {
  computeDueAlert,
  computeProgressPercent,
  computeSchedule,
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

describe('computeSchedule', () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('sin plan autorizado mide contra la fecha objetivo', () => {
    expect(
      computeSchedule({
        targetDate: d('2026-11-10'),
        planAuthorized: false,
        baselineDate: d('2026-11-30'),
        forecastDate: d('2026-11-30'),
      }),
    ).toEqual({
      referenceDate: d('2026-11-10'),
      referenceSource: 'SOLICITUD',
      forecastDate: d('2026-11-30'),
      requestedGapDays: null,
      scheduleVarianceDays: null,
    });
  });

  it('con plan autorizado mide contra la línea base e informa la brecha con lo solicitado', () => {
    const schedule = computeSchedule({
      targetDate: d('2026-11-10'),
      planAuthorized: true,
      baselineDate: d('2026-11-30'),
      forecastDate: d('2026-12-05'),
    });
    expect(schedule.referenceDate).toEqual(d('2026-11-30'));
    expect(schedule.referenceSource).toBe('PLAN');
    expect(schedule.requestedGapDays).toBe(20);
    expect(schedule.scheduleVarianceDays).toBe(5);
  });

  it('caso del portafolio: objetivo 10 nov, plan 15-30 nov, hoy 20 nov -> no vencido', () => {
    const today = new Date('2026-11-20T15:00:00.000Z');
    const schedule = computeSchedule({
      targetDate: d('2026-11-10'),
      planAuthorized: true,
      baselineDate: d('2026-11-30'),
      forecastDate: d('2026-11-30'),
    });
    expect(computeDueAlert(schedule.referenceDate, 'EN_EJECUCION', today, 7)).toEqual({
      dueStatus: 'EN_TIEMPO',
      daysToTarget: 10,
    });
    expect(schedule.scheduleVarianceDays).toBe(0);
    // Pasado el compromiso, ahora sí vence.
    const late = new Date('2026-12-02T15:00:00.000Z');
    expect(computeDueAlert(schedule.referenceDate, 'EN_EJECUCION', late, 7)).toEqual({
      dueStatus: 'VENCIDO',
      daysToTarget: -2,
    });
  });

  it('plan autorizado sin línea base cae a la fecha objetivo', () => {
    const schedule = computeSchedule({
      targetDate: d('2026-11-10'),
      planAuthorized: true,
      baselineDate: null,
      forecastDate: null,
    });
    expect(schedule.referenceSource).toBe('SOLICITUD');
    expect(schedule.referenceDate).toEqual(d('2026-11-10'));
  });

  it('sin ninguna fecha -> NINGUNA', () => {
    expect(
      computeSchedule({
        targetDate: null,
        planAuthorized: false,
        baselineDate: null,
        forecastDate: null,
      }),
    ).toMatchObject({ referenceDate: null, referenceSource: 'NINGUNA' });
  });
});
