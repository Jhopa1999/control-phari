import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { paginationHeaders, serveRequestList } from './helpers/server-list-mock';

/**
 * Oleada 3, PR-B: patrón único de listado paginado en el servidor
 * (docs/design/oleada-3-listados.md).
 *
 * - API real: page/pageSize, q, X-Total-Count, alcance por rol y compatibilidad
 *   sin parámetros (sigue devolviendo el arreglo completo).
 * - Interfaz (fixture servido con el mismo contrato que la API): la recarga
 *   conserva la tabla sin atenuar, con aria-busy, y axe no marca
 *   color-contrast durante una recarga lenta en claro y oscuro; el foco de la
 *   paginación no se pierde.
 *
 * Datos: solicitudes y activos con prefijo «E2E listados»; las solicitudes se
 * eliminan (borrado lógico) al terminar. No toca usuarios demo.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;
/** Carpeta opcional para las capturas de revisión (fuera del repo). */
const CAPTURE_DIR = process.env.E2E_CAPTURE_DIR;

interface RequestRow {
  id: string;
  code: string;
  title: string;
  mainProcessName: string | null;
  assetName: string | null;
}

test.describe('API: listados paginados', () => {
  const tag = `E2E listados ${Date.now().toString(36)}`;
  const created: string[] = [];

  test.beforeAll(async ({ request }) => {
    for (const n of [1, 2, 3]) {
      const res = await request.post(`${API_URL}/requests`, {
        headers: JEFE,
        data: { title: `${tag} solicitud ${n}` },
      });
      expect(res.status()).toBe(201);
      created.push(((await res.json()) as RequestRow).id);
    }
  });

  test.afterAll(async ({ request }) => {
    for (const id of created) {
      await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
    }
  });

  test('page/pageSize, q y X-Total-Count; sin parámetros el arreglo completo como antes', async ({
    request,
  }) => {
    const q = encodeURIComponent(tag);
    const page2 = await request.get(`${API_URL}/requests?q=${q}&pageSize=2&page=2&sort=title&dir=asc`, {
      headers: JEFE,
    });
    expect(page2.ok()).toBeTruthy();
    const rows = (await page2.json()) as RequestRow[];
    expect(rows.map((r) => r.title)).toEqual([`${tag} solicitud 3`]);
    expect(page2.headers()['x-total-count']).toBe('3');
    expect(page2.headers()['x-page']).toBe('2');
    expect(page2.headers()['x-page-size']).toBe('2');
    // BL-039: los campos de lo referenciado existen aunque estén vacíos.
    expect(rows[0]).toMatchObject({ mainProcessName: null, mainProcessCode: null, assetName: null });

    // q también busca por el código visible.
    const byCode = await request.get(
      `${API_URL}/requests?q=${encodeURIComponent(rows[0].code)}&pageSize=5`,
      { headers: JEFE },
    );
    expect(((await byCode.json()) as RequestRow[]).map((r) => r.id)).toContain(rows[0].id);

    // Compatibilidad: sin parámetros llega un arreglo con las tres (hasta 1000).
    const all = await request.get(`${API_URL}/requests`, { headers: JEFE });
    expect(all.ok()).toBeTruthy();
    const ids = ((await all.json()) as RequestRow[]).map((r) => r.id);
    for (const id of created) expect(ids).toContain(id);
    expect(Number(all.headers()['x-total-count'])).toBeGreaterThanOrEqual(3);
    expect(['true', 'false']).toContain(all.headers()['x-truncated']);
  });

  test('alcance por rol: el total del integrante no incluye lo que no ve', async ({ request }) => {
    const q = encodeURIComponent(tag);
    const lider = await request.get(`${API_URL}/requests?q=${q}&pageSize=10`, { headers: LIDER });
    expect(lider.headers()['x-total-count']).toBe('3');
    // Sin proceso y creadas por el jefe: el integrante no las ve ni las cuenta.
    const integrante = await request.get(`${API_URL}/requests?q=${q}&pageSize=10`, {
      headers: INTEGRANTE,
    });
    expect(integrante.ok()).toBeTruthy();
    expect(await integrante.json()).toEqual([]);
    expect(integrante.headers()['x-total-count']).toBe('0');
    // Portafolio comparte el alcance de Solicitudes.
    const portfolio = await request.get(`${API_URL}/portfolio?q=${q}&pageSize=10`, { headers: INTEGRANTE });
    expect(portfolio.headers()['x-total-count']).toBe('0');
    const portfolioJefe = await request.get(`${API_URL}/portfolio?q=${q}&pageSize=10`, { headers: JEFE });
    expect(portfolioJefe.headers()['x-total-count']).toBe('3');
  });

  test('validación: pageSize mayor que 100 y sort fuera de la lista blanca → 400', async ({
    request,
  }) => {
    expect((await request.get(`${API_URL}/requests?pageSize=101`, { headers: JEFE })).status()).toBe(400);
    expect((await request.get(`${API_URL}/requests?sort=requesterName`, { headers: JEFE })).status()).toBe(400);
    expect((await request.get(`${API_URL}/assets?pageSize=0`, { headers: JEFE })).status()).toBe(400);
  });

  test('activos: q por nombre, página y nombre/código del proceso', async ({ request }) => {
    const processes = (await (await request.get(`${API_URL}/processes`, { headers: JEFE })).json()) as {
      id: string;
      code: string;
      name: string;
    }[];
    const process = processes[0];
    for (const n of [1, 2]) {
      const res = await request.post(`${API_URL}/assets`, {
        headers: JEFE,
        data: { processId: process.id, name: `${tag} activo ${n}` },
      });
      expect(res.status()).toBe(201);
    }
    const res = await request.get(
      `${API_URL}/assets?q=${encodeURIComponent(tag)}&pageSize=1&page=1&sort=name&dir=desc`,
      { headers: JEFE },
    );
    expect(res.headers()['x-total-count']).toBe('2');
    const [first] = (await res.json()) as { name: string; processName: string; processCode: string }[];
    expect(first).toMatchObject({
      name: `${tag} activo 2`,
      processName: process.name,
      processCode: process.code,
    });
    // take (obsoleto) sigue limitando como antes.
    const legacy = await request.get(`${API_URL}/assets?q=${encodeURIComponent(tag)}&take=1`, {
      headers: JEFE,
    });
    expect(((await legacy.json()) as unknown[]).length).toBe(1);
  });
});

