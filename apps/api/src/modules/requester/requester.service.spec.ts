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

  it('busca el duplicado por nombre y área (mismo nombre en otra área es válido)', async () => {
    const { service, prisma } = build({});
    await service.create(actor, { name: 'Ana Pérez', areaId: 'a2' });
    expect(prisma.requester.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nameKey: 'ana perez', areaId: 'a2' } }),
    );
  });

  it('el mensaje del 409 nombra el área', async () => {
    const { service } = build({ duplicate: { id: 'other' } });
    await expect(
      service.create(actor, { name: 'Ana Pérez', areaId: 'a1' }),
    ).rejects.toThrow('Ya existe un solicitante con ese nombre en esa área.');
  });

  describe('update', () => {
    function buildUpdate(duplicate: { id: string } | null) {
      const existing = {
        id: 'r1',
        name: 'Ana Pérez',
        nameKey: 'ana perez',
        areaId: 'a1',
        active: true,
      };
      const row = {
        ...existing,
        areaId: 'a2',
        createdAt: new Date(),
        updatedAt: new Date(),
        area: { name: 'Otra', active: true },
      };
      const tx = { requester: { update: jest.fn().mockResolvedValue(row) } };
      const prisma = {
        area: { findFirst: jest.fn().mockResolvedValue({ active: true }) },
        requester: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(existing)
            .mockResolvedValue(duplicate),
        },
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      return { service: new RequesterService(prisma as never, audit as never), prisma, tx };
    }

    it('mover a un área con homónimo responde 409', async () => {
      const { service, tx } = buildUpdate({ id: 'other' });
      await expect(service.update(actor, 'r1', { areaId: 'a2' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.requester.update).not.toHaveBeenCalled();
    });

    it('mover a un área sin homónimo comprueba con el nombre actual y el área nueva', async () => {
      const { service, prisma } = buildUpdate(null);
      await service.update(actor, 'r1', { areaId: 'a2' });
      expect(prisma.requester.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { nameKey: 'ana perez', areaId: 'a2', id: { not: 'r1' } },
        }),
      );
    });

    it('no comprueba duplicados si no cambian ni nombre ni área', async () => {
      const { service, prisma } = buildUpdate(null);
      await service.update(actor, 'r1', { active: false });
      expect(prisma.requester.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});
