import { BadRequestException } from '@nestjs/common';
import { AssetStateService } from './asset-state.service';
import { AssetStatus } from './asset-status';

describe('AssetStateService', () => {
  const service = new AssetStateService();

  it('permite las transiciones del grafo (alta/retiro/recuperacion)', () => {
    expect(service.assertTransition('BORRADOR', 'ACTIVO')).toBe(AssetStatus.ACTIVO);
    expect(service.assertTransition('ACTIVO', 'RETIRADO')).toBe(AssetStatus.RETIRADO);
    expect(service.assertTransition('RETIRADO', 'ACTIVO')).toBe(AssetStatus.ACTIVO);
  });

  it('rechaza ACTIVO -> BORRADOR (no confirmada, MEDIUM-2) con 400', () => {
    expect(() => service.assertTransition('ACTIVO', 'BORRADOR')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza saltos no permitidos con 400', () => {
    expect(() => service.assertTransition('BORRADOR', 'RETIRADO')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertTransition('RETIRADO', 'BORRADOR')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza estados desconocidos con 400', () => {
    expect(() => service.assertTransition('BORRADOR', 'XXX')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertTransition('YYY', 'ACTIVO')).toThrow(
      BadRequestException,
    );
  });
});