// Fixture de 30 solicitudes servido con el contrato real (filtros, orden, página y total).
function fakeRequest(i: number): Record<string, unknown> {
  const n = String(i).padStart(2, '0');
  const at = new Date(Date.UTC(2026, 0, i, 12)).toISOString();
  return {
    id: `00000000-0000-4000-8000-0000000005${n}`,
    code: `PRY-95${n}`,
    title: `Listado e2e ${n}`,
    registeredAt: at,
    createdAt: at,
    updatedAt: at,
    requesterArea: null,
    requesterId: null,
    requesterName: null,
    functionalOwner: null,
    targetDate: null,
    referenceUrl: null,
    expectedResult: null,
    initialCommitmentDate: null,
    changeJustification: null,
    mainProcessId: null,
    mainProcessCode: null,
    mainProcessName: null,
    assetId: null,
    assetName: null,
    createdByUserId: null,
    participants: [],
    operationalState: i % 2 === 0 ? 'REGISTRADA' : 'EN_TRIAGE',
    currentTriageDecision: null,
    currentTriageReason: null,
    currentTriageDecidedAt: null,
    currentScore: null,
    priorityLabel: null,
  };
}
const FIXTURE = Array.from({ length: 30 }, (_, i) => fakeRequest(i + 1)) as unknown as Parameters<
  typeof serveRequestList
>[0];

/** Sirve el fixture; tras la primera respuesta, retrasa las siguientes `delayMs`. */
async function mockRequests(page: Page, delayMs = 0): Promise<void> {
  let served = 0;
  await page.route(
    (url) => url.pathname.endsWith('/requests'),
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const result = serveRequestList(FIXTURE, new URL(route.request().url()));
      served += 1;
      if (served > 1 && delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      await route.fulfill({
        response,
        json: result.rows,
        headers: { ...response.headers(), ...paginationHeaders(result.total) },
      });
    },
  );
}

async function setTheme(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
}

function countOf(page: Page) {
  return page.locator('[role="group"][aria-label="Filtros de solicitudes"] [role="status"]');
}

