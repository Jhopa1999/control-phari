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
    action: 'UPDATE',
    objectType,
    objectId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    scopeProcessId: null,
    before: null,
    after: null,
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
