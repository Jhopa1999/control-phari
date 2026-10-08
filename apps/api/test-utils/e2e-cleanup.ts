/**
 * Utilidad EXCLUSIVA de testing E2E.
 *
 * Elimina unicamente los registros del catalogo reservado para E2E. No se
 * expone por HTTP, no forma parte de la funcionalidad productiva y nunca borra
 * sin filtro. La API productiva NO tiene DELETE fisico; esta utilidad solo
 * existe como infraestructura de pruebas.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

export const E2E_CATALOG = 'E2E_CATALOG';

// Carga el .env raiz del monorepo (tres niveles por encima de test-utils).
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Borra, con filtro estricto, solo los registros del catalogo E2E reservado.
 * Devuelve cuantos registros se eliminaron.
 */
export async function cleanupE2ECatalog(): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no definida: no se puede limpiar E2E.');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    // Filtro estricto por el catalogo reservado. Nunca deleteMany({}) sin where.
    const result = await prisma.catalogItem.deleteMany({
      where: { catalog: E2E_CATALOG },
    });
    return result.count;
  } finally {
    await prisma.$disconnect();
  }
}
