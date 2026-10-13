import { expect, test, type Route } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL, y
// un `import type` no lo evalúa.
import type { AuditEvent } from '../apps/web/src/lib/api-client';

/**
 * Auditoría (design §24.2): «Objeto» es un filtro de servidor con las opciones
 * del contrato generado, siempre se piden 500 eventos y una respuesta de 500 no
 * se presenta como total.
 *
 * Usa el storageState del jefe. La petición llega a la API real (autenticación
 * y permisos reales); solo se sustituye el cuerpo de la respuesta con eventos
 * ficticios, así que no crea ni modifica datos.
 */

const TAKE = '500';

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

test('«Objeto» consulta al servidor con el contrato y el tope no se presenta como total', async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/audit-events?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const response = await route.fetch();
    const objectType = params.get('objectType');
    // Sin filtro: justo el tope (500). Con filtro: menos que el tope.
    const json = objectType ? fakeEvents(3, objectType) : fakeEvents(500, 'PROCESS');
    await route.fulfill({ response, json });
  });

  await page.goto('/gobierno/auditoria');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Auditoría' }),
  ).toBeVisible();

  // Carga inicial: sin objectType y con el tope fijo.
  await expect.poll(() => queries.length).toBeGreaterThan(0);
  expect(queries[0].get('objectType')).toBeNull();
  expect(queries[0].get('take')).toBe(TAKE);
  await expect(page.getByText('500 eventos más recientes', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Se muestran los 500 eventos más recientes de tu alcance.', { exact: false }),
  ).toBeVisible();

  // Opciones de «Objeto»: «Todos» más los valores del contrato generado.
  await page.getByRole('combobox', { name: 'Objeto' }).click();
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options).toHaveText([
    'Todos',
    'Proceso',
    'Usuario',
    'Asignación de rol',
    'Elemento de maestra',
  ]);

  const filtered = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/audit-events' &&
      new URL(request.url()).searchParams.get('objectType') === 'CATALOG_ITEM',
  );
  await options.filter({ hasText: 'Elemento de maestra' }).click();
  const request = await filtered;
  expect(new URL(request.url()).searchParams.get('take')).toBe(TAKE);

  // Con menos de 500, el conteo es el total de la consulta y no hay aviso de tope.
  await expect(page.getByText('3 eventos', { exact: true })).toBeVisible();
  await expect(page.getByText('eventos más recientes')).toHaveCount(0);

  // «Limpiar filtros» vuelve a consultar sin objectType.
  const cleared = page.waitForRequest(
    (r) =>
      new URL(r.url()).pathname === '/audit-events' &&
      !new URL(r.url()).searchParams.has('objectType'),
  );
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await cleared;
  await expect(page.getByText('500 eventos más recientes', { exact: true })).toBeVisible();
});

test('con «Objeto» elegido y el tope alcanzado, el aviso no pide usar el filtro', async ({
  page,
}) => {
  await page.route('**/audit-events?**', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const objectType = new URL(route.request().url()).searchParams.get('objectType');
    const response = await route.fetch();
    await route.fulfill({ response, json: fakeEvents(500, objectType ?? 'PROCESS') });
  });
  await page.goto('/gobierno/auditoria');
  await expect(
    page.getByText('Usa el filtro Objeto para acotar la búsqueda.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Objeto' }).click();
  await page.getByRole('listbox').getByRole('option', { name: 'Usuario' }).click();
  await expect(
    page.getByText('Se muestran los 500 eventos más recientes de tu alcance para este objeto.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('Usa el filtro Objeto', { exact: false })).toHaveCount(0);
  await expect(page.getByText('500 eventos más recientes', { exact: true })).toBeVisible();
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
    const objectType = new URL(route.request().url()).searchParams.get('objectType');
    const response = await route.fetch();
    if (objectType) {
      await route.fulfill({ response, json: fakeEvents(3, objectType) });
      return;
    }
    // La consulta sin filtro se retiene hasta que la del filtro ya respondió.
    await initialHeld;
    await route.fulfill({ response, json: fakeEvents(500, 'PROCESS') });
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
  await expect(page.getByText('3 eventos', { exact: true })).toBeVisible();
  await expect(page.getByText('eventos más recientes')).toHaveCount(0);
});
