import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:3000';
const API_HEALTH = 'http://localhost:3001/health';
const isCI = Boolean(process.env.CI);

/**
 * Configuracion E2E de la plantilla.
 *
 * Levanta automaticamente backend (NestJS) y frontend (Next.js) mediante los
 * scripts reales del repositorio. Requiere PostgreSQL local levantado
 * (npm run db:up): la suite valida la cadena completa navegador -> Next ->
 * api-client -> NestJS -> Prisma -> PostgreSQL.
 *
 * Workers = 1 porque la suite comparte el catalogo reservado E2E_CATALOG.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: WEB_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: API_HEALTH,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web',
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
