import { dateToMonthString, monthStringToDate } from './month';

describe('month helpers', () => {
  describe('monthStringToDate', () => {
    it('convierte YYYY-MM al primer dia del mes en UTC', () => {
      const date = monthStringToDate('2025-03');
      expect(date.toISOString()).toBe('2025-03-01T00:00:00.000Z');
    });

    it('mantiene enero (01) como primer dia en UTC', () => {
      expect(monthStringToDate('2025-01').toISOString()).toBe(
        '2025-01-01T00:00:00.000Z',
      );
    });

    it('mantiene diciembre (12) como primer dia en UTC', () => {
      expect(monthStringToDate('2025-12').toISOString()).toBe(
        '2025-12-01T00:00:00.000Z',
      );
    });
  });

  describe('dateToMonthString', () => {
    it('formatea una fecha de columna como YYYY-MM en UTC', () => {
      const date = new Date(Date.UTC(2025, 2, 1));
      expect(dateToMonthString(date)).toBe('2025-03');
    });

    it('rellena el mes con cero a la izquierda', () => {
      const date = new Date(Date.UTC(2025, 0, 1));
      expect(dateToMonthString(date)).toBe('2025-01');
    });
  });

  describe('round-trip', () => {
    it('YYYY-MM -> fecha -> YYYY-MM es idempotente', () => {
      for (const month of ['2024-02', '2025-07', '2030-11']) {
        expect(dateToMonthString(monthStringToDate(month))).toBe(month);
      }
    });
  });
});
