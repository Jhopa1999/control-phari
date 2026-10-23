import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';

/**
 * Mock tipado minimo del PrismaService: solo el metodo $queryRaw que usa la
 * accion de readiness. No se conecta a PostgreSQL ni se usan librerias de
 * mocking (solo jest.fn()).
 */
function createPrismaMock(): {
  prisma: PrismaService;
  queryRaw: jest.Mock;
} {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return { prisma, queryRaw };
}

describe('HealthController', () => {
  describe('check (liveness)', () => {
    it('devuelve status ok sin tocar la base de datos', () => {
      const { prisma, queryRaw } = createPrismaMock();
      const controller = new HealthController(prisma);

      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('plantilla-portales-api');
      expect(typeof result.timestamp).toBe('string');
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('ready (readiness)', () => {
    it('devuelve 200 con database up cuando el ping a BD responde', async () => {
      const { prisma, queryRaw } = createPrismaMock();
      queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const controller = new HealthController(prisma);

      const result = await controller.ready();

      expect(result.status).toBe('ready');
      expect(result.checks.database).toBe('up');
      expect(typeof result.timestamp).toBe('string');
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('lanza 503 con database down cuando el ping a BD falla', async () => {
      const { prisma, queryRaw } = createPrismaMock();
      queryRaw.mockRejectedValue(new Error('connection refused: 127.0.0.1:5432'));
      const controller = new HealthController(prisma);

      await expect(controller.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('el payload 503 no expone el error interno de Prisma', async () => {
      const { prisma, queryRaw } = createPrismaMock();
      const internalMessage = 'connection refused: 127.0.0.1:5432';
      queryRaw.mockRejectedValue(new Error(internalMessage));
      const controller = new HealthController(prisma);

      let caught: ServiceUnavailableException | undefined;
      try {
        await controller.ready();
      } catch (error) {
        caught = error as ServiceUnavailableException;
      }

      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      const response = caught?.getResponse() as {
        status: string;
        checks: { database: string };
      };
      expect(response.status).toBe('not_ready');
      expect(response.checks.database).toBe('down');
      expect(JSON.stringify(response)).not.toContain(internalMessage);
    });
  });
});
