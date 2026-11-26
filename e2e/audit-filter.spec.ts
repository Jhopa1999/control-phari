import { expect, test, type Route } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL, y
// un `import type` no lo evalúa.
import type { AuditEvent } from '../apps/web/src/lib/api-client';

/**
 * Auditoría: «Objeto» es un filtro de servidor con las opciones del contrato
 * generado y la lista se pagina en el servidor (page/pageSize, sin tope fijo).
 * El conteo que se muestra es el total real que devuelve la API.
 *
 * Usa el storageState del jefe. La petición llega a la API real (autenticación
 * y permisos reales); solo se sustituye el cuerpo de la respuesta con eventos
 * ficticios, así que no crea ni modifica datos.
 */

function fakeEvents(count: number, objectType: string): AuditEvent[] {
  const base = Date.parse('2026-10-01T15:00:00.000Z');
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    actorUserId: null,
    actorName: null,
    action: 'UPDATE',
    objectType,
    objectId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    scopeProcessId: null,
    before: null,
    after: null,
    objectCode: null,
    objectLabel: null,
    createdAt: new Date(base - i * 60_000).toISOString(),
  }));
}

/** Cuerpo paginado que devuelve GET /audit-events: { data, page, pageSize, total, hasMore }. */
function pagedBody(params: URLSearchParams, total: number, objectType: string) {
  const page = Number(params.get('page') ?? '1');
  const pageSize = Number(params.get('pageSize') ?? '25');
  const rows = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize));
  return {
    data: fakeEvents(rows, objectType),
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

test('«Objeto» consulta al servidor con el contrato y muestra el total real', async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/audit-events?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const response = await route.fetch();
    const objectType = params.get('objectType');
    // Sin filtro: 120 eventos. Con filtro: solo 3.
    const json = objectType
      ? pagedBody(params, 3, objectType)
      : pagedBody(params, 120, 'PROCESS');
    await route.fulfill({ response, json });
  });

  await page.goto('/gobierno/auditoria');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Auditoría' }),
  ).toBeVisible();

  // Carga inicial: sin objectType, primera página y tamaño de página explícito.
  await expect.poll(() => queries.length).toBeGreaterThan(0);
  expect(queries[0].get('objectType')).toBeNull();
  expect(queries[0].get('page')).toBe('1');
  expect(Number(queries[0].get('pageSize'))).toBeGreaterThan(0);
  expect(queries[0].has('take')).toBe(false);
  await expect(page.getByText('120 eventos', { exact: true })).toBeVisible();

  // Opciones de «Objeto»: «Todos» más los valores del contrato generado.
  await page.getByRole('combobox', { name: 'Objeto' }).click();
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.first()).toHaveText('Todos');
  await expect(options.filter({ hasText: 'Elemento de maestra' })).toHaveCount(1);
  await expect(options.filter({ hasText: 'Usuario' })).toHaveCount(1);

  const filtered = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/audit-events' &&
      new URL(request.url()).searchParams.get('objectType') === 'CATALOG_ITEM',
  );
  await options.filter({ hasText: 'Elemento de maestra' }).click();
  const request = await filtered;
  // Al cambiar el filtro se vuelve a la primera página.
  expect(new URL(request.url()).searchParams.get('page')).toBe('1');
  await expect(page.getByText('3 eventos', { exact: true })).toBeVisible();

  // «Limpiar filtros» vuelve a consultar sin objectType.
  const cleared = page.waitForRequest(
    (r) =>
      new URL(r.url()).pathname === '/audit-events' &&
      !new URL(r.url()).searchParams.has('objectType'),
  );
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await cleared;
  await expect(page.getByText('120 eventos', { exact: true })).toBeVisible();
});

test('una respuesta anterior que llega tarde no pisa la del filtro elegido', async ({
  page,
}) => {
  let releaseInitial: () => void = () => undefined;
  const initialHeld = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  let initialDone: () => void = () => undefined;
  const initialFulfilled = new Promise<void>((resolve) => {
    initialDone = resolve;
  });

  await page.route('**/audit-events?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const params = new URL(route.request().url()).searchParams;
    const objectType = params.get('objectType');
    const response = await route.fetch();
    if (objectType) {
      await route.fulfill({ response, json: pagedBody(params, 3, objectType) });
      return;
    }
    // La consulta sin filtro se retiene hasta que la del filtro ya respondió.
    await initialHeld;
    await route.fulfill({ response, json: pagedBody(params, 120, 'PROCESS') });
    initialDone();
  });

  await page.goto('/gobierno/auditoria');
  await page.getByRole('combobox', { name: 'Objeto' }).click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: 'Elemento de maestra' })
    .click();
  await expect(page.getByText('3 eventos', { exact: true })).toBeVisible();

  releaseInitial();
  await initialFulfilled;
  await page.waitForLoadState('networkidle');
  // La respuesta tardía (120) no reemplaza la del filtro (3).
  await expect(page.getByText('3 eventos', { exact: true })).toBeVisible();
  await expect(page.getByText('120 eventos', { exact: true })).toHaveCount(0);
});

