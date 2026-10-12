import { expect, test, type Page } from '@playwright/test';
import type { AuthUser } from '../apps/web/src/lib/api-client'; // solo tipo: el módulo no se evalúa

/**
 * Regresiones de la sesión jwt (design §8.7):
 * (a) recargar una ruta protegida conserva la sesión y la ruta;
 * (b) un enlace directo sin sesión vuelve a su ruta tras iniciar sesión;
 * (c) /login con sesión válida lleva a /inicio;
 * (d) ?expired=1 muestra el aviso de sesión expirada;
 * (e) un `next` externo se ignora y lleva a /inicio del mismo origen;
 * (f) cerrar sesión lleva a /login sin `next` y una recarga no la recupera.
 *
 * Solo corre con E2E_AUTH_MODE=jwt y con la API (AUTH_MODE=jwt) y la web
 * (NEXT_PUBLIC_AUTH_MODE=jwt) ya levantadas: fuera de CI Playwright reutiliza
 * los servidores en marcha. La contraseña es la de desarrollo del seed
 * (DEV_PASSWORD en apps/api/prisma/seed.ts) y llega por E2E_JWT_PASSWORD; no
 * se copia aquí.
 *
 * Regla de orden: primero el contenido y después la URL. Tras page.reload() la
 * URL sigue siendo la de origen hasta que el cliente redirige, así que
 * comprobarla primero pasaría en falso. Además, tras una carga completa de una
 * ruta protegida se espera el reposo de la red (settled): con el defecto, el
 * shell llega a pintarse un instante antes de que termine la redirección a
 * /login, y sin esa espera las dos comprobaciones pueden pasar en falso.
 */
test.skip(
  process.env.E2E_AUTH_MODE !== 'jwt',
  'Requiere la API y la web en modo jwt',
);

const PASSWORD = process.env.E2E_JWT_PASSWORD ?? '';
test.skip(
  PASSWORD === '',
  'Requiere E2E_JWT_PASSWORD (DEV_PASSWORD de apps/api/prisma/seed.ts)',
);

const IDENTIFIER = process.env.E2E_JWT_IDENTIFIER ?? 'jefe@demo.local';

/** Usuario bien formado que acompaña a un token inválido (caso 4). */
const STORED_USER: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Usuario e2e',
  identifier: IDENTIFIER,
};

// Cada test parte de un navegador sin sesión: ni token jwt ni actor de dev.
test.use({ storageState: { cookies: [], origins: [] } });

// Selectores estables del baseline: no cambian con el rediseño.
async function signIn(page: Page): Promise<void> {
  await page.locator('#identifier').fill(IDENTIFIER);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}
const mainHeading = (page: Page) =>
  page.getByRole('main').getByRole('heading', { level: 1 });
const loginForm = (page: Page) => page.locator('#password');
const expiredNotice = (page: Page) =>
  page.getByRole('status').filter({ hasText: /expir/i });
const logoutButton = (page: Page) =>
  page.getByRole('button', { name: /Cerrar sesi[oó]n/ });

/** Espera a que terminen las peticiones (y una posible redirección en curso). */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

test('recargar una ruta protegida conserva la sesión y la ruta', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page);
  await expect(mainHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');

  await page.reload();
  await settled(page);
  await expect(mainHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');

  await page.goto('/seguimiento/portafolio');
  await page.reload();
  await settled(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Portafolio' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/seguimiento/portafolio');
});

test('un enlace directo sin sesión vuelve a su ruta tras iniciar sesión', async ({
  page,
}) => {
  await page.goto('/demanda/solicitudes');
  await expect(loginForm(page)).toBeVisible();
  await expect(page).toHaveURL('/login?next=%2Fdemanda%2Fsolicitudes');

  await signIn(page);
  await expect(mainHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/demanda/solicitudes');
});

test('/login con sesión válida lleva a /inicio', async ({ page }) => {
  await page.goto('/login');
  await signIn(page);
  await expect(mainHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');

  await page.goto('/login');
  await expect(mainHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');
  await expect(loginForm(page)).toHaveCount(0);
});

test('una sesión rechazada lleva a /login?expired=1 con el aviso de sesión expirada', async ({
  page,
}) => {
  await page.goto('/login');
  // El formulario aparece cuando la app ya leyó la identidad persistida: si se
  // guardara el token antes, esta misma página lo leería, recibiría el 401 y lo
  // borraría antes de llegar a /inicio.
  await expect(loginForm(page)).toBeVisible();
  await page.evaluate(
    ([token, user]) => {
      window.localStorage.setItem('authToken', token);
      window.localStorage.setItem('authUser', user);
    },
    ['token-invalido', JSON.stringify(STORED_USER)] as const,
  );

  await page.goto('/inicio');
  await expect(expiredNotice(page)).toBeVisible();
  await expect(page).toHaveURL('/login?expired=1');
});

test('un next externo se ignora y lleva a /inicio del mismo origen', async ({
  page,
  baseURL,
}) => {
  for (const next of ['https%3A%2F%2Fejemplo.invalid', '%2F%2Fejemplo.invalid']) {
    await page.goto(`/login?next=${next}`);
    await signIn(page);
    await expect(mainHeading(page)).toBeVisible();
    await expect(page).toHaveURL(`${baseURL}/inicio`);
    // El siguiente valor se prueba de nuevo sin sesión.
    await page.evaluate(() => window.localStorage.clear());
  }
});

test('cerrar sesión lleva a /login sin next y una recarga no la recupera', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page);
  await expect(mainHeading(page)).toBeVisible();
  // Desde una ruta distinta de /inicio, que sin cierre explícito llevaría `next`.
  await page.goto('/demanda/solicitudes');
  await settled(page);
  await expect(mainHeading(page)).toBeVisible();

  await logoutButton(page).click();
  await expect(loginForm(page)).toBeVisible();
  await expect(page).toHaveURL('/login');
  expect(
    await page.evaluate(() => window.localStorage.getItem('authToken')),
  ).toBeNull();

  await page.goto('/inicio');
  await expect(loginForm(page)).toBeVisible();
  await expect(page).toHaveURL('/login');
});
