import { BadRequestException } from '@nestjs/common';
import {
  addDaysUTC,
  dateStringToDate,
  dateToString,
  mondayOf,
} from './date';

describe('coordination date helpers', () => {
  describe('dateStringToDate', () => {
    it('convierte YYYY-MM-DD al dia en UTC', () => {
      expect(dateStringToDate('2025-02-10').toISOString()).toBe(
        '2025-02-10T00:00:00.000Z',
      );
    });

    it('mantiene el primer dia del anio en UTC', () => {
      expect(dateStringToDate('2025-01-01').toISOString()).toBe(
        '2025-01-01T00:00:00.000Z',
      );
    });

    it('rechaza mes fuera de rango (2025-13-40) -> 400', () => {
      expect(() => dateStringToDate('2025-13-40')).toThrow(
        BadRequestException,
      );
    });

    it('rechaza 30 de febrero (2025-02-30) -> 400', () => {
      expect(() => dateStringToDate('2025-02-30')).toThrow(
        BadRequestException,
      );
    });

    it('rechaza dia 00 (2025-00-10) -> 400', () => {
      expect(() => dateStringToDate('2025-00-10')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('dateToString', () => {
    it('formatea una fecha de columna como YYYY-MM-DD en UTC', () => {
      const date = new Date(Date.UTC(2025, 1, 10));
      expect(dateToString(date)).toBe('2025-02-10');
    });

    it('rellena mes y dia con cero a la izquierda', () => {
      const date = new Date(Date.UTC(2025, 0, 3));
      expect(dateToString(date)).toBe('2025-01-03');
    });
  });

  describe('round-trip', () => {
    it('YYYY-MM-DD -> fecha -> YYYY-MM-DD es idempotente', () => {
      for (const value of ['2024-02-29', '2025-07-15', '2030-11-01']) {
        expect(dateToString(dateStringToDate(value))).toBe(value);
      }
    });
  });

  describe('addDaysUTC', () => {
    it('suma dias en UTC sin arrastrar zona', () => {
      const base = dateStringToDate('2025-03-10');
      expect(dateToString(addDaysUTC(base, 6))).toBe('2025-03-16');
    });

    it('resta dias (n negativo)', () => {
      const base = dateStringToDate('2025-03-10');
      expect(dateToString(addDaysUTC(base, -3))).toBe('2025-03-07');
    });
  });

  describe('mondayOf', () => {
    it('normaliza un miercoles al lunes de su semana', () => {
      // 2025-03-12 es miercoles -> lunes 2025-03-10.
      expect(dateToString(mondayOf(dateStringToDate('2025-03-12')))).toBe(
        '2025-03-10',
      );
    });

    it('un lunes queda igual', () => {
      expect(dateToString(mondayOf(dateStringToDate('2025-03-10')))).toBe(
        '2025-03-10',
      );
    });

    it('un domingo pertenece a la semana que empieza el lunes anterior', () => {
      // 2025-03-16 es domingo -> lunes 2025-03-10.
      expect(dateToString(mondayOf(dateStringToDate('2025-03-16')))).toBe(
        '2025-03-10',
      );
    });
  });
});
