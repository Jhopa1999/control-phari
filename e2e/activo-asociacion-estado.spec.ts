import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Oleada 2 · PR-C · D8: el estado del activo gobierna las asociaciones.
 * - Un activo en BORRADOR o RETIRADO no se asocia a una solicitud (409).
 * - Un ACTIVO sí; la asociación ya hecha se conserva aunque el activo se retire.
 * - El selector del triage ofrece solo activos ACTIVO.
 *
 * Los datos los crea la propia prueba con el prefijo «E2E asoc».
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const ts = Date.now();

async function call<T = Record<string, unknown>>(
  api: APIRequestContext,
  method: 'post' | 'get',
  path: string,
  body?: Record<string, unknown>,
  expected: number[] = [200, 201],
): Promise<T> {
  const res = await api[method](`${API_URL}${path}`, { headers: JEFE, data: body });
  const text = await res.text();
  expect(expected, `${method} ${path} → ${res.status()} ${text}`).toContain(res.status());
  return (text ? JSON.parse(text) : {}) as T;
}

let processId = '';
let requestId = '';
let borrador = { id: '', name: '' };
let activo = { id: '', name: '' };

test.beforeAll(async ({ request }) => {
  const processes = await call<Array<{ id: string }>>(request, 'get', '/processes');
  processId = processes[0].id;
  const req = await call<{ id: string }>(request, 'post', '/requests', {
    title: `E2E asoc solicitud ${ts}`,
    mainProcessId: processId,
  });
  requestId = req.id;
  await call(request, 'post', `/requests/${requestId}/triage`, { decision: 'CONTINUAR' });
  borrador = { id: '', name: `E2E asoc borrador ${ts}` };
  borrador.id = (await call<{ id: string }>(request, 'post', '/assets', { processId, name: borrador.name })).id;
  activo = { id: '', name: `E2E asoc activo ${ts}` };
  activo.id = (await call<{ id: string }>(request, 'post', '/assets', { processId, name: activo.name })).id;
  await call(request, 'post', `/assets/${activo.id}/status`, { targetStatus: 'ACTIVO' });
});

test('API: un activo en borrador no se asocia (409) y uno activo sí', async ({ request }) => {
  const res = await request.post(`${API_URL}/requests/${requestId}/asset`, {
    headers: JEFE,
    data: { assetId: borrador.id },
  });
  expect(res.status()).toBe(409);
  expect(((await res.json()) as { message: string }).message).toBe(
    'El activo está en borrador; pide al jefe de área que lo active antes de asociarlo.',
  );
  const after = await call<{ assetId: string | null }>(request, 'get', `/requests/${requestId}`);
  expect(after.assetId).toBeNull();

  const ok = await call<{ assetId: string }>(request, 'post', `/requests/${requestId}/asset`, {
    assetId: activo.id,
  });
  expect(ok.assetId).toBe(activo.id);
});

test('API: la asociación hecha se conserva si el activo se retira, y reenviarla no falla; otro retirado se rechaza', async ({
  request,
}) => {
  await call(request, 'post', `/assets/${activo.id}/status`, { targetStatus: 'RETIRADO' });
  const same = await call<{ assetId: string }>(request, 'post', `/requests/${requestId}/asset`, {
    assetId: activo.id,
  });
  expect(same.assetId).toBe(activo.id);
  const res = await request.post(`${API_URL}/requests/${requestId}/asset`, {
    headers: JEFE,
    data: { assetId: borrador.id },
  });
  expect(res.status()).toBe(409);
  // Se recupera para el resto de las pruebas.
  await call(request, 'post', `/assets/${activo.id}/status`, { targetStatus: 'ACTIVO' });
});

test('el selector del triage ofrece los activos activos y al jefe los no asociables, deshabilitados', async ({
  page,
  request,
}) => {
  const req = await call<{ id: string }>(request, 'post', '/requests', {
    title: `E2E asoc triage ${ts}`,
    mainProcessId: processId,
  });
  await call(request, 'post', `/requests/${req.id}/triage`, { decision: 'CONTINUAR' });
  await page.goto(`/demanda/triage?requestId=${encodeURIComponent(req.id)}`);
  const selector = page.getByRole('combobox', { name: 'Activo existente' });
  await expect(selector).toBeVisible({ timeout: 20_000 });
  await selector.click();
  await expect(page.getByRole('option', { name: activo.name })).toBeVisible();
  const blocked = page.getByRole('option', { name: new RegExp(`${borrador.name} · en borrador`) });
  await expect(blocked).toBeVisible();
  await expect(blocked).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('No asociables', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await selector.click();
  await page.getByRole('option', { name: activo.name }).click();
  await page.locator('#triage-asset-base-form').getByRole('button', { name: 'Asociar activo' }).click();
  await expect(page.getByText('Activo base asociado.')).toBeVisible();
});
