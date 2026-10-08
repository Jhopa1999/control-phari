import { ConflictException } from '@nestjs/common';
import { assertPlanTransition, PlanStatus } from './plan-status';

describe('assertPlanTransition (design §1.4)', () => {
  it('admite las transiciones implementadas', () => {
    expect(
      assertPlanTransition(PlanStatus.BORRADOR, PlanStatus.EN_AUTORIZACION),
    ).toBe(PlanStatus.EN_AUTORIZACION);
    expect(
      assertPlanTransition(PlanStatus.DEVUELTO, PlanStatus.EN_AUTORIZACION),
    ).toBe(PlanStatus.EN_AUTORIZACION);
    expect(
      assertPlanTransition(PlanStatus.EN_AUTORIZACION, PlanStatus.AUTORIZADO),
    ).toBe(PlanStatus.AUTORIZADO);
    expect(
      assertPlanTransition(PlanStatus.EN_AUTORIZACION, PlanStatus.DEVUELTO),
    ).toBe(PlanStatus.DEVUELTO);
  });

  it('rechaza transiciones no implementadas -> 409', () => {
    expect(() =>
      assertPlanTransition(PlanStatus.BORRADOR, PlanStatus.AUTORIZADO),
    ).toThrow(ConflictException);
    expect(() =>
      assertPlanTransition(PlanStatus.AUTORIZADO, PlanStatus.EN_AUTORIZACION),
    ).toThrow(ConflictException);
    expect(() =>
      assertPlanTransition(PlanStatus.BORRADOR, PlanStatus.DEVUELTO),
    ).toThrow(ConflictException);
  });
});
