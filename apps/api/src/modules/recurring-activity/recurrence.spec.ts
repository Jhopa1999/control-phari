import {
  isRecurrence,
  nextTargetDatesFrom,
  Recurrence,
  toLocalDate,
} from './recurrence';

const LIMA = 'America/Lima';

/** Helper: `Date` a medianoche UTC desde una terna de calendario. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Helper: proyecta un `Date` a "YYYY-MM-DD" en UTC para aserciones legibles. */
function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('isRecurrence', () => {
  it('reconoce las cadencias validas y rechaza basura', () => {
    expect(isRecurrence('SEMANAL')).toBe(true);
    expect(isRecurrence('ANUAL')).toBe(true);
    expect(isRecurrence('DIARIA')).toBe(false);
    expect(isRecurrence('')).toBe(false);
  });
});

describe('toLocalDate (receta canonica D13 / cruce de medianoche UTC)', () => {
  it('un instante que en UTC ya es el dia siguiente resuelve al dia local de Lima (UTC-5)', () => {
    // 2024-03-11T02:00:00Z => en UTC es dia 11, pero en Lima (UTC-5) son las
    // 21:00 del dia 10. El dia local correcto es el 10.
    const instant = new Date('2024-03-11T02:00:00Z');
    expect(toLocalDate(instant, LIMA)).toEqual({ year: 2024, month: 3, day: 10 });
    // El MISMO instante leido en UTC caeria en el dia 11 (lo que queremos evitar).
    expect(instant.getUTCDate()).toBe(11);
  });

  it('un instante de media manana en Lima mantiene el mismo dia', () => {
    const instant = new Date('2024-03-10T15:00:00Z'); // 10:00 en Lima
    expect(toLocalDate(instant, LIMA)).toEqual({ year: 2024, month: 3, day: 10 });
  });
});

describe('nextTargetDatesFrom - SEMANAL', () => {
  it('cada semana conserva el mismo dia de semana que startDate', () => {
    // 2024-01-01 es lunes.
    const start = utc(2024, 1, 1);
    const result = nextTargetDatesFrom(
      Recurrence.SEMANAL,
      1,
      start,
      utc(2024, 1, 1),
      utc(2024, 1, 31),
    );
    expect(result.map(iso)).toEqual([
      '2024-01-01',
      '2024-01-08',
      '2024-01-15',
      '2024-01-22',
      '2024-01-29',
    ]);
    // Todas caen en lunes (getUTCDay() === 1).
    for (const d of result) {
      expect(d.getUTCDay()).toBe(1);
    }
  });

  it('respeta intervalCount (cada 2 semanas)', () => {
    const start = utc(2024, 1, 1);
    const result = nextTargetDatesFrom(
      Recurrence.SEMANAL,
      2,
      start,
      utc(2024, 1, 1),
      utc(2024, 2, 29),
    );
    expect(result.map(iso)).toEqual([
      '2024-01-01',
      '2024-01-15',
      '2024-01-29',
      '2024-02-12',
      '2024-02-26',
    ]);
  });

  it('excluye fechas fuera de la ventana [from, to]', () => {
    const start = utc(2024, 1, 1);
    const result = nextTargetDatesFrom(
      Recurrence.SEMANAL,
      1,
      start,
      utc(2024, 1, 10),
      utc(2024, 1, 20),
    );
    expect(result.map(iso)).toEqual(['2024-01-15']);
  });
});

describe('nextTargetDatesFrom - MENSUAL y bordes de fin de mes', () => {
  it('ancla el dia 31 al ultimo dia del mes cuando no existe', () => {
    // startDate dia 31: enero(31) -> febrero(29 bisiesto) -> marzo(31) -> abril(30).
    const start = utc(2024, 1, 31);
    const result = nextTargetDatesFrom(
      Recurrence.MENSUAL,
      1,
      start,
      utc(2024, 1, 1),
      utc(2024, 4, 30),
    );
    expect(result.map(iso)).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
    ]);
  });

  it('febrero no bisiesto ancla el 31 al 28', () => {
    const start = utc(2023, 1, 31);
    const result = nextTargetDatesFrom(
      Recurrence.MENSUAL,
      1,
      start,
      utc(2023, 2, 1),
      utc(2023, 2, 28),
    );
    expect(result.map(iso)).toEqual(['2023-02-28']);
  });

  it('respeta intervalCount mensual (cada 2 meses)', () => {
    const start = utc(2024, 1, 15);
    const result = nextTargetDatesFrom(
      Recurrence.MENSUAL,
      2,
      start,
      utc(2024, 1, 1),
      utc(2024, 7, 31),
    );
    expect(result.map(iso)).toEqual([
      '2024-01-15',
      '2024-03-15',
      '2024-05-15',
      '2024-07-15',
    ]);
  });
});

describe('nextTargetDatesFrom - TRIMESTRAL / SEMESTRAL / ANUAL (cambio de mes/semestre/ano)', () => {
  it('TRIMESTRAL avanza +3 meses', () => {
    const start = utc(2024, 1, 10);
    const result = nextTargetDatesFrom(
      Recurrence.TRIMESTRAL,
      1,
      start,
      utc(2024, 1, 1),
      utc(2024, 12, 31),
    );
    expect(result.map(iso)).toEqual([
      '2024-01-10',
      '2024-04-10',
      '2024-07-10',
      '2024-10-10',
    ]);
  });

  it('SEMESTRAL avanza +6 meses y cruza de ano', () => {
    const start = utc(2024, 3, 20);
    const result = nextTargetDatesFrom(
      Recurrence.SEMESTRAL,
      1,
      start,
      utc(2024, 3, 1),
      utc(2025, 3, 31),
    );
    expect(result.map(iso)).toEqual([
      '2024-03-20',
      '2024-09-20',
      '2025-03-20',
    ]);
  });

  it('ANUAL del 29 de febrero bisiesto ancla al 28 en anos no bisiestos', () => {
    const start = utc(2024, 2, 29);
    const result = nextTargetDatesFrom(
      Recurrence.ANUAL,
      1,
      start,
      utc(2024, 1, 1),
      utc(2026, 12, 31),
    );
    expect(result.map(iso)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
    ]);
  });
});

describe('nextTargetDatesFrom - casos borde de ventana e intervalCount invalido', () => {
  it('ventana invertida (to < from) devuelve vacio', () => {
    const start = utc(2024, 1, 1);
    const result = nextTargetDatesFrom(
      Recurrence.SEMANAL,
      1,
      start,
      utc(2024, 2, 1),
      utc(2024, 1, 1),
    );
    expect(result).toEqual([]);
  });

  it('intervalCount < 1 lanza error', () => {
    const start = utc(2024, 1, 1);
    expect(() =>
      nextTargetDatesFrom(
        Recurrence.MENSUAL,
        0,
        start,
        utc(2024, 1, 1),
        utc(2024, 12, 31),
      ),
    ).toThrow();
  });
});
