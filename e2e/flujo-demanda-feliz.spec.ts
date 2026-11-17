import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { createActiveAsset } from './helpers/activo-activo';

/**
 * Flujo feliz de la demanda (plan de mejora, dependencia de la oleada 2):
 * registro (integrante) → triage Continuar con proceso y activo (jefe) →
 * priorización con los ocho criterios → aprobación con confirmación →
 * estado «Comprometida».
 *
 * Protege Triage, Priorización y Aprobaciones frente a cambios de estados y
 * permisos. Los datos los crea la propia prueba con el prefijo «E2E flujo»; la
 * solicitud se elimina lógicamente al terminar (solo mientras está viva) y no
 * se tocan los usuarios demo.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const ts = Date.now();
const TITLE = `E2E flujo feliz ${ts}`;
const ASSET_NAME = `E2E flujo activo ${ts}`;
const CRITERIA = ['impact', 'alignment', 'riskControl', 'urgency', 'scope', 'dataAvailability', 'feasibility', 'reuse'];

async function actAs(page: Page, identifier: string): Promise<void> {
  await page.addInitScript((id) => window.localStorage.setItem('actorId', id), identifier);
}

async function apiJson<T>(api: APIRequestContext, path: string, headers = JEFE): Promise<T> {
  const res = await api.get(`${API_URL}${path}`, { headers });
  expect(res.ok(), `GET ${path} → ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.map((v) => v.id);
}

test.describe('Flujo feliz de la demanda', () => {
  test('registro → triage → priorización → aprobación → Comprometida', async ({ browser, request }) => {
    // Recorre cuatro pantallas; en `next dev` la primera visita compila la ruta.
    test.setTimeout(240_000);
    const slow = expect.configure({ timeout: 30_000 });
    const processes = await apiJson<Array<{ id: string; name: string }>>(request, '/processes');
    const process = processes[0];
    // D8: el activo nace en borrador; el jefe lo activa para poder asociarlo en el triage.
    await createActiveAsset(request, { processId: process.id, name: ASSET_NAME });

    // 1. Registro: el integrante crea la solicitud desde la pantalla.
    const memberCtx = await browser.newContext({ storageState: undefined });
    const memberPage = await memberCtx.newPage();
    await actAs(memberPage, 'integrante@demo.local');
    await memberPage.goto('/demanda/solicitudes');
    await memberPage.getByRole('button', { name: 'Nueva solicitud' }).first().click();
    await memberPage.locator('#sol-title').fill(TITLE);
    await memberPage.getByRole('button', { name: 'Registrar solicitud' }).click();
    await slow(memberPage.getByRole('dialog', { name: 'Nueva solicitud' })).toHaveCount(0);
    await slow(memberPage.getByText(TITLE).first()).toBeVisible();
    await memberCtx.close();

    const list = await apiJson<Array<{ id: string; code: string; title: string; operationalState: string }>>(
      request,
      '/requests',
    );
    const created = list.find((r) => r.title === TITLE);
    expect(created, 'la solicitud registrada aparece en el listado').toBeDefined();
    const req = created as { id: string; code: string; operationalState: string };
    expect(req.operationalState).toBe('REGISTRADA');

    const jefeCtx = await browser.newContext();
    const page = await jefeCtx.newPage();
    try {
      // 2. Triage: el jefe elige proceso y activo y continúa.
      await page.goto(`/demanda/triage?requestId=${encodeURIComponent(req.id)}`);
      await slow(page.getByRole('button', { name: 'Guardar triage' })).toBeVisible();
      await page.locator('#triage-main-process').click();
      await page.getByRole('option', { name: process.name, exact: true }).click();
      await page.locator('#triage-asset').click();
      await page.getByRole('option', { name: ASSET_NAME }).click();
      await page.locator('label:has(#triage-decision-CONTINUAR)').click();
      await slow(page.locator('#triage-decision-CONTINUAR')).toBeChecked();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Guardar triage' }).click();
      await slow(page.getByText('Triage registrado.')).toBeVisible();
      const triaged = await apiJson<{ operationalState: string; assetId: string | null; mainProcessId: string | null }>(
        request,
        `/requests/${req.id}`,
      );
      expect(triaged).toMatchObject({ operationalState: 'EN_TRIAGE', mainProcessId: process.id });
      expect(triaged.assetId).not.toBeNull();

      // 3. Priorización: ocho criterios valorados.
      await page.goto(`/demanda/priorizacion?requestId=${encodeURIComponent(req.id)}`);
      await slow(page.getByTestId('priority-progress')).toHaveText('0 de 8 criterios evaluados');
      for (const key of CRITERIA) {
        await page.locator(`label:has(#priority-${key}-4)`).click();
      }
      await slow(page.getByTestId('priority-progress')).toHaveText('Los 8 criterios están evaluados.');
      await page.getByRole('button', { name: 'Guardar evaluación' }).click();
      await expect
        .poll(async () => (await apiJson<{ operationalState: string }>(request, `/requests/${req.id}`)).operationalState, {
          timeout: 30_000,
        })
        .toBe('BACKLOG_PRIORIZADO');
      const prioritized = await apiJson<{ currentScore: number | null }>(request, `/requests/${req.id}`);
      expect(prioritized.currentScore).toBe(80);

      // 4. Aprobación: confirmar compromete la solicitud.
      await page.goto('/administracion/revision');
      const row = page.getByRole('row', { name: new RegExp(TITLE) });
      await slow(row).toBeVisible();
      await row.getByRole('button', { name: 'Aprobar' }).click();
      const dialog = page.getByRole('alertdialog');
      await slow(dialog.getByTestId('approve-summary')).toContainText(req.code);
      expect(await axeViolations(page)).toEqual([]);
      await dialog.getByRole('button', { name: 'Aprobar compromiso' }).click();
      await slow(page.getByText('Solicitud aprobada. Pasa a Comprometida.')).toBeVisible();
      const done = await apiJson<{ operationalState: string }>(request, `/requests/${req.id}`);
      expect(done.operationalState).toBe('COMPROMETIDA');
    } finally {
      await jefeCtx.close();
    }
  });
});

// Limpieza con filtro estricto: solo la solicitud con el título único de esta
// ejecución. Va en afterEach para cubrir también un fallo durante el registro.
test.afterEach(async ({ request }) => {
  const res = await request.get(`${API_URL}/requests`, { headers: JEFE });
  if (!res.ok()) return;
  const mine = ((await res.json()) as Array<{ id: string; title: string }>).filter((r) => r.title === TITLE);
  for (const r of mine) {
    await request.delete(`${API_URL}/requests/${r.id}`, { headers: JEFE });
  }
});
