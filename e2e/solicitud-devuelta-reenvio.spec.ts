import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { createActiveAsset } from './helpers/activo-activo';

/**
 * Oleada 2 · Demanda (PR-A, D3 y D4):
 * - Una solicitud devuelta muestra el motivo al solicitante y le deja «Reenviar
 *   a triage»: vuelve a Registrada, el triage anterior se conserva y el jefe
 *   decide de nuevo.
 * - Quién edita una solicitud depende de su estado, y desde «Comprometida» la
 *   edición exige justificación.
 *
 * Las solicitudes las crea la propia prueba con el prefijo «E2E reenvío» y se
 * eliminan al terminar (filtro estricto por los ids creados aquí).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;
const ts = Date.now();
const REASON = 'Falta definir el alcance y el resultado esperado.';
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
const created: string[] = [];

type Headers = typeof JEFE | typeof INTEGRANTE;

async function send<T = Record<string, unknown>>(
  api: APIRequestContext,
  method: 'post' | 'get' | 'patch',
  path: string,
  headers: Headers,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await api[method](`${API_URL}${path}`, { headers, data: body });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function firstProcessId(api: APIRequestContext): Promise<string> {
  const processes = await send<Array<{ id: string }>>(api, 'get', '/processes', JEFE);
  return processes[0].id;
}

/** El integrante registra una solicitud y el jefe la devuelve en triage con motivo. */
async function returnedRequest(api: APIRequestContext, title: string): Promise<{ id: string; code: string }> {
  const req = await send<{ id: string; code: string }>(api, 'post', '/requests', INTEGRANTE, { title });
  created.push(req.id);
  await send(api, 'post', `/requests/${req.id}/triage`, JEFE, { decision: 'DEVOLVER', reason: REASON });
  return req;
}

async function actAs(page: Page, identifier: string): Promise<void> {
  await page.addInitScript((id) => window.localStorage.setItem('actorId', id), identifier);
}

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

// afterEach (no afterAll): si una prueba falla, Playwright reinicia el worker y
// una lista acumulada para afterAll se perdería con sus solicitudes.
test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) {
    await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
  }
});

test.describe('Devuelta → Reenviar a triage (D3)', () => {
  test('el solicitante ve el motivo, reenvía y el jefe vuelve a decidir con el historial conservado', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const slow = expect.configure({ timeout: 30_000 });
    const req = await returnedRequest(request, `E2E reenvío flujo ${ts}`);

    // El solicitante ve la decisión y el motivo sin notas internas, y puede reenviar.
    const memberCtx = await browser.newContext({ storageState: undefined });
    const member = await memberCtx.newPage();
    await actAs(member, 'integrante@demo.local');
    await member.goto(`/demanda/solicitudes/${req.id}`);
    const band = member.getByRole('note').filter({ hasText: 'Solicitud devuelta' });
    await slow(band).toBeVisible();
    await slow(band).toContainText(REASON);
    // Banda de devolución y etapa Triage (decisión y motivo, sin notas internas).
    await slow(member.getByText(REASON)).toHaveCount(2);
    expect(await axeViolations(member)).toEqual([]);

    await band.getByRole('button', { name: 'Reenviar a triage' }).click();
    const dialog = member.getByRole('alertdialog');
    await slow(dialog.getByText('¿Reenviar a triage?')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Reenviar a triage' }).click();
    await slow(member.getByText('Solicitud reenviada a triage.')).toBeVisible();
    await memberCtx.close();

    const resubmitted = await send<{ operationalState: string }>(request, 'get', `/requests/${req.id}`, JEFE);
    expect(resubmitted.operationalState).toBe('REGISTRADA');

    // El jefe ve la solicitud como reenviada, con la decisión anterior, y decide de nuevo.
    const jefeCtx = await browser.newContext();
    const jefe = await jefeCtx.newPage();
    await jefe.goto(`/demanda/triage?requestId=${encodeURIComponent(req.id)}`);
    await slow(jefe.getByText('Decisión anterior: Devuelta')).toBeVisible();
    await slow(jefe.getByText('Reenviada').first()).toBeVisible();
    expect(await axeViolations(jefe)).toEqual([]);

    const processId = await firstProcessId(request);
    await send(request, 'post', `/requests/${req.id}/triage`, JEFE, { decision: 'CONTINUAR', mainProcessId: processId });
    const triages = await send<{ triages: Array<{ decision: string }> }>(request, 'get', `/requests/${req.id}/triage`, JEFE);
    expect(triages.triages.map((t) => t.decision)).toEqual(['CONTINUAR', 'DEVOLVER']);

    await jefe.goto(`/demanda/solicitudes/${req.id}`);
    await slow(jefe.getByText('Decisiones anteriores')).toBeVisible();
    await jefeCtx.close();
  });

  test('API: solo se reenvía una solicitud devuelta y editarla no cambia su estado', async ({ request }) => {
    const req = await returnedRequest(request, `E2E reenvío api ${ts}`);

    const edit = await request.patch(`${API_URL}/requests/${req.id}`, {
      headers: INTEGRANTE,
      data: { title: `E2E reenvío api corregida ${ts}` },
    });
    expect(edit.status()).toBe(200);
    expect(((await edit.json()) as { operationalState: string }).operationalState).toBe('DEVUELTA');

    const ok = await request.post(`${API_URL}/requests/${req.id}/resubmit`, { headers: INTEGRANTE, data: {} });
    expect(ok.status()).toBe(200);
    const again = await request.post(`${API_URL}/requests/${req.id}/resubmit`, { headers: INTEGRANTE, data: {} });
    expect(again.status()).toBe(409);
    expect(((await again.json()) as { message: string }).message).toBe(
      'Solo se puede reenviar a triage una solicitud devuelta.',
    );
  });
});

