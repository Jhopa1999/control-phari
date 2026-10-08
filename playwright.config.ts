import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:3000';
const API_HEALTH = 'http://localhost:3001/health';
const isCI = Boolean(process.env.CI);

/**
 * storageState con el actor de desarrollo preseleccionado en localStorage. Lo
 * genera e2e/global-setup.ts; el api-client lee `actorId` e inyecta X-Actor-Id,
 * de modo que la suite valida la autorizacion real del backend.
 */
const STORAGE_STATE_PATH = path.resolve(__dirname, 'e2e', '.auth', 'dev-actor.json');

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
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: WEB_URL,
    storageState: STORAGE_STATE_PATH,
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
