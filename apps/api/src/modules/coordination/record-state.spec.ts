import {
  isRecordState,
  isRecordStateTransitionAllowed,
  RecordState,
} from './record-state';

describe('record-state (maquina minima reversible, §4)', () => {
  it('EN_CURSO <-> BLOQUEADO permitido en ambos sentidos', () => {
    expect(
      isRecordStateTransitionAllowed(
        RecordState.EN_CURSO,
        RecordState.BLOQUEADO,
      ),
    ).toBe(true);
    expect(
      isRecordStateTransitionAllowed(
        RecordState.BLOQUEADO,
        RecordState.EN_CURSO,
      ),
    ).toBe(true);
  });

  it('completar desde en curso o bloqueado permitido', () => {
    expect(
      isRecordStateTransitionAllowed(
        RecordState.EN_CURSO,
        RecordState.COMPLETADO,
      ),
    ).toBe(true);
    expect(
      isRecordStateTransitionAllowed(
        RecordState.BLOQUEADO,
        RecordState.COMPLETADO,
      ),
    ).toBe(true);
  });

  it('archivar completado permitido', () => {
    expect(
      isRecordStateTransitionAllowed(
        RecordState.COMPLETADO,
        RecordState.ARCHIVADO,
      ),
    ).toBe(true);
  });

  it('reapertura COMPLETADO/ARCHIVADO -> EN_CURSO permitida (reversible)', () => {
    expect(
      isRecordStateTransitionAllowed(
        RecordState.COMPLETADO,
        RecordState.EN_CURSO,
      ),
    ).toBe(true);
    expect(
      isRecordStateTransitionAllowed(
        RecordState.ARCHIVADO,
        RecordState.EN_CURSO,
      ),
    ).toBe(true);
  });

  it('salto no permitido (EN_CURSO -> ARCHIVADO) devuelve false', () => {
    expect(
      isRecordStateTransitionAllowed(
        RecordState.EN_CURSO,
        RecordState.ARCHIVADO,
      ),
    ).toBe(false);
  });

  it('isRecordState reconoce codigos validos y rechaza basura', () => {
    expect(isRecordState('EN_CURSO')).toBe(true);
    expect(isRecordState('ABIERTO')).toBe(false);
  });
});
