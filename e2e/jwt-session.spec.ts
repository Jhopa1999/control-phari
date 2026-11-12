import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Regresiones de la sesión jwt (design §8.7):
 * (a) recargar una ruta protegida conserva la sesión y la ruta;
 * (b) un enlace directo sin sesión vuelve a su ruta tras iniciar sesión;
 * (c) /login con sesión válida lleva a /inicio;
 * (d) ?expired=1 muestra el aviso de sesión expirada;
 * (e) un `next` externo se ignora y lleva a /inicio del mismo origen;
 * (f) cerrar sesión lleva a /login sin `next` y una recarga no la recupera;
 * (g) credenciales incorrectas muestran el error genérico y no guardan sesión;
 * (h) sin sesión, una ruta protegida no pide sus datos ni muestra su contenido;
 * (i) la sesión es una cookie HttpOnly y el token no está al alcance de JS;
 * (j) un token heredado en localStorage se purga al cargar.
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

const SESSION_COOKIE = 'portal_session';

const sessionCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((c) => c.name === SESSION_COOKIE);

/** Ni el token ni el usuario se guardan en el almacenamiento del navegador. */
async function expectNoTokenInStorage(page: Page): Promise<void> {
  const stored = await page.evaluate(() => ({
    token: window.localStorage.getItem('authToken'),
    user: window.localStorage.getItem('authUser'),
    session: Object.keys(window.sessionStorage),
    cookie: document.cookie,
  }));
  expect(stored.token).toBeNull();
  expect(stored.user).toBeNull();
  expect(stored.session).toEqual([]);
  expect(stored.cookie).not.toContain(SESSION_COOKIE);
}

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
// /inicio ya tiene su h1 definitivo (design §11.3): los casos que llegan a
// /inicio lo comprueban por nombre.
const panelHeading = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('heading', { level: 1, name: 'Panel del área', exact: true });
// Desde el rediseño del login (design §11.2), /login también tiene main + h1.
const loginHeading = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('heading', { level: 1, name: 'Iniciar sesión', exact: true });
const loginForm = (page: Page) => page.locator('#password');
const expiredNotice = (page: Page) =>
  page.getByRole('status').filter({ hasText: /expir/i });
const userMenuButton = (page: Page) =>
  page.getByRole('button', { name: /Men[uú] de usuario/ });

/** Espera a que terminen las peticiones (y una posible redirección en curso). */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

