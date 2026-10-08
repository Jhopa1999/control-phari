import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CatalogService } from './catalog.service';

/**
 * Mock tipado minimo del PrismaService: solo el delegate catalogItem con los
 * metodos que usa CatalogService. No se conecta a PostgreSQL.
 */
type CatalogItemDelegateMock = {
  create: jest.Mock;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
};

function createPrismaMock(): {
  prisma: PrismaService;
  catalogItem: CatalogItemDelegateMock;
} {
  const catalogItem: CatalogItemDelegateMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  // Cast controlado: el service solo usa prisma.catalogItem.*
  const prisma = { catalogItem } as unknown as PrismaService;
  return { prisma, catalogItem };
}

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '11111111-1111-1111-1111-111111111111',
    catalog: 'PRIORITY',
    code: 'HIGH',
    label: 'Alta',
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Construye un error P2002 real de Prisma para simular el unique violado. */
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('CatalogService', () => {
  let service: CatalogService;
  let catalogItem: CatalogItemDelegateMock;

  beforeEach(() => {
    const mock = createPrismaMock();
    catalogItem = mock.catalogItem;
    service = new CatalogService(mock.prisma);
  });

  describe('normalizacion', () => {
    it('convierte catalog y code a MAYUSCULAS al crear', async () => {
      catalogItem.create.mockResolvedValue(makeItem());

      await service.create({
        catalog: 'priority',
        code: 'high',
        label: 'Alta',
      });

      expect(catalogItem.create).toHaveBeenCalledTimes(1);
      const arg = catalogItem.create.mock.calls[0][0];
      expect(arg.data.catalog).toBe('PRIORITY');
      expect(arg.data.code).toBe('HIGH');
      // label no se transforma a mayusculas.
      expect(arg.data.label).toBe('Alta');
    });
  });

  describe('create', () => {
    it('crea un elemento y devuelve el resultado', async () => {
      const created = makeItem({ label: 'Alta' });
      catalogItem.create.mockResolvedValue(created);

      const result = await service.create({
        catalog: 'PRIORITY',
        code: 'HIGH',
        label: 'Alta',
        active: true,
        sortOrder: 1,
      });

      expect(result).toBe(created);
    });

    it('no envia active ni sortOrder cuando no se proporcionan (usa defaults)', async () => {
      catalogItem.create.mockResolvedValue(makeItem());

      await service.create({ catalog: 'C', code: 'X', label: 'L' });

      const arg = catalogItem.create.mock.calls[0][0];
      expect(arg.data).not.toHaveProperty('active');
      expect(arg.data).not.toHaveProperty('sortOrder');
    });

    it('traduce el error P2002 a ConflictException sin exponer el error de Prisma', async () => {
      catalogItem.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create({ catalog: 'PRIORITY', code: 'HIGH', label: 'Alta' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // El mensaje es de negocio, no contiene detalles internos de Prisma.
      await expect(
        service.create({ catalog: 'PRIORITY', code: 'HIGH', label: 'Alta' }),
      ).rejects.toThrow(/Ya existe un elemento/);
      await expect(
        service.create({ catalog: 'PRIORITY', code: 'HIGH', label: 'Alta' }),
      ).rejects.not.toThrow(/P2002|Unique constraint/);
    });

    it('propaga errores no-P2002 sin convertirlos en Conflict', async () => {
      catalogItem.create.mockRejectedValue(new Error('db caida'));

      await expect(
        service.create({ catalog: 'C', code: 'X', label: 'L' }),
      ).rejects.toThrow('db caida');
    });
  });

  describe('findOne', () => {
    it('devuelve el elemento existente', async () => {
      const item = makeItem();
      catalogItem.findUnique.mockResolvedValue(item);

      const result = await service.findOne(item.id);

      expect(result).toBe(item);
      expect(catalogItem.findUnique).toHaveBeenCalledWith({
        where: { id: item.id },
      });
    });

    it('lanza NotFoundException si no existe', async () => {
      catalogItem.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('actualiza label, active y sortOrder (sin tocar catalog/code)', async () => {
      const existing = makeItem();
      catalogItem.findUnique.mockResolvedValue(existing);
      catalogItem.update.mockResolvedValue(
        makeItem({ label: 'Nueva', active: false, sortOrder: 9 }),
      );

      await service.update(existing.id, {
        label: 'Nueva',
        active: false,
        sortOrder: 9,
      });

      const arg = catalogItem.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: existing.id });
      expect(arg.data).toEqual({ label: 'Nueva', active: false, sortOrder: 9 });
      expect(arg.data).not.toHaveProperty('catalog');
      expect(arg.data).not.toHaveProperty('code');
    });

    it('lanza NotFoundException si el elemento no existe', async () => {
      catalogItem.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { label: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(catalogItem.update).not.toHaveBeenCalled();
    });
  });

  describe('findMany', () => {
    it('normaliza el filtro catalog a MAYUSCULAS', async () => {
      catalogItem.findMany.mockResolvedValue([]);

      await service.findMany({ catalog: 'priority' });

      const arg = catalogItem.findMany.mock.calls[0][0];
      expect(arg.where.catalog).toBe('PRIORITY');
    });

    it('aplica el filtro active=true', async () => {
      catalogItem.findMany.mockResolvedValue([]);

      await service.findMany({ active: true });

      expect(catalogItem.findMany.mock.calls[0][0].where.active).toBe(true);
    });

    it('aplica el filtro active=false', async () => {
      catalogItem.findMany.mockResolvedValue([]);

      await service.findMany({ active: false });

      expect(catalogItem.findMany.mock.calls[0][0].where.active).toBe(false);
    });

    it('ordena por catalog, sortOrder y label', async () => {
      catalogItem.findMany.mockResolvedValue([]);

      await service.findMany({});

      const arg = catalogItem.findMany.mock.calls[0][0];
      expect(arg.orderBy).toEqual([
        { catalog: 'asc' },
        { sortOrder: 'asc' },
        { label: 'asc' },
      ]);
    });

    it('no agrega filtros cuando no se pasan', async () => {
      catalogItem.findMany.mockResolvedValue([]);

      await service.findMany({});

      const arg = catalogItem.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
    });
  });
});
