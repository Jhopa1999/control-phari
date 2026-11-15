import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Oleada 1 · Acceso (plan de mejora 1.1, 1.2, 1.5 y 6.2):
 * - Panel sin selector de periodo y con «Estado actual, a hoy» (D2);
 * - el administrador ve un solo aviso «No tienes acceso a este panel.», sin
 *   «Revisa tu conexión» y sin pedir el resumen de demanda;
 * - Maestras en solo lectura para quien no tiene el módulo «admin»;
 * - login con bloqueo 429 (aviso, cuenta regresiva y enlace de recuperación);
 * - límite real de la API (429 con Retry-After y evento LOGIN_FAILED).
 *
 * Modo dev-header (el de la suite). No modifica a los usuarios demo: el límite
 * real se prueba con un identificador inventado y único por ejecución.
 */

const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

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

function seriousOrCritical(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

async function expectNoSeriousA11y(page: Page): Promise<void> {
  // Solo el contenido de la pantalla (#contenido): la campana del shell tiene
  // un hallazgo previo (label-content-name-mismatch con muchos avisos) que es
  // de la oleada 3 del plan, no de estas pantallas.
  const results = await new AxeBuilder({ page })
    .include('#contenido')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = seriousOrCritical(results.violations);
  expect(
    bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

test.describe('Panel del área (D2 y acceso)', () => {
  test('el jefe ve el estado actual, a hoy, sin selector de periodo', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page.getByRole('heading', { name: 'Panel del área', level: 1 })).toBeVisible();
    await expect(page.getByText('Estado actual, a hoy', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'Periodo' })).toHaveCount(0);
    await expect(page.getByLabel('Desde')).toHaveCount(0);
    await expect(page.getByLabel('Hasta')).toHaveCount(0);
    await expect(page.getByText('en el periodo')).toHaveCount(0);
    await expect(page.getByText('periodo seleccionado')).toHaveCount(0);
    await expect(page.getByText('periodo elegido')).toHaveCount(0);
  });

  test('el administrador ve un solo aviso de acceso y no pide el resumen', async ({
    page,
    context,
  }) => {
    await actAs(context, 'admin@demo.local');
    const summaryRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/area-control/demand-summary')) summaryRequests.push(req.url());
    });
    await page.goto('/inicio');
    await expect(page.getByText('No tienes acceso a este panel.')).toBeVisible();
    await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
    await expect(page.getByText('No fue posible cargar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    // Un único aviso de acceso (antes eran dos errores 403 apilados).
    await expect(page.getByText('No tienes acceso a este panel.')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Ir a mi inicio' })).toBeVisible();
    expect(summaryRequests).toEqual([]);
    await expectNoSeriousA11y(page);
  });

  test('un 403 del resumen se presenta como falta de acceso, no como error de red', async ({
    page,
  }) => {
    await page.route('**/area-control/demand-summary**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': WEB_ORIGIN,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ statusCode: 403, message: 'Forbidden' }),
      }),
    );
    await page.goto('/inicio');
    await expect(page.getByText('No tienes acceso a este panel.')).toBeVisible();
    await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  });

  test('un fallo de red conserva el error con «Reintentar»', async ({ page }) => {
    await page.route('**/area-control/demand-summary**', (route) => route.abort('failed'));
    await page.goto('/inicio');
    await expect(page.getByText('No fue posible cargar el panorama de la demanda.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(page.getByText('No tienes acceso a este panel.')).toHaveCount(0);
  });
});

test.describe('Maestras: lectura abierta, escritura solo del módulo admin', () => {
  test('el jefe de área conserva los botones de escritura y no ve el aviso', async ({ page }) => {
    await page.goto('/catalogs');
    await expect(page.getByRole('button', { name: 'Nuevo elemento' }).first()).toBeVisible();
    await expect(page.getByText('Solo lectura.')).toHaveCount(0);
  });

  for (const identifier of ['integrante@demo.local', 'lider@demo.local', 'admin@demo.local']) {
    test(`${identifier} ve las maestras en solo lectura`, async ({ page, context }) => {
      await actAs(context, identifier);
      await page.goto('/catalogs');
      await expect(page.getByRole('heading', { name: 'Maestras', level: 1 })).toBeVisible();
      await expect(page.getByText('Solo lectura.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Nuevo elemento' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Editar|Desactivar|Activar/ })).toHaveCount(0);
      await expect(page.getByRole('columnheader', { name: 'Acciones' })).toHaveCount(0);
      // La lectura sigue abierta: la tabla (o su estado vacío) se muestra.
      await expect(page.getByText('No fue posible cargar los elementos.')).toHaveCount(0);
    });
  }

  test('la API rechaza con 403 la escritura de integrante, líder y administrador', async ({
    request,
  }) => {
    for (const identifier of ['integrante@demo.local', 'lider@demo.local', 'admin@demo.local']) {
      const res = await request.post(`${API_URL}/catalog-items`, {
        headers: { 'X-Actor-Id': identifier },
        data: { catalog: 'E2E_ACCESO', code: 'X', label: 'E2E acceso' },
      });
      expect(res.status(), identifier).toBe(403);
    }
  });

  test('accesibilidad de Maestras en solo lectura', async ({ page, context }) => {
    await actAs(context, 'integrante@demo.local');
    await page.goto('/catalogs');
    await expect(page.getByText('Solo lectura.')).toBeVisible();
    await expectNoSeriousA11y(page);
  });
});