test('recargar una ruta protegida conserva la sesión y la ruta', async ({
  page,
}) => {
  await page.goto('/login');
  await signIn(page);
  await expect(panelHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');

  await page.reload();
  await settled(page);
  await expect(panelHeading(page)).toBeVisible();
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
  await expect(loginHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/login?next=%2Fdemanda%2Fsolicitudes');

  await signIn(page);
  await expect(mainHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/demanda/solicitudes');
});

test('/login con sesión válida lleva a /inicio', async ({ page }) => {
  await page.goto('/login');
  await signIn(page);
  await expect(panelHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');

  await page.goto('/login');
  await expect(panelHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');
  await expect(loginForm(page)).toHaveCount(0);
});

test('una sesión rechazada lleva a /login?expired=1 con el aviso de sesión expirada', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/login');
  // El formulario aparece cuando la app ya resolvió la identidad (sin sesión):
  // si la cookie se pusiera antes, esta misma página recibiría el 401 y la
  // pista se borraría antes de llegar a /inicio.
  await expect(loginForm(page)).toBeVisible();
  // Cookie de sesión inválida (la API responde 401) + la pista de que hubo sesión.
  await context.addCookies([
    { name: SESSION_COOKIE, value: 'token-invalido', url: baseURL ?? 'http://localhost:3100' },
  ]);
  await page.evaluate(() => window.localStorage.setItem('authSessionHint', '1'));

  await page.goto('/inicio');
  await expect(expiredNotice(page)).toBeVisible();
  await expect(expiredNotice(page)).toHaveText(
    'La sesión expiró. Vuelve a iniciar sesión.',
  );
  await expect(page).toHaveURL('/login?expired=1');
});

test('un next externo se ignora y lleva a /inicio del mismo origen', async ({
  page,
  context,
  baseURL,
}) => {
  for (const next of ['https%3A%2F%2Fejemplo.invalid', '%2F%2Fejemplo.invalid']) {
    await page.goto(`/login?next=${next}`);
    await signIn(page);
    await expect(panelHeading(page)).toBeVisible();
    await expect(page).toHaveURL(`${baseURL}/inicio`);
    // El siguiente valor se prueba de nuevo sin sesión.
    await context.clearCookies();
    await page.evaluate(() => window.localStorage.clear());
  }
});

test('cerrar sesión lleva a /login sin next y una recarga no la recupera', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await signIn(page);
  await expect(mainHeading(page)).toBeVisible();
  // /login ya tiene su propio h1: la URL confirma que el inicio de sesión
  // terminó antes de navegar a otra ruta.
  await expect(page).toHaveURL('/inicio');
  expect(await sessionCookie(context)).toBeDefined();
  // Desde una ruta distinta de /inicio, que sin cierre explícito llevaría `next`.
  await page.goto('/demanda/solicitudes');
  await settled(page);
  await expect(mainHeading(page)).toBeVisible();

  // Pide confirmación: cancelar conserva la sesión; confirmar la cierra.
  await userMenuButton(page).click();
  await page.getByRole('menuitem', { name: /Cerrar sesi[oó]n/ }).click();
  const confirmDialog = page.getByRole('dialog', { name: /¿Cerrar sesi[oó]n\?/ });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(page).toHaveURL('/demanda/solicitudes');

  await userMenuButton(page).click();
  await page.getByRole('menuitem', { name: /Cerrar sesi[oó]n/ }).click();
  await confirmDialog.getByRole('button', { name: /Cerrar sesi[oó]n/ }).click();
  await expect(loginForm(page)).toBeVisible();
  await expect(loginHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/login');
  // El servidor borró la cookie (POST /auth/logout) y no queda token en JS.
  expect(await sessionCookie(context)).toBeUndefined();
  await expectNoTokenInStorage(page);

  await page.goto('/inicio');
  await expect(loginForm(page)).toBeVisible();
  await expect(loginHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/login');
});
test('credenciales incorrectas muestran el error y no inician sesión', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.locator('#identifier').fill(IDENTIFIER);
  await page.locator('#password').fill(`${PASSWORD}-incorrecta`);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  // Mensaje genérico: no revela si el usuario existe.
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
  await expect(loginForm(page)).toBeVisible();
  await expect(page).toHaveURL('/login');
  expect(await sessionCookie(context)).toBeUndefined();
  await expectNoTokenInStorage(page);
});

test('la sesión es una cookie HttpOnly y el token no está al alcance de JS', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await signIn(page);
  await expect(panelHeading(page)).toBeVisible();

  const cookie = await sessionCookie(context);
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.path).toBe('/');
  await expectNoTokenInStorage(page);
  // El nombre del usuario se pinta tras recuperarlo con GET /me/permissions.
  await expect(userMenuButton(page)).toBeVisible();
});

test('un token heredado en localStorage se purga al cargar y pide iniciar sesión', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('authToken', 'token-heredado');
    window.localStorage.setItem('authUser', '{\"identifier\":\"x\"}');
  });
  await page.goto('/inicio');
  await expect(loginForm(page)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  // El initScript siembra el token solo al crear el documento; la app lo purga al arrancar.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('authToken')))
    .toBeNull();
});
test('sin sesión, una ruta protegida no pide sus datos ni muestra su contenido', async ({
  page,
}) => {
  const auditRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/audit-events') {
      auditRequests.push(request.url());
    }
  });
  await page.goto('/gobierno/auditoria');
  await settled(page);
  await expect(loginForm(page)).toBeVisible();
  await expect(page).toHaveURL('/login?next=%2Fgobierno%2Fauditoria');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Auditoría' }),
  ).toHaveCount(0);
  expect(auditRequests).toEqual([]);
});