test.describe('Solicitudes: listado en el servidor', () => {
  test('la recarga con filtro conserva la tabla sin atenuar y sin color-contrast (claro y oscuro)', async ({
    page,
  }) => {
    await mockRequests(page, 2500);
    await page.goto('/demanda/solicitudes');
    const region = page.getByRole('region', { name: 'Tabla de solicitudes' });
    await expect(countOf(page)).toHaveText('30 solicitudes');
    await expect(region.getByRole('row')).toHaveCount(26);

    for (const scheme of ['light', 'dark'] as const) {
      await setTheme(page, scheme);
      // Recarga lenta: cambia la búsqueda y la respuesta tarda 2,5 s.
      await page.locator('#sol-buscar').fill(scheme === 'light' ? 'Listado e2e 1' : 'Listado e2e');
      await expect(countOf(page)).toHaveText('Cargando solicitudes…');
      const busy = page.locator('[aria-busy="true"]').filter({ has: region });
      await expect(busy).toHaveCount(1);
      // La tabla anterior sigue a la vista (no parpadea a vacío ni a esqueleto).
      expect(await region.getByRole('row').count()).toBeGreaterThan(1);
      await expect(page.getByText('Aún no hay solicitudes.')).toHaveCount(0);
      // Sin atenuación: ningún ancestro de la tabla con opacidad < 1.
      const dimmed = await region.evaluate((el) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (Number(getComputedStyle(node).opacity) < 1) return true;
        }
        return false;
      });
      expect(dimmed, `tema ${scheme}`).toBe(false);
      // La barra de recarga aparece pasados 400 ms.
      await expect(page.getByTestId('recarga-listado')).toBeVisible();
      // Solo el contenido del listado: la insignia de la campana del encabezado
      // en tema oscuro tiene su propia corrección (oleada 3, PR-C).
      const { violations } = await new AxeBuilder({ page })
        .include('main#contenido')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        violations
          .filter((v) => v.id === 'color-contrast')
          .flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`)),
        `color-contrast durante la recarga, tema ${scheme}`,
      ).toEqual([]);
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(blocking.map((v) => `${v.id} (${v.impact})`), `tema ${scheme}`).toEqual([]);
      await expect(countOf(page)).not.toHaveText('Cargando solicitudes…', { timeout: 10_000 });
    }
    // «Listado e2e» coincide con las 30; «Listado e2e 1» con 01 y 10..19.
    await expect(countOf(page)).toHaveText('30 solicitudes');
    await setTheme(page, 'light');
  });

  test('paginación: «Mostrando», salto de página y el foco no se pierde en el límite', async ({
    page,
  }) => {
    const urls: URL[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith('/requests') && req.method() === 'GET') urls.push(url);
    });
    await mockRequests(page);
    await page.goto('/demanda/solicitudes');
    const nav = page.getByRole('navigation', { name: 'Paginación de solicitudes' });
    await expect(nav).toContainText('Mostrando 1–25 de 30 solicitudes');
    await expect(nav).toContainText('Página 1 de 2');
    // El listado pide la página al servidor (page/pageSize) y no la lista entera.
    expect(urls.some((u) => u.searchParams.get('page') === '1' && u.searchParams.get('pageSize') === '25')).toBe(true);

    const next = nav.getByRole('button', { name: 'Página siguiente' });
    const previous = nav.getByRole('button', { name: 'Página anterior' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(nav).toContainText('Mostrando 26–30 de 30 solicitudes');
    await expect(nav).toContainText('Página 2 de 2');
    await expect(next).toBeDisabled();
    // Límite natural: el foco pasa al otro botón, nunca a body.
    await expect(previous).toBeFocused();
    expect(urls.some((u) => u.searchParams.get('page') === '2')).toBe(true);

    // Un filtro nuevo vuelve a la página 1.
    await page.locator('#sol-filtro-estado').click();
    await page.getByRole('menuitemcheckbox', { name: 'Registrada', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(countOf(page)).toHaveText('15 solicitudes');
    await expect(nav).toContainText('Página 1 de 1');
    const last = urls[urls.length - 1];
    expect(last.searchParams.get('page')).toBe('1');
    expect(last.searchParams.getAll('state')).toEqual(['REGISTRADA']);
  });

  test('capturas de revisión 1440 y 390 en claro y oscuro', async ({ page }) => {
    test.skip(!CAPTURE_DIR, 'Solo con E2E_CAPTURE_DIR (revisión visual a ojo).');
    test.setTimeout(180_000);
    await mockRequests(page);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const scheme of ['light', 'dark'] as const) {
        for (const path of ['/demanda/solicitudes', '/seguimiento/portafolio', '/activos/catalogo', '/activos/documentos']) {
          // Una navegación del cliente en curso puede abortar el goto: se reintenta una vez.
          await page.goto(path).catch(() => page.goto(path));
          await setTheme(page, scheme);
          await expect(page.locator('[role="status"]').first()).not.toHaveText(/Cargando/);
          const name = path.split('/').pop();
          await page.screenshot({ path: `${CAPTURE_DIR}/${name}-${width}-${scheme}.png`, fullPage: true });
        }
      }
    }
  });
});

