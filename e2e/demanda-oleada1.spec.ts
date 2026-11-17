import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Oleada 1 · Demanda (plan de mejora 2.3, 2.4 y 2.5):
 * - Triage: motivo obligatorio (mínimo 10 caracteres) al devolver y rechazar.
 * - Priorización: los ocho criterios nacen «Sin evaluar»; no se guarda sin valorarlos.
 * - Aprobaciones: Aprobar pide confirmación con el resumen de la solicitud.
 *
 * Las solicitudes las crea la propia prueba con el prefijo «E2E demanda».
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const HEADERS = { 'X-Actor-Id': 'jefe@demo.local' } as const;
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

async function send(
  api: APIRequestContext,
  method: 'post' | 'get',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await api[method](`${API_URL}${path}`, { headers: HEADERS, data: body });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

async function mainProcessId(api: APIRequestContext): Promise<string> {
  const res = await api.get(`${API_URL}/processes`, { headers: HEADERS });
  return ((await res.json()) as Array<{ id: string }>)[0].id;
}

async function createRequest(api: APIRequestContext, title: string): Promise<{ id: string; code: string }> {
  const req = await send(api, 'post', '/requests', { title, mainProcessId: await mainProcessId(api) });
  return { id: req.id as string, code: req.code as string };
}

/** Deja la solicitud en EN_TRIAGE con activo, lista para priorizar. */
async function readyToPrioritize(api: APIRequestContext, title: string): Promise<{ id: string; code: string }> {
  const req = await createRequest(api, title);
  await send(api, 'post', `/requests/${req.id}/triage`, { decision: 'CONTINUAR' });
  const asset = await send(api, 'post', '/assets', {
    processId: await mainProcessId(api),
    name: `E2E demanda activo ${title}`,
  });
  // D8: solo un activo ACTIVO admite asociaciones nuevas; el jefe lo activa antes.
  await send(api, 'post', `/assets/${asset.id}/status`, { targetStatus: 'ACTIVO' });
  await send(api, 'post', `/requests/${req.id}/asset`, { assetId: asset.id as string });
  return req;
}

test.describe('Triage: motivo obligatorio', () => {
  test('API: devolver o rechazar sin motivo o con motivo corto responde 400', async ({ request }) => {
    const req = await createRequest(request, `E2E demanda api motivo ${ts}`);
    for (const decision of ['DEVOLVER', 'RECHAZAR']) {
      for (const reason of [undefined, '   ', 'corto']) {
        const res = await request.post(`${API_URL}/requests/${req.id}/triage`, {
          headers: HEADERS,
          data: { decision, ...(reason === undefined ? {} : { reason }) },
        });
        expect(res.status(), `${decision} ${String(reason)}`).toBe(400);
      }
    }
    const ok = await request.post(`${API_URL}/requests/${req.id}/triage`, {
      headers: HEADERS,
      data: { decision: 'RECHAZAR', reason: REASON },
    });
    expect(ok.status()).toBe(201);
    expect(((await ok.json()) as { reason: string }).reason).toBe(REASON);
  });

  test('el formulario exige el motivo, avisa y registra la devolución', async ({ page, request }) => {
    const req = await createRequest(request, `E2E demanda triage ${ts}`);
    await page.goto(`/demanda/triage?requestId=${encodeURIComponent(req.id)}`);
    const submit = page.getByRole('button', { name: 'Guardar triage' });
    await expect(submit).toBeVisible();

    // Con Continuar no hay campo de motivo.
    await page.locator('#triage-decision-CONTINUAR').check({ force: true });
    await expect(page.locator('#triage-reason')).toHaveCount(0);

    await page.locator('#triage-decision-DEVOLVER').check({ force: true });
    await expect(page.locator('#triage-reason')).toBeVisible();
    await expect(page.getByText('Devolver pide al solicitante')).toBeVisible();

    // Motivo vacío.
    await page.getByRole('button', { name: 'Devolver solicitud' }).click();
    await expect(page.getByText('Escribe el motivo de la devolución.')).toBeVisible();
    await expect(page.locator('#triage-reason')).toBeFocused();

    // Motivo corto.
    await page.locator('#triage-reason').fill('corto');
    await page.getByRole('button', { name: 'Devolver solicitud' }).click();
    await expect(page.getByText('El motivo debe tener al menos 10 caracteres.')).toBeVisible();

    // Cambiar a Rechazar conserva el texto y cambia los textos.
    await page.locator('#triage-decision-RECHAZAR').check({ force: true });
    await expect(page.locator('#triage-reason')).toHaveValue('corto');
    await expect(page.getByRole('button', { name: 'Rechazar solicitud' })).toBeVisible();
    await page.locator('#triage-decision-DEVOLVER').check({ force: true });

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);

    await page.locator('#triage-reason').fill(REASON);
    await page.getByRole('button', { name: 'Devolver solicitud' }).click();
    await expect(page.getByText('Triage registrado.')).toBeVisible();

    const triage = (await send(request, 'get', `/requests/${req.id}/triage`)) as {
      triages: Array<{ decision: string; reason: string | null }>;
    };
    expect(triage.triages[0]).toMatchObject({ decision: 'DEVOLVER', reason: REASON });
  });
});

