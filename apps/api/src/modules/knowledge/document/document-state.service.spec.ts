import { BadRequestException } from '@nestjs/common';
import { DocumentStateService } from './document-state.service';
import { DocStatus } from './doc-status';

describe('DocumentStateService', () => {
  const service = new DocumentStateService();

  it('permite las transiciones reversibles del grafo', () => {
    expect(service.assertTransition('BORRADOR', 'VIGENTE')).toBe(DocStatus.VIGENTE);
    expect(service.assertTransition('VIGENTE', 'ARCHIVADA')).toBe(DocStatus.ARCHIVADA);
    expect(service.assertTransition('ARCHIVADA', 'VIGENTE')).toBe(DocStatus.VIGENTE);
    expect(service.assertTransition('VIGENTE', 'BORRADOR')).toBe(DocStatus.BORRADOR);
  });

  it('rechaza saltos no permitidos con 400', () => {
    expect(() => service.assertTransition('BORRADOR', 'ARCHIVADA')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertTransition('ARCHIVADA', 'BORRADOR')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza estados desconocidos con 400', () => {
    expect(() => service.assertTransition('VIGENTE', 'ZZZ')).toThrow(
      BadRequestException,
    );
  });
});