test.describe('Login: bloqueo por intentos', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('el 429 muestra el aviso, la cuenta regresiva y el enlace de recuperación', async ({
    page,
  }) => {
    await page.route('**/auth/login', (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': WEB_ORIGIN,
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': 'content-type,x-portal-csrf,x-actor-id',
            'access-control-allow-methods': 'POST',
          },
        });
      }
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: {
          'retry-after': '272',
          'access-control-allow-origin': WEB_ORIGIN,
          'access-control-allow-credentials': 'true',
          'access-control-expose-headers': 'Retry-After',
        },
        body: JSON.stringify({ statusCode: 429, message: 'Demasiados intentos fallidos.' }),
      });
    });
    await page.goto('/login');
    await page.locator('#identifier').fill('alguien@demo.local');
    await page.locator('#password').fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    const notice = page.locator('#login-error');
    await expect(notice).toContainText('Demasiados intentos fallidos.');
    await expect(notice).toContainText('5 minutos');
    await expect(page.getByText('Usuario o contraseña incorrectos.')).toHaveCount(0);
    await expect(notice.getByRole('link', { name: 'Recupérala aquí' })).toHaveAttribute(
      'href',
      '/olvide-contrasena',
    );
    const button = page.getByRole('button', { name: /Reintenta en \d:\d\d/ });
    await expect(button).toBeDisabled();
    // Los campos siguen habilitados para corregir los datos.
    await expect(page.locator('#identifier')).toBeEnabled();
    await expect(page.locator('#password')).toBeEnabled();
    await expectNoSeriousA11y(page);
  });

  test('sin Retry-After el aviso dice «unos minutos» y el botón sigue habilitado', async ({
    page,
  }) => {
    await page.route('**/auth/login', (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': WEB_ORIGIN,
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': 'content-type,x-portal-csrf,x-actor-id',
            'access-control-allow-methods': 'POST',
          },
        });
      }
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': WEB_ORIGIN,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ statusCode: 429, message: 'x' }),
      });
    });
    await page.goto('/login');
    await page.locator('#identifier').fill('alguien@demo.local');
    await page.locator('#password').fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.locator('#login-error')).toContainText('unos minutos');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });
});

test.describe('API real: límite de intentos y auditoría de fallos', () => {
  test('el 6.º fallo seguido responde 429 con Retry-After y los fallos quedan en la auditoría', async ({
    request,
  }) => {
    const identifier = `e2e-bloqueo-${Date.now()}@demo.local`;
    for (let i = 0; i < 5; i += 1) {
      const res = await request.post(`${API_URL}/auth/login`, {
        data: { identifier, password: 'incorrecta' },
      });
      expect(res.status(), `intento ${i + 1}`).toBe(401);
    }
    const blocked = await request.post(`${API_URL}/auth/login`, {
      data: { identifier, password: 'incorrecta' },
    });
    expect(blocked.status()).toBe(429);
    const retryAfter = Number(blocked.headers()['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    const body = (await blocked.json()) as { message: string };
    expect(body.message).toContain('Demasiados intentos fallidos');

    const audit = await request.get(`${API_URL}/audit-events?action=LOGIN_FAILED&pageSize=100`, {
      headers: { 'X-Actor-Id': 'jefe@demo.local' },
    });
    expect(audit.status()).toBe(200);
    const page = (await audit.json()) as {
      data: Array<{ action: string; objectType: string; objectId: string }>;
    };
    const mine = page.data.filter((e) => e.objectId.startsWith('identificador:'));
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(page.data)).not.toContain(identifier);
  });

  test('forgot-password responde 204 siempre, también al superar el límite', async ({
    request,
  }) => {
    const identifier = `e2e-olvide-${Date.now()}@demo.local`;
    for (let i = 0; i < 5; i += 1) {
      const res = await request.post(`${API_URL}/auth/forgot-password`, {
        data: { identifier },
      });
      expect(res.status(), `solicitud ${i + 1}`).toBe(204);
    }
  });
});

test.describe('Destino tras el login según el rol (modo jwt)', () => {
  test.skip(process.env.E2E_AUTH_MODE !== 'jwt', 'Requiere la API y la web en modo jwt');
  const PASSWORD = process.env.E2E_JWT_PASSWORD ?? '';
  test.skip(PASSWORD === '', 'Requiere E2E_JWT_PASSWORD');
  test.use({ storageState: { cookies: [], origins: [] } });

  async function signIn(page: Page, identifier: string): Promise<void> {
    await page.goto('/login');
    await page.locator('#identifier').fill(identifier);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }

  test('el administrador entra a su primera pantalla, no al Panel', async ({ page }) => {
    await signIn(page, 'admin@demo.local');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).not.toHaveURL(/\/inicio$/);
    await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
    await expect(page.getByText('No tienes acceso a este panel.')).toHaveCount(0);
  });

  test('el jefe sigue entrando al Panel del área', async ({ page }) => {
    await signIn(page, 'jefe@demo.local');
    await expect(page.getByRole('heading', { level: 1, name: 'Panel del área' })).toBeVisible();
    await expect(page).toHaveURL(/\/inicio$/);
  });
});
