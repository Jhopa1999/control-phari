import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/** Campos de credenciales que Prisma no devuelve salvo petición explícita. */
export const SENSITIVE_PRISMA_OMIT = {
  user: { passwordHash: true },
  authToken: { tokenHash: true },
} as const;

/**
 * PrismaService para Prisma ORM v7.
 *
 * Flujo de conexion:
 *   DATABASE_URL -> PrismaPg (driver adapter) -> PrismaClient -> PostgreSQL
 *
 * - La URL se lee de variables de entorno (nunca hardcodeada).
 * - Se valida su existencia y se lanza un error claro si falta, sin exponer
 *   credenciales en los logs.
 * - El ciclo de vida de NestJS gestiona la conexion y el cierre del pool.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString || connectionString.trim() === '') {
      // Mensaje entendible, sin revelar credenciales ni la URL completa.
      throw new Error(
        'Database configuration missing: la variable de entorno DATABASE_URL no esta definida.',
      );
    }

    // DATABASE_URL -> PrismaPg -> PrismaClient
    const adapter = new PrismaPg({ connectionString });
    // Raíz del hotfix de seguridad: las credenciales quedan fuera de TODA
    // consulta (incluidas las relaciones anidadas como `include: { user }`).
    // Quien necesite el hash (login) lo pide con `omit: { passwordHash: false }`.
    super({ adapter, omit: SENSITIVE_PRISMA_OMIT });
  }

  async onModuleInit(): Promise<void> {
    // Conectar en el arranque para fallar temprano si la base no responde.
    await this.$connect();
    this.logger.log('PrismaService conectado a PostgreSQL.');
  }

  async onModuleDestroy(): Promise<void> {
    // Cerrar el pool del adapter de forma limpia al apagar la aplicacion.
    await this.$disconnect();
  }
}
