import { daysBetween, median, percentage } from './indicators';

describe('indicators (formulas puras)', () => {
  describe('median', () => {
    it('muestra vacia -> null', () => {
      expect(median([])).toBeNull();
    });

    it('impar -> valor central (ordena asc)', () => {
      expect(median([3, 1, 2])).toBe(2);
      expect(median([10])).toBe(10);
    });

    it('par -> Math.round del promedio de los dos centrales', () => {
      // [1,2,3,4] -> (2+3)/2 = 2.5 -> round -> 3
      expect(median([4, 1, 3, 2])).toBe(3);
      // [1,2,2,3] -> (2+2)/2 = 2
      expect(median([3, 2, 2, 1])).toBe(2);
    });

    it('no muta el arreglo de entrada', () => {
      const input = [3, 1, 2];
      median(input);
      expect(input).toEqual([3, 1, 2]);
    });
  });

  describe('percentage', () => {
    it('den=0 -> applicable:false value null (nunca 0)', () => {
      expect(percentage(0, 0)).toEqual({ applicable: false, value: null });
      expect(percentage(5, 0)).toEqual({ applicable: false, value: null });
    });

    it('redondea round(num/den*100)', () => {
      expect(percentage(1, 3)).toEqual({ applicable: true, value: 33 });
      expect(percentage(2, 3)).toEqual({ applicable: true, value: 67 });
      expect(percentage(3, 4)).toEqual({ applicable: true, value: 75 });
      expect(percentage(0, 4)).toEqual({ applicable: true, value: 0 });
    });
  });

  describe('daysBetween', () => {
    it('floor((b-a)/86_400_000)', () => {
      const a = new Date('2025-03-01T00:00:00.000Z');
      const b = new Date('2025-03-05T00:00:00.000Z');
      expect(daysBetween(a, b)).toBe(4);
    });

    it('fraccion de dia -> floor', () => {
      const a = new Date('2025-03-01T00:00:00.000Z');
      const b = new Date('2025-03-02T23:00:00.000Z');
      expect(daysBetween(a, b)).toBe(1);
    });

    it('negativo cuando b < a (no se fuerza a 0)', () => {
      const a = new Date('2025-03-05T00:00:00.000Z');
      const b = new Date('2025-03-01T00:00:00.000Z');
      expect(daysBetween(a, b)).toBe(-4);
    });
  });
});
