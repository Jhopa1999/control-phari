import { BadRequestException } from '@nestjs/common';
import { applyMilestoneRule } from './milestone';

describe('applyMilestoneRule (design §2.4, BR-010)', () => {
  it('hito con estimateHours > 0 -> 400', () => {
    expect(() =>
      applyMilestoneRule({ isMilestone: true, estimateHours: 5 }),
    ).toThrow(BadRequestException);
  });

  it('hito con dos fechas distintas -> 400', () => {
    expect(() =>
      applyMilestoneRule({
        isMilestone: true,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-02-01T00:00:00.000Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('hito con una sola fecha la copia a ambas y fuerza estimateHours = 0', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const res = applyMilestoneRule({
      isMilestone: true,
      estimateHours: null,
      startDate: start,
      endDate: null,
    });
    expect(res.estimateHours).toBe(0);
    expect(res.startDate).toEqual(start);
    expect(res.endDate).toEqual(start);
  });

  it('hito con endDate solo la copia a startDate', () => {
    const end = new Date('2025-03-01T00:00:00.000Z');
    const res = applyMilestoneRule({
      isMilestone: true,
      startDate: null,
      endDate: end,
    });
    expect(res.startDate).toEqual(end);
    expect(res.endDate).toEqual(end);
  });

  it('hito fuerza estimateHours = 0 cuando llega null', () => {
    const res = applyMilestoneRule({ isMilestone: true });
    expect(res.estimateHours).toBe(0);
    expect(res.startDate).toBeNull();
    expect(res.endDate).toBeNull();
  });

  it('no-hito pasa los valores sin cambios (passthrough)', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-02-01T00:00:00.000Z');
    const res = applyMilestoneRule({
      isMilestone: false,
      estimateHours: 8,
      startDate: start,
      endDate: end,
    });
    expect(res).toEqual({ estimateHours: 8, startDate: start, endDate: end });
  });

  it('no-hito normaliza undefined a null', () => {
    const res = applyMilestoneRule({ isMilestone: false });
    expect(res).toEqual({ estimateHours: null, startDate: null, endDate: null });
  });
});