test('«Código del objeto»: uno inválido no consulta; uno válido viaja al servidor y se muestra el chip y la etiqueta', async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/audit-events?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const response = await route.fetch();
    const code = params.get('objectCode');
    if (code === 'ACT-0007') {
      const [event] = fakeEvents(1, 'ASSET');
      await route.fulfill({
        response,
        json: {
          data: [{ ...event, objectCode: 'ACT-0007', objectLabel: 'E2E Contrato marco' }],
          page: 1,
          pageSize: 25,
          total: 1,
          hasMore: false,
        },
      });
      return;
    }
    if (code) {
      await route.fulfill({ response, json: { data: [], page: 1, pageSize: 25, total: 0, hasMore: false } });
      return;
    }
    await route.fulfill({ response, json: pagedBody(params, 5, 'PROCESS') });
  });
  await page.goto('/gobierno/auditoria');
  await expect(page.getByText('5 eventos', { exact: true })).toBeVisible();
  const field = page.getByLabel('Código del objeto');
  // Inválido: error junto al campo y ninguna consulta con objectCode.
  await field.fill('pry-12');
  await expect(field).toHaveValue('PRY-12');
  await page.waitForTimeout(700);
  await field.press('Enter');
  await expect(page.getByText('Escribe un código completo, por ejemplo PRY-0012 o ACT-0007.')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(queries.some((q) => q.has('objectCode'))).toBe(false);
  // Válido: tras la pausa consulta con el código normalizado.
  const withCode = page.waitForRequest(
    (r) => new URL(r.url()).searchParams.get('objectCode') === 'ACT-0007',
  );
  await field.fill('act-0007');
  await withCode;
  await expect(page.getByText('1 evento', { exact: true })).toBeVisible();
  const row = page.getByRole('row', { name: /E2E Contrato marco/ });
  await expect(row.getByRole('button', { name: /Código ACT-0007, copiar/ })).toBeVisible();
  await expect(row.getByText('Activo', { exact: true })).toBeVisible();
  // Sin coincidencia: mismo texto exista o no el objeto fuera del alcance.
  await field.fill('PRY-0099');
  await expect(page.getByText('No hay eventos para PRY-0099 dentro de tu alcance.')).toBeVisible();
  // «Limpiar filtros» vacía el campo y vuelve a consultar sin código.
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(field).toHaveValue('');
  await expect(page.getByText('5 eventos', { exact: true })).toBeVisible();
});

test('abre ya filtrada por código desde un enlace; fechas, actor y chips funcionan', async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/audit-events?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const response = await route.fetch();
    const [event] = fakeEvents(1, 'ASSET');
    await route.fulfill({
      response,
      json: {
        data: [
          {
            ...event,
            actorUserId: '00000000-0000-4000-a000-000000000001',
            actorName: 'Ana E2E',
            objectCode: 'ACT-0007',
            objectLabel: 'E2E Contrato marco',
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
        hasMore: false,
      },
    });
  });
  await page.goto('/gobierno/auditoria?objectCode=act-0007');
  // El código de la URL llega ya aplicado, con su chip y el nombre del actor (no su UUID).
  await expect.poll(() => queries.some((q) => q.get('objectCode') === 'ACT-0007')).toBe(true);
  await expect(page.getByLabel('Código del objeto')).toHaveValue('ACT-0007');
  const chips = page.getByRole('list', { name: 'Filtros activos' });
  await expect(chips.getByText('ACT-0007')).toBeVisible();
  await expect(page.getByRole('row', { name: /E2E Contrato marco/ }).getByText('Ana E2E')).toBeVisible();
  // Las fechas y el proceso están bajo «Más filtros» (design §6: más de cuatro filtros).
  const more = page.getByRole('button', { name: 'Más filtros' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  // Rango invertido: error junto a «Hasta» y ninguna consulta con ese rango.
  await page.getByLabel('Desde', { exact: true }).fill('2026-03-10');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-03-01');
  await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible();
  expect(queries.some((q) => q.get('from') === '2026-03-10' && q.get('to') === '2026-03-01')).toBe(false);
  // Rango válido: viaja from y to, y aparecen sus chips.
  const ranged = page.waitForRequest((r) => {
    const q = new URL(r.url()).searchParams;
    return q.get('from') === '2026-03-01' && q.get('to') === '2026-03-31';
  });
  await page.getByLabel('Hasta', { exact: true }).fill('2026-03-31');
  await page.getByLabel('Desde', { exact: true }).fill('2026-03-01');
  await ranged;
  await expect(chips.getByText('Desde:')).toBeVisible();
  await expect(chips.getByText('Hasta:')).toBeVisible();
  // Quitar el chip de código vuelve a consultar sin él.
  const withoutCode = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/audit-events' && !new URL(r.url()).searchParams.has('objectCode'),
  );
  await page.getByRole('button', { name: /Quitar filtro Código/ }).click();
  await withoutCode;
  await expect(page.getByLabel('Código del objeto')).toHaveValue('');
});
