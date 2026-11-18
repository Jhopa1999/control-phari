import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

/**
 * Oleada 3 · PR-A «errores y acceso»:
 * - aviso único «Sin acceso» (`NoAccessNotice`) en las pantallas sin el módulo,
 *   sin pedir datos a la API;
 * - `ErrorState` distingue un 403 (mensaje del servidor, sin «Reintentar»), un
 *   fallo de red («Revisa tu conexión» y «Reintentar») y un 500 (mensaje del
 *   servidor y «Reintentar»);
 * - la API responde errores en español y sin UUID, sin cambiar el código HTTP.
 *
 * Modo dev-header (el de la suite). No modifica a los usuarios demo.
 */
const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function actAs(context: BrowserContext, identifier: string): Promise<void> {
  await context.addInitScript(
    ([origin, id]) => {
      if (window.location.origin === origin) {
        window.localStorage.setItem('actorId', id);
      }
    },
    [WEB_ORIGIN, identifier],
  );
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': WEB_ORIGIN,
      'access-control-allow-credentials': 'true',
    },
    body: JSON.stringify(body),
  });
}

async function expectNoSeriousA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('#contenido')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

test.describe('«Sin acceso» unificado', () => {
  test('el administrador abre Triage y ve el aviso, sin pedir solicitudes ni «Reintentar»', async ({
    page,
    context,
  }) => {
    await actAs(context, 'admin@demo.local');
    const requests: string[] = [];
    page.on('request', (req) => {
      if (/\/requests(\?|$)/.test(new URL(req.url()).pathname + new URL(req.url()).search)) {
        requests.push(req.url());
      }
    });
    await page.goto('/demanda/triage');
    const notice = page.getByRole('status').filter({ hasText: 'No tienes acceso al triage.' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('El triage lo realizan el jefe de área y el líder de proceso.');
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
    expect(requests).toEqual([]);
    await expectNoSeriousA11y(page);
  });

  test('el administrador abre Auditoría y ve el aviso de Auditoría', async ({ page, context }) => {
    await actAs(context, 'admin@demo.local');
    await page.goto('/gobierno/auditoria');
    const notice = page.getByRole('status').filter({ hasText: 'No tienes acceso a la auditoría.' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('El administrador del sistema no la incluye.');
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  });

  test('el administrador abre Actividades recurrentes (D14, PR-E 4.4) sin aviso y en Gestión', async ({
    page,
    context,
  }) => {
    await actAs(context, 'admin@demo.local');
    await page.goto('/actividades-recurrentes');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Actividades recurrentes' }),
    ).toBeVisible();
    await expect(page.getByText('No tienes acceso a las actividades recurrentes.')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Gestión' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('el aviso ofrece «Ir a mi inicio» hacia la primera pantalla del administrador', async ({
    page,
    context,
  }) => {
    await actAs(context, 'admin@demo.local');
    await page.goto('/demanda/priorizacion');
    const notice = page.getByRole('status').filter({ hasText: 'No tienes acceso a la priorización.' });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('link', { name: 'Ir a mi inicio' })).toBeVisible();
  });

  test('el integrante conserva su Bitácora y no ve el aviso', async ({ page, context }) => {
    await actAs(context, 'integrante@demo.local');
    await page.goto('/seguimiento/bitacora');
    await expect(page.getByRole('heading', { level: 1, name: 'Bitácora' })).toBeVisible();
    await expect(page.getByText('No tienes acceso a la bitácora.')).toHaveCount(0);
  });

  test('el integrante abre Triage y ve el aviso (no está en su matriz)', async ({
    page,
    context,
  }) => {
    await actAs(context, 'integrante@demo.local');
    await page.goto('/demanda/triage');
    await expect(
      page.getByRole('status').filter({ hasText: 'No tienes acceso al triage.' }),
    ).toBeVisible();
  });
});

test.describe('ErrorState: 403, red y servidor', () => {
  const PATH = '/demanda/priorizacion';

  test('un 403 con mensaje muestra ese mensaje, sin «Reintentar» ni «Revisa tu conexión»', async ({
    page,
  }) => {
    await page.route('**/requests**', (route) =>
      route.request().method() === 'GET' && !route.request().url().includes('/requests/')
        ? fulfillJson(route, 403, {
            statusCode: 403,
            message: 'Tu rol no puede ver estas solicitudes.',
            error: 'Forbidden',
          })
        : route.continue(),
    );
    await page.goto(PATH);
    const forbidden = page.getByRole('status').filter({ hasText: 'Tu rol no puede ver estas solicitudes.' });
    await expect(forbidden).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
    await expectNoSeriousA11y(page);
  });

  test('un fallo de red muestra «Revisa tu conexión» y «Reintentar»', async ({ page }) => {
    await page.route('**/requests**', (route) =>
      route.request().method() === 'GET' && !route.request().url().includes('/requests/')
        ? route.abort('failed')
        : route.continue(),
    );
    await page.goto(PATH);
    await expect(page.getByText('Revisa tu conexión e inténtalo de nuevo.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  test('un 500 muestra el mensaje del servidor y «Reintentar», sin «Revisa tu conexión»', async ({
    page,
  }) => {
    await page.route('**/requests**', (route) =>
      route.request().method() === 'GET' && !route.request().url().includes('/requests/')
        ? fulfillJson(route, 500, {
            statusCode: 500,
            message: 'Ocurrió un error interno. Inténtalo de nuevo; si continúa, avisa al administrador.',
          })
        : route.continue(),
    );
    await page.goto(PATH);
    await expect(page.getByText('Ocurrió un error interno.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
  });
});

test.describe('La API responde errores en español y sin UUID', () => {
  const MISSING_ID = '3f2b8c1e-9a4d-4e7b-8c55-1d2e3f4a5b6c';
  const headers = { 'X-Actor-Id': 'jefe@demo.local' };

  test('404: mismo código, mensaje en español y sin el id', async ({ request }) => {
    const res = await request.get(`${API_URL}/areas/${MISSING_ID}`, { headers });
    expect(res.status()).toBe(404);
    const body = (await res.json()) as { statusCode: number; message: string };
    expect(body.statusCode).toBe(404);
    expect(body.message).not.toMatch(UUID_RE);
    expect(body.message).toMatch(/[áéíóú]|No se encontró/);
  });

  test('400 de validación: mensajes en español, sin términos en inglés', async ({ request }) => {
    const res = await request.post(`${API_URL}/areas`, {
      headers,
      data: { code: '', name: 5, sobrante: true },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string | string[] };
    const text = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(text).not.toMatch(/must|should|property|be a/);
    expect(text).toContain('El campo');
  });

  test('403: la escritura de un integrante conserva el código y el texto en español', async ({
    request,
  }) => {
    const res = await request.post(`${API_URL}/areas`, {
      headers: { 'X-Actor-Id': 'integrante@demo.local' },
      data: { code: 'E2E-X', name: 'E2E área' },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toMatch(/Forbidden/);
  });
});
