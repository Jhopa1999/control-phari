import { BadRequestException } from '@nestjs/common';
import { assertTaskWithinPhase, assertValidRange } from './date-range';

const d = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const phase = { name: 'Fase 1', startDate: d('2026-01-10'), endDate: d('2026-01-20') };

describe('date-range', () => {
  it('rechaza fin anterior a inicio', () => {
    expect(() => assertValidRange(d('2026-01-10'), d('2026-01-09'), 'fase')).toThrow(
      BadRequestException,
    );
  });

  it('acepta rangos válidos o incompletos', () => {
    expect(() => assertValidRange(d('2026-01-10'), d('2026-01-10'), 'tarea')).not.toThrow();
    expect(() => assertValidRange(null, d('2026-01-10'), 'tarea')).not.toThrow();
  });

  it('rechaza tareas fuera de la fase', () => {
    expect(() =>
      assertTaskWithinPhase({ start: d('2026-01-09'), end: d('2026-01-12') }, phase),
    ).toThrow(BadRequestException);
    expect(() =>
      assertTaskWithinPhase({ start: d('2026-01-12'), end: d('2026-01-21') }, phase),
    ).toThrow(BadRequestException);
  });

  it('acepta tareas dentro de la fase (límites incluidos)', () => {
    expect(() =>
      assertTaskWithinPhase({ start: d('2026-01-10'), end: d('2026-01-20') }, phase),
    ).not.toThrow();
  });
});
