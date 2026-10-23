import { NotFoundException } from '@nestjs/common';
import { DevActorsController } from './dev-actors.controller';
import { PrismaService } from '../../database/prisma.service';

describe('DevActorsController (delegacion)', () => {
  const originalAuthMode = process.env.AUTH_MODE;

  afterAll(() => {
    process.env.AUTH_MODE = originalAuthMode;
  });

  it('listActors devuelve los usuarios activos en modo dev-header', async () => {
    process.env.AUTH_MODE = 'dev-header';
    const findMany = jest
      .fn()
      .mockResolvedValue([{ identifier: 'u@demo.local', name: 'U' }]);
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const controller = new DevActorsController(prisma);

    await expect(controller.listActors()).resolves.toEqual([
      { identifier: 'u@demo.local', name: 'U' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { identifier: true, name: true },
    });
  });

  it('listActors responde 404 fuera del modo dev-header', async () => {
    process.env.AUTH_MODE = 'jwt';
    const findMany = jest.fn();
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const controller = new DevActorsController(prisma);

    await expect(controller.listActors()).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
