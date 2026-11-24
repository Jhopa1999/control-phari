import { type APIRequestContext, expect, test } from '@playwright/test';
import { createActiveAsset } from './helpers/activo-activo';

/**
 * Oleada 4 · PR E (D20): aprobar solicitudes en lote desde Aprobaciones y marca
 * «aprobada por el creador» en la auditoría.
 *
 * Las solicitudes las crea la propia prueba (prefijo «E2E lote») y llegan a
 * «Backlog priorizado» por el flujo real: triage CONTINUAR, activo ACTIVO (D8)
 * y evaluación de prioridad. Se eliminan al terminar con filtro estricto por los
 * ids creados aquí. No se tocan los usuarios demo.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;
const ts = Date.now();
const FULL = {
  impact: 4,
  alignment: 4,
  riskControl: 4,
  urgency: 4,
  scope: 4,
  dataAvailability: 4,
  feasibility: 4,
  reuse: 4,
};

type Headers = typeof JEFE | typeof LIDER | typeof INTEGRANTE;
interface Created {
  id: string;
  code: string;
  title: string;
}

const created: string[] = [];

async function send<T = Record<string, unknown>>(
  api: APIRequestContext,
  method: 'post' | 'get',
  path: string,
  headers: Headers,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await api[method](`${API_URL}${path}`, { headers, data: body });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Crea una solicitud y la lleva a «Backlog priorizado» por el flujo real. */
async function backlogRequest(
  api: APIRequestContext,
  title: string,
  creator: Headers,
): Promise<Created> {
  const req = await send<{ id: string; code: string }>(api, 'post', '/requests', creator, { title });
  created.push(req.id);
  const processes = await send<Array<{ id: string }>>(api, 'get', '/processes', JEFE);
  const processId = processes[0].id;
  await send(api, 'post', `/requests/${req.id}/triage`, JEFE, {
    decision: 'CONTINUAR',
    mainProcessId: processId,
  });
  const asset = await createActiveAsset(api, { processId, name: `${title} activo` });
  await send(api, 'post', `/requests/${req.id}/asset`, JEFE, { assetId: asset.id });
  await send(api, 'post', `/requests/${req.id}/priority`, JEFE, FULL);
  return { ...req, title };
}

async function stateOf(api: APIRequestContext, id: string): Promise<string> {
  const req = await send<{ operationalState: string }>(api, 'get', `/requests/${id}`, JEFE);
  return req.operationalState;
}

test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) {
    await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
  }
});

test.describe('Aprobar en lote (D20)', () => {
  test('el jefe aprueba varias, una ya cambió y se omite, y queda «aprobada por el creador»', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const slow = expect.configure({ timeout: 30_000 });
    const a = await backlogRequest(request, `E2E lote A ${ts}`, INTEGRANTE);
    const b = await backlogRequest(request, `E2E lote B ${ts}`, INTEGRANTE);
    const c = await backlogRequest(request, `E2E lote C ${ts}`, JEFE);

    await page.goto('/administracion/revision');
    for (const req of [a, b, c]) {
      await slow(page.getByRole('checkbox', { name: `Seleccionar ${req.code}: ${req.title}` })).toBeVisible();
    }
    for (const req of [a, b, c]) {
      await page.getByRole('checkbox', { name: `Seleccionar ${req.code}: ${req.title}` }).check();
    }
    const bar = page.getByRole('region', { name: 'Acciones sobre la selección' });
    await expect(bar).toContainText('3 solicitudes seleccionadas');

    // Mientras el diálogo está abierto, B se aprueba por otra vía: el lote la omite.
    await bar.getByRole('button', { name: 'Aprobar 3 solicitudes' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('¿Aprobar 3 solicitudes?')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    const summary = dialog.getByTestId('approve-batch-summary');
    for (const req of [a, b, c]) {
      await expect(summary).toContainText(req.code);
      await expect(summary).toContainText(req.title);
    }
    await send(request, 'post', `/requests/${b.id}/approval`, JEFE, { decision: 'APROBAR' });
    await dialog.getByRole('button', { name: 'Aprobar 3 solicitudes' }).click();

    const result = page.getByTestId('approve-batch-result');
    await slow(result).toContainText('2 solicitudes aprobadas · 1 omitida(s)');
    await expect(result).toContainText('Ya no está en backlog priorizado.');
    await expect(result).toContainText(b.code);

    expect(await stateOf(request, a.id)).toBe('COMPROMETIDA');
    expect(await stateOf(request, b.id)).toBe('COMPROMETIDA');
    expect(await stateOf(request, c.id)).toBe('COMPROMETIDA');

    // C la creó el jefe: ambos eventos llevan approvedByCreator; A, no.
    const eventsOf = async (code: string) =>
      (
        await send<{ data: Array<{ objectType: string; after: Record<string, unknown> | null }> }>(
          request,
          'get',
          `/audit-events?objectCode=${code}&pageSize=50`,
          JEFE,
        )
      ).data;
    const cEvents = (await eventsOf(c.code)).filter((e) => e.after?.operationalState === 'COMPROMETIDA');
    expect(cEvents.length).toBeGreaterThan(0);
    expect(cEvents.every((e) => e.after?.approvedByCreator === true)).toBe(true);
    const aEvents = (await eventsOf(a.code)).filter((e) => e.after?.operationalState === 'COMPROMETIDA');
    expect(aEvents.length).toBeGreaterThan(0);
    expect(aEvents.some((e) => 'approvedByCreator' in (e.after ?? {}))).toBe(false);
  });

  test('API: el líder no puede aprobar en lote y el servidor valida el lote', async ({ request }) => {
    const denied = await request.post(`${API_URL}/requests/batch-approval`, {
      headers: LIDER,
      data: { requestIds: ['00000000-0000-4000-8000-000000000001'] },
    });
    expect(denied.status()).toBe(403);

    const empty = await request.post(`${API_URL}/requests/batch-approval`, {
      headers: JEFE,
      data: { requestIds: [] },
    });
    expect(empty.status()).toBe(400);

    const repeated = await request.post(`${API_URL}/requests/batch-approval`, {
      headers: JEFE,
      data: {
        requestIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'],
      },
    });
    expect(repeated.status()).toBe(400);

    const unknown = await send<{
      results: Array<{ code: string | null; status: string; reason: string | null }>;
      approved: number;
      skipped: number;
    }>(request, 'post', '/requests/batch-approval', JEFE, {
      requestIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(unknown.approved).toBe(0);
    expect(unknown.skipped).toBe(1);
    expect(unknown.results[0]).toMatchObject({ code: null, status: 'OMITIDA', reason: 'No encontrada.' });
  });

  test('el líder ve la cola sin casillas ni barra de lote', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.addInitScript(() => window.localStorage.setItem('actorId', 'lider@demo.local'));
    await page.goto('/administracion/revision');
    await expect(page.getByRole('heading', { name: 'Aprobaciones' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Seleccionar/ })).toHaveCount(0);
    await ctx.close();
  });
});
