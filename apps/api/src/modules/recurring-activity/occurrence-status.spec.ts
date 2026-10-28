import {
  isOccurrenceStatus,
  isOccurrenceTransitionAllowed,
  OccurrenceStatus,
} from './occurrence-status';

describe('isOccurrenceTransitionAllowed (design §2, D6)', () => {
  it('admite las aristas permitidas', () => {
    const allowed: Array<[OccurrenceStatus, OccurrenceStatus]> = [
      [OccurrenceStatus.PENDIENTE, OccurrenceStatus.EN_CURSO],
      [OccurrenceStatus.PENDIENTE, OccurrenceStatus.COMPLETADA],
      [OccurrenceStatus.EN_CURSO, OccurrenceStatus.COMPLETADA],
      [OccurrenceStatus.PENDIENTE, OccurrenceStatus.VENCIDA],
      [OccurrenceStatus.EN_CURSO, OccurrenceStatus.VENCIDA],
      [OccurrenceStatus.VENCIDA, OccurrenceStatus.COMPLETADA],
    ];
    for (const [from, to] of allowed) {
      expect(isOccurrenceTransitionAllowed(from, to)).toBe(true);
    }
  });

  it('rechaza una muestra de aristas prohibidas (de COMPLETADA no se sale)', () => {
    const forbidden: Array<[OccurrenceStatus, OccurrenceStatus]> = [
      [OccurrenceStatus.COMPLETADA, OccurrenceStatus.EN_CURSO],
      [OccurrenceStatus.COMPLETADA, OccurrenceStatus.PENDIENTE],
      [OccurrenceStatus.COMPLETADA, OccurrenceStatus.VENCIDA],
      [OccurrenceStatus.VENCIDA, OccurrenceStatus.EN_CURSO],
      [OccurrenceStatus.VENCIDA, OccurrenceStatus.PENDIENTE],
      [OccurrenceStatus.EN_CURSO, OccurrenceStatus.PENDIENTE],
    ];
    for (const [from, to] of forbidden) {
      expect(isOccurrenceTransitionAllowed(from, to)).toBe(false);
    }
  });
});

describe('isOccurrenceStatus', () => {
  it('reconoce estados validos y rechaza basura', () => {
    expect(isOccurrenceStatus('PENDIENTE')).toBe(true);
    expect(isOccurrenceStatus('VENCIDA')).toBe(true);
    expect(isOccurrenceStatus('CANCELADA')).toBe(false);
  });
});
