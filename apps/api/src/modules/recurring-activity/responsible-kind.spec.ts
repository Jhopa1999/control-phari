import {
  isResponsibleAssignmentValid,
  isResponsibleKind,
  ResponsibleKind,
} from './responsible-kind';

describe('isResponsibleKind', () => {
  it('reconoce tipos validos y rechaza basura', () => {
    expect(isResponsibleKind('USER')).toBe(true);
    expect(isResponsibleKind('AREA')).toBe(true);
    expect(isResponsibleKind('GROUP')).toBe(false);
  });
});

describe('isResponsibleAssignmentValid (exactamente un responsable)', () => {
  it('USER con solo userId es valido', () => {
    expect(
      isResponsibleAssignmentValid(ResponsibleKind.USER, 'u1', null),
    ).toBe(true);
  });

  it('AREA con solo areaId es valido', () => {
    expect(
      isResponsibleAssignmentValid(ResponsibleKind.AREA, null, 'a1'),
    ).toBe(true);
  });

  it('USER sin userId es invalido', () => {
    expect(
      isResponsibleAssignmentValid(ResponsibleKind.USER, null, null),
    ).toBe(false);
  });

  it('AREA sin areaId es invalido', () => {
    expect(
      isResponsibleAssignmentValid(ResponsibleKind.AREA, null, null),
    ).toBe(false);
  });

  it('USER con ambos ids es invalido (no exactamente uno)', () => {
    expect(
      isResponsibleAssignmentValid(ResponsibleKind.USER, 'u1', 'a1'),
    ).toBe(false);
  });

  it('AREA con ambos ids es invalido (no exactamente uno)', () => {
    expect(
      isResponsibleAssignmentValid(ResponsibleKind.AREA, 'u1', 'a1'),
    ).toBe(false);
  });
});