test.describe('Edición por estado (D4)', () => {
  test('el creador deja de editar tras el triage y desde Comprometida se exige justificación', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const slow = expect.configure({ timeout: 30_000 });
    const title = `E2E reenvío edición ${ts}`;
    const req = await send<{ id: string; code: string }>(request, 'post', '/requests', INTEGRANTE, { title });
    created.push(req.id);

    // Registrada: el creador edita.
    const own = await request.patch(`${API_URL}/requests/${req.id}`, { headers: INTEGRANTE, data: { title } });
    expect(own.status()).toBe(200);

    // En triage: solo líder o jefe (403 en español para el creador).
    const processId = await firstProcessId(request);
    await send(request, 'post', `/requests/${req.id}/triage`, JEFE, { decision: 'CONTINUAR', mainProcessId: processId });
    const denied = await request.patch(`${API_URL}/requests/${req.id}`, { headers: INTEGRANTE, data: { title } });
    expect(denied.status()).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toBe(
      'Solo el líder del proceso o el jefe de área pueden editar una solicitud en este estado.',
    );

    // Comprometida: el jefe necesita justificación.
    const asset = await createActiveAsset(request, { processId, name: `E2E reenvío activo ${ts}` });
    await send(request, 'post', `/requests/${req.id}/asset`, JEFE, { assetId: asset.id });
    await send(request, 'post', `/requests/${req.id}/priority`, JEFE, FULL);
    await send(request, 'post', `/requests/${req.id}/approval`, JEFE, { decision: 'APROBAR' });
    const noJustification = await request.patch(`${API_URL}/requests/${req.id}`, { headers: JEFE, data: { title: `${title} v2` } });
    expect(noJustification.status()).toBe(400);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/demanda/solicitudes');
    await page.locator('#sol-buscar').fill(req.code);
    await page.getByRole('button', { name: title }).first().click();
    const form = page.getByRole('dialog', { name: 'Editar solicitud' });
    await slow(form.getByText('Esta solicitud ya está comprometida.')).toBeVisible();
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await slow(form.getByText('Escribe la justificación del cambio.')).toBeVisible();
    await expect(form.locator('#sol-justification')).toBeFocused();
    expect(await axeViolations(page)).toEqual([]);

    await form.locator('#sol-justification').fill('corto');
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await slow(form.getByText('La justificación debe tener al menos 10 caracteres.')).toBeVisible();

    await form.locator('#sol-justification').fill('Se ajusta el título por acuerdo con el solicitante.');
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await slow(page.getByText('Solicitud actualizada.')).toBeVisible();
    await ctx.close();

    const after = await send<{ changeJustification: string }>(request, 'get', `/requests/${req.id}`, JEFE);
    expect(after.changeJustification).toBe('Se ajusta el título por acuerdo con el solicitante.');
  });
});
