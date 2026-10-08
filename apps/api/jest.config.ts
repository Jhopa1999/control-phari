import type { Config } from 'jest';

/**
 * Configuracion de Jest para el backend.
 * Pruebas unitarias rapidas y aisladas: NO tocan PostgreSQL (PrismaService se
 * mockea). ts-jest transpila TypeScript sin Babel.
 */
const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // El cliente Prisma generado usa decoradores/metadata.
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          // Relajar reglas no esenciales para los specs.
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
  clearMocks: true,
};

export default config;
