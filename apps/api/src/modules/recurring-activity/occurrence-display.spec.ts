import {
  computeOccurrenceDisplay,
  isWindowOpen,
  OccurrenceDisplayStatus as D,
} from './occurrence-display';

const TZ = 'America/Lima';
const utc = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

const TODAY = utc(2026, 11, 10);

function display(
  status: string,
  targetDate: Date,
  prepDays = 2,
  completedAt: Date | null = null,
) {
  return computeOccurrenceDisplay(
    { status, targetDate, completedAt },
    { prepDays },
    TODAY,
    TZ,
  );
}

describe('isWindowOpen', () => {
  it('abre exactamente en targetDate - prepDays', () => {
    expect(isWindowOpen(utc(2026, 11, 12), 2, utc(2026, 11, 9))).toBe(false);
    expect(isWindowOpen(utc(2026, 11, 12), 2, utc(2026, 11, 10))).toBe(true);
    expect(isWindowOpen(utc(2026, 11, 12), 0, utc(2026, 11, 11))).toBe(false);
  });
});

describe('computeOccurrenceDisplay', () => {
  it('PROGRAMADA: futura antes de abrir ventana, sin acciones y con opensOn', () => {
    const r = display('PENDIENTE', utc(2026, 11, 20), 5);
    expect(r.displayStatus).toBe(D.PROGRAMADA);
    expect(r.canStart).toBe(false);
    expect(r.canComplete).toBe(false);
    expect(iso(r.opensOn)).toBe('2026-11-15');
  });

  it('PENDIENTE: ventana abierta permite tomar y completar', () => {
    const r = display('PENDIENTE', utc(2026, 11, 12), 2);
    expect(r.displayStatus).toBe(D.PENDIENTE);
    expect(r.canStart).toBe(true);
    expect(r.canComplete).toBe(true);
  });

  it('VENCE_HOY: pendiente o en curso con targetDate = hoy', () => {
    expect(display('PENDIENTE', TODAY).displayStatus).toBe(D.VENCE_HOY);
    expect(display('EN_CURSO', TODAY).displayStatus).toBe(D.VENCE_HOY);
  });

  it('EN_CURSO futura se puede completar pero no volver a tomar', () => {
    const r = display('EN_CURSO', utc(2026, 11, 12));
    expect(r.displayStatus).toBe(D.EN_CURSO);
    expect(r.canStart).toBe(false);
    expect(r.canComplete).toBe(true);
  });

  it('VENCIDA derivada: PENDIENTE/EN_CURSO con targetDate pasado; solo completar', () => {
    for (const status of ['PENDIENTE', 'EN_CURSO', 'VENCIDA']) {
      const r = display(status, utc(2026, 11, 9));
      expect(r.displayStatus).toBe(D.VENCIDA);
      expect(r.canStart).toBe(false);
      expect(r.canComplete).toBe(true);
    }
  });

  it('COMPLETADA a tiempo vs COMPLETADA_TARDE por dia local de completedAt', () => {
    // 2026-11-10 02:00Z = 2026-11-09 21:00 en Lima: el dia local es el 9.
    const onTime = display(
      'COMPLETADA',
      utc(2026, 11, 9),
      2,
      new Date('2026-11-10T02:00:00Z'),
    );
    expect(onTime.displayStatus).toBe(D.COMPLETADA);
    // 2026-11-10 06:00Z = 2026-11-10 01:00 en Lima: ya es el dia 10.
    const late = display(
      'COMPLETADA',
      utc(2026, 11, 9),
      2,
      new Date('2026-11-10T06:00:00Z'),
    );
    expect(late.displayStatus).toBe(D.COMPLETADA_TARDE);
    expect(late.canComplete).toBe(false);
  });

  it('CANCELADA no ofrece acciones', () => {
    const r = display('CANCELADA', utc(2026, 11, 12));
    expect(r.displayStatus).toBe(D.CANCELADA);
    expect(r.canStart).toBe(false);
    expect(r.canComplete).toBe(false);
  });
});
