import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Global setup de Playwright: genera un storageState con el actor de desarrollo
 * seleccionado en localStorage (clave `actorId`, igual que el selector del
 * portal). El middleware del api-client lee esa clave en cada peticion e inyecta
 * la cabecera X-Actor-Id, de modo que la suite E2E ejercita la cadena real de
 * autorizacion (navegador -> api-client -> NestJS). Sin esto, el navegador
 * limpio no envia actor y el backend responde 401 (control real server-side).
 *
 * Se usa `jefe@demo.local` (JEFE_AREA en los 4 procesos, segun el seed) porque
 * la maestra generica exige ese rol para escribir.
 */
// Origen de la web: WEB_ORIGIN o, si falta, E2E_WEB_URL (el mismo de
// playwright.config.ts). Sin variables vale lo mismo que en la CI.
const WEB_ORIGIN =
  process.env.WEB_ORIGIN ?? process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const ACTOR_IDENTIFIER = 'jefe@demo.local';

export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  '.auth',
  'dev-actor.json',
);

export default async function globalSetup(): Promise<void> {
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: WEB_ORIGIN,
        localStorage: [{ name: 'actorId', value: ACTOR_IDENTIFIER }],
      },
    ],
  };

  await mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify(storageState, null, 2),
    'utf8',
  );
}
