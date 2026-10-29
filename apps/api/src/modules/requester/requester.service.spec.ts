import { BadRequestException, ConflictException } from '@nestjs/common';
import { RequesterService, requesterNameKey } from './requester.service';
import type { CurrentActor } from '../auth/current-actor';

const actor = { userId: 'u1' } as unknown as CurrentActor;

function build(overrides: {
  area?: { active: boolean } | null;
  duplicate?: { id: string } | null;
}) {
  const created = {
    id: 'r1',
    name: 'Ana Pérez',
    areaId: 'a1',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    area: { name: 'Finanzas', active: true },
  };
  const tx = { requester: { create: jest.fn().mockResolvedValue(created) } };
  const prisma = {
    area: {
      findFirst: jest
        .fn()
        .mockResolvedValue(overrides.area === undefined ? { active: true } : overrides.area),
    },
    requester: {
      findFirst: jest.fn().mockResolvedValue(overrides.duplicate ?? null),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new RequesterService(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

describe('RequesterService', () => {
  it('normaliza la clave de unicidad sin tildes ni mayúsculas', () => {
    expect(requesterNameKey('  Ana   PÉREZ ')).toBe('ana perez');
  });

  it('crea un solicitante asociado a un área activa y audita', async () => {
    const { service, tx, audit } = build({});
    const res = await service.create(actor, { name: ' Ana Pérez ', areaId: 'a1' });
    expect(res.areaName).toBe('Finanzas');
    expect(tx.requester.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Ana Pérez', nameKey: 'ana perez', areaId: 'a1' },
      }),
    );
    expect(audit.record).toHaveBeenCalled();
  });

  it('rechaza un área inexistente o inactiva', async () => {
    await expect(
      build({ area: null }).service.create(actor, { name: 'X', areaId: 'a1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      build({ area: { active: false } }).service.create(actor, { name: 'X', areaId: 'a1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza solicitantes duplicados (409)', async () => {
    const { service, tx } = build({ duplicate: { id: 'other' } });
    await expect(
      service.create(actor, { name: 'ana pérez', areaId: 'a1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.requester.create).not.toHaveBeenCalled();
  });
});
