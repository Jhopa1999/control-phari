import { BadRequestException } from '@nestjs/common';
import { dateToIsoDate, resolvePeriod } from './period';

describe('resolvePeriod', () => {
  it('default = mes natural en curso UTC [primer dia, primer dia mes siguiente)', () => {
    const now = new Date('2025-03-10T12:34:56.000Z');
    const { from, to } = resolvePeriod(undefined, undefined, now);
    expect(from.toISOString()).toBe('2025-03-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2025-04-01T00:00:00.000Z');
  });

  it('default en diciembre -> to es el 1 de enero del ano siguiente', () => {
    const now = new Date('2025-12-15T00:00:00.000Z');
    const { from, to } = resolvePeriod(undefined, undefined, now);
    expect(from.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('from/to explicitos se interpretan en UTC 00:00:00.000Z', () => {
    const { from, to } = resolvePeriod('2025-01-15', '2025-02-20');
    expect(from.toISOString()).toBe('2025-01-15T00:00:00.000Z');
    expect(to.toISOString()).toBe('2025-02-20T00:00:00.000Z');
  });

  it('from > to -> BadRequestException', () => {
    expect(() => resolvePeriod('2025-05-10', '2025-05-01')).toThrow(
      BadRequestException,
    );
  });

  it('from === to es valido (rango vacio semiabierto)', () => {
    expect(() => resolvePeriod('2025-05-01', '2025-05-01')).not.toThrow();
  });

  it('formato invalido -> BadRequestException', () => {
    expect(() => resolvePeriod('2025-5-1', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => resolvePeriod(undefined, '20250501')).toThrow(
      BadRequestException,
    );
  });

  it('fecha irreal (2025-02-31) -> BadRequestException', () => {
    expect(() => resolvePeriod('2025-02-31', undefined)).toThrow(
      BadRequestException,
    );
  });
});

describe('dateToIsoDate', () => {
  it('formatea YYYY-MM-DD en UTC', () => {
    expect(dateToIsoDate(new Date('2025-03-01T00:00:00.000Z'))).toBe(
      '2025-03-01',
    );
    expect(dateToIsoDate(new Date('2025-12-09T00:00:00.000Z'))).toBe(
      '2025-12-09',
    );
  });
});
