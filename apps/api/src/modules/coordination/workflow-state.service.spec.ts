import { BadRequestException } from '@nestjs/common';
import { WorkflowStateService } from './workflow-state.service';

describe('WorkflowStateService', () => {
  const service = new WorkflowStateService();

  it('transicion permitida devuelve el estado destino tipado', () => {
    expect(service.assertTransition('EN_CURSO', 'COMPLETADO')).toBe(
      'COMPLETADO',
    );
  });

  it('reapertura COMPLETADO -> EN_CURSO permitida', () => {
    expect(service.assertTransition('COMPLETADO', 'EN_CURSO')).toBe('EN_CURSO');
  });

  it('salto no permitido -> 400', () => {
    expect(() => service.assertTransition('EN_CURSO', 'ARCHIVADO')).toThrow(
      BadRequestException,
    );
  });

  it('estado destino desconocido -> 400', () => {
    expect(() => service.assertTransition('EN_CURSO', 'ABIERTO')).toThrow(
      BadRequestException,
    );
  });

  it('estado actual corrupto -> 400', () => {
    expect(() => service.assertTransition('XXX', 'EN_CURSO')).toThrow(
      BadRequestException,
    );
  });
});