test.describe('Priorización: sin valores por defecto', () => {
  test('API: faltan criterios o hay valores fuera de rango -> 400', async ({ request }) => {
    const req = await readyToPrioritize(request, `E2E demanda prio api ${ts}`);
    const { reuse: _omitted, ...incomplete } = FULL;
    void _omitted;
    for (const body of [{}, incomplete, { ...FULL, impact: 0 }, { ...FULL, impact: 6 }]) {
      const res = await request.post(`${API_URL}/requests/${req.id}/priority`, { headers: HEADERS, data: body });
      expect(res.status()).toBe(400);
    }
    const ok = await request.post(`${API_URL}/requests/${req.id}/priority`, { headers: HEADERS, data: FULL });
    expect(ok.status()).toBe(201);
  });

  test('los ocho criterios empiezan sin evaluar y no se guarda hasta valorarlos', async ({ page, request }) => {
    const req = await readyToPrioritize(request, `E2E demanda prio ui ${ts}`);
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/priority')) posts += 1;
    });
    await page.goto(`/demanda/priorizacion?requestId=${encodeURIComponent(req.id)}`);
    const progress = page.getByTestId('priority-progress');
    await expect(progress).toHaveText('0 de 8 criterios evaluados');
    await expect(page.getByText('Sin evaluar')).toHaveCount(8);
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Guardar evaluación' }).click();
    await expect(page.getByText('Elige una valoración de 1 a 5.')).toHaveCount(8);
    await expect(page.getByText(/Faltan 8 criterios por evaluar: Impacto/)).toBeVisible();
    await expect(page.locator('#priority-impact-1')).toBeFocused();
    expect(posts).toBe(0);

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);

    // Valorar un criterio limpia su error y su «Sin evaluar».
    await page.locator('label:has(#priority-impact-4)').click();
    await expect(page.getByText('Elige una valoración de 1 a 5.')).toHaveCount(7);
    await expect(progress).toHaveText('1 de 8 criterios evaluados');

    for (const key of ['alignment', 'riskControl', 'urgency', 'scope', 'dataAvailability', 'feasibility', 'reuse']) {
      await page.locator(`label:has(#priority-${key}-4)`).click();
    }
    await expect(progress).toHaveText('Los 8 criterios están evaluados.');
    await page.getByRole('button', { name: 'Guardar evaluación' }).click();
    await expect(page.getByText(/Evaluación guardada|score/i).first()).toBeVisible();
    expect(posts).toBe(1);
  });
});

test.describe('Aprobaciones: confirmación al aprobar', () => {
  test('Aprobar pide confirmación con resumen; cancelar no cambia nada y confirmar compromete', async ({
    page,
    request,
  }) => {
    const title = `E2E demanda aprobar ${ts}`;
    const req = await readyToPrioritize(request, title);
    await send(request, 'post', `/requests/${req.id}/priority`, FULL);

    await page.goto('/administracion/revision');
    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toBeVisible();

    // Cancelar: la solicitud sigue en la cola y en backlog.
    await row.getByRole('button', { name: 'Aprobar' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('¿Aprobar el compromiso?')).toBeVisible();
    await expect(dialog.getByTestId('approve-summary')).toContainText(title);
    await expect(dialog.getByTestId('approve-summary')).toContainText(req.code);
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeVisible();
    const after = (await send(request, 'get', `/requests/${req.id}`)) as { operationalState: string };
    expect(after.operationalState).toBe('BACKLOG_PRIORIZADO');

    // Confirmar: pasa a Comprometida y sale de la cola.
    await row.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Aprobar compromiso' }).click();
    await expect(page.getByText('Solicitud aprobada. Pasa a Comprometida.')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
    const done = (await send(request, 'get', `/requests/${req.id}`)) as { operationalState: string };
    expect(done.operationalState).toBe('COMPROMETIDA');
  });
});
