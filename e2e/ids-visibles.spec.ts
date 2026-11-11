import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * IDs visibles (PRY-0012, PRY-0012-F2, PRY-0012-T07): el Plan muestra la forma
 * corta, las vistas que mezclan proyectos (Mi trabajo) la completa; el ID se
 * copia con clic y la búsqueda de la lista acepta T07 sin distinguir mayúsculas.
 *
 * Prerrequisito creado por la API real (misma cadena que plan-inline-status):
 * solicitud comprometida con plan, 2 fases y 3 tareas de nombre casi igual, la
 * primera asignada al jefe para que aparezca en Mi trabajo.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const ACTOR = 'jefe@demo.local';
const HEADERS = { 'X-Actor-Id': ACTOR } as const;

async function send(
  api: APIRequestContext,
  method: 'post' | 'patch' | 'get',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await api[method](`${API_URL}${path}`, { headers: HEADERS, data: body });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

const ts = Date.now();
let requestId = '';
let requestCode = '';
const titles = [`Ruta API extractos ${ts}`, `Ruta API vacaciones ${ts}`, `Ruta API certificados ${ts}`];

test.beforeAll(async ({ request }) => {
  const procRes = await request.get(`${API_URL}/processes`, { headers: HEADERS });
  const processes = (await procRes.json()) as Array<{ id: string }>;
  const mainProcessId = processes[0].id;

  const req = await send(request, 'post', '/requests', { title: `E2E ids ${ts}`, mainProcessId });
  requestId = req.id as string;
  requestCode = req.code as string;
  await send(request, 'post', `/requests/${requestId}/triage`, { decision: 'CONTINUAR' });
  const asset = await send(request, 'post', '/assets', { processId: mainProcessId, name: `Activo ids ${ts}` });
  await send(request, 'post', `/requests/${requestId}/asset`, { assetId: asset.id as string });
  await send(request, 'post', `/requests/${requestId}/priority`, {
    impact: 3, alignment: 3, riskControl: 3, urgency: 3, scope: 3, dataAvailability: 3, feasibility: 3, reuse: 3,
  });
  await send(request, 'post', `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  const plan = await send(request, 'post', `/requests/${requestId}/plan`, {});
  const planId = plan.id as string;
  const f1 = await send(request, 'post', `/plans/${planId}/phases`, { name: 'Desarrollo' });
  await send(request, 'post', `/plans/${planId}/phases`, { name: 'Pruebas' });
  const perms = await send(request, 'get', '/me/permissions');
  const t1 = await send(request, 'post', `/phases/${f1.id as string}/tasks`, { title: titles[0] });
  await send(request, 'post', `/phases/${f1.id as string}/tasks`, { title: titles[1] });
  await send(request, 'post', `/phases/${f1.id as string}/tasks`, { title: titles[2] });
  await send(request, 'patch', `/tasks/${t1.id as string}`, { responsibleUserId: perms.userId as string });
});

test.describe('IDs visibles', () => {
  test('el Plan muestra T01..T03 y F1/F2 en forma corta y el código completo en el aria', async ({ page }) => {
    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
    const row = page.getByRole('row', { name: new RegExp(titles[1]) });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Código T02, copiar' })).toHaveText('T02');
    await expect(row.getByRole('button', { name: 'Código T02, copiar' })).toHaveAttribute(
      'data-id-chip',
      `${requestCode}-T02`,
    );
    const phases = page.getByRole('table', { name: /fases/i }).or(page.getByLabel('Tabla de fases'));
    await expect(phases.getByRole('button', { name: 'Código F1, copiar' })).toBeVisible();
    await expect(phases.getByRole('button', { name: 'Código F2, copiar' })).toBeVisible();
  });

  test('buscar por T02 / t2 / código completo filtra la lista', async ({ page }) => {
    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
    const search = page.locator('#task-q');
    await expect(page.getByRole('row', { name: new RegExp(titles[0]) })).toBeVisible();
    for (const q of ['T02', 't2', `${requestCode}-t02`.toLowerCase()]) {
      await search.fill(q);
      await expect(page.getByRole('row', { name: new RegExp(titles[1]) })).toBeVisible();
      await expect(page.getByRole('row', { name: new RegExp(titles[0]) })).toHaveCount(0);
      await expect(page.getByRole('row', { name: new RegExp(titles[2]) })).toHaveCount(0);
    }
  });

  test('clic en el ID lo copia (código completo) y avisa con un toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
    const row = page.getByRole('row', { name: new RegExp(titles[2]) });
    await row.getByRole('button', { name: 'Código T03, copiar' }).click();
    await expect(page.getByText(`Copiado ${requestCode}-T03`)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${requestCode}-T03`);
  });

  test('la hoja de detalle muestra el ID de la tarea', async ({ page }) => {
    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
    await page.getByRole('button', { name: titles[1] }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: 'Código T02, copiar' }).first()).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar detalle' }).first().click();
  });

  test('Mi trabajo muestra la forma completa', async ({ page }) => {
    await page.goto('/mi-trabajo');
    await expect(
      page.getByRole('button', { name: `Código ${requestCode}-T01, copiar` }).first(),
    ).toBeVisible();
  });

  test('Solicitudes muestra el código del proyecto y se busca por él', async ({ page }) => {
    await page.goto('/demanda/solicitudes');
    await page.locator('#sol-buscar').fill(requestCode.toLowerCase());
    await expect(
      page.getByRole('button', { name: `Código ${requestCode}, copiar` }).first(),
    ).toBeVisible();
  });

  test('el chip y la lista del Plan no tienen violaciones serias de accesibilidad', async ({ page }) => {
    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
    await expect(page.getByRole('button', { name: 'Código T01, copiar' })).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('[data-id-chip]')
        .analyze();
      expect(
        violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
        `axe ${scheme}`,
      ).toEqual([]);
    }
  });
});
