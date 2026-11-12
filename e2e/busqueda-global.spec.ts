import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Búsqueda global por ID visible (docs/design/busqueda-global-id.md, BL-047) e
 * IdChip en Triage, Aprobaciones y Capacidad (BL-042/044). El Panel y el Reporte
 * semanal no listan solicitudes ni tareas individuales (solo conteos y texto),
 * por lo que no llevan chip.
 *
 * Prerrequisito creado por la API real: una solicitud comprometida con plan, 2
 * fases y 2 tareas; una solicitud con triage y priorización hechos que espera
 * aprobación; y una solicitud nueva sin triage.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const ACTOR = 'jefe@demo.local';
const HEADERS = { 'X-Actor-Id': ACTOR } as const;
const SEARCH = 'Buscar por código';

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
const PRIORITY = {
  impact: 3, alignment: 3, riskControl: 3, urgency: 3, scope: 3, dataAvailability: 3, feasibility: 3, reuse: 3,
};
let mainProcessId = '';
let requestId = '';
let requestCode = '';
let phaseId = '';
let pendingApprovalCode = '';
let untriagedCode = '';
const taskTitle = `Tarea búsqueda ${ts}`;

async function createRequest(api: APIRequestContext, title: string): Promise<Record<string, unknown>> {
  return send(api, 'post', '/requests', { title, mainProcessId });
}

test.beforeAll(async ({ request }) => {
  const procRes = await request.get(`${API_URL}/processes`, { headers: HEADERS });
  mainProcessId = ((await procRes.json()) as Array<{ id: string }>)[0].id;

  const req = await createRequest(request, `E2E búsqueda ${ts}`);
  requestId = req.id as string;
  requestCode = req.code as string;
  await send(request, 'post', `/requests/${requestId}/triage`, { decision: 'CONTINUAR' });
  const asset = await send(request, 'post', '/assets', { processId: mainProcessId, name: `Activo búsqueda ${ts}` });
  await send(request, 'post', `/requests/${requestId}/asset`, { assetId: asset.id as string });
  await send(request, 'post', `/requests/${requestId}/priority`, PRIORITY);
  await send(request, 'post', `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  const plan = await send(request, 'post', `/requests/${requestId}/plan`, {});
  const planId = plan.id as string;
  const f1 = await send(request, 'post', `/plans/${planId}/phases`, { name: 'Desarrollo' });
  phaseId = f1.id as string;
  await send(request, 'post', `/plans/${planId}/phases`, { name: 'Pruebas' });
  await send(request, 'post', `/phases/${phaseId}/tasks`, { title: taskTitle });

  // Con triage y priorización hechos, espera la aprobación (Aprobaciones).
  const pending = await createRequest(request, `E2E pendiente de aprobar ${ts}`);
  pendingApprovalCode = pending.code as string;
  const pendingId = pending.id as string;
  await send(request, 'post', `/requests/${pendingId}/triage`, { decision: 'CONTINUAR' });
  const pendingAsset = await send(request, 'post', '/assets', { processId: mainProcessId, name: `Activo pendiente ${ts}` });
  await send(request, 'post', `/requests/${pendingId}/asset`, { assetId: pendingAsset.id as string });
  await send(request, 'post', `/requests/${pendingId}/priority`, PRIORITY);

  // Sin triage todavía (bandeja de Triage).
  untriagedCode = (await createRequest(request, `E2E sin triage ${ts}`)).code as string;
});

function search(page: import('@playwright/test').Page) {
  return page.getByRole('combobox', { name: SEARCH });
}

test.describe('Búsqueda global por ID (escritorio)', () => {
  test('PRY-xxxx abre la ficha de la solicitud', async ({ page }) => {
    await page.goto('/inicio');
    await search(page).fill(requestCode.toLowerCase());
    const option = page.getByRole('option').first();
    await expect(option).toContainText(`E2E búsqueda ${ts}`);
    await expect(option).toContainText('Solicitud');
    await search(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/demanda/solicitudes/${requestId}`));
  });

  test('PRY-xxxx-F1 abre el Plan con la fase visible', async ({ page }) => {
    await page.goto('/inicio');
    await search(page).fill(`${requestCode}-F1`);
    await expect(page.getByRole('option').first()).toContainText('Fase');
    await search(page).press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/seguimiento/plan\\?requestId=${requestId}&phaseId=${phaseId}`),
    );
  });

  test('PRY-xxxx-T01 abre el detalle de la tarea', async ({ page }) => {
    await page.goto('/inicio');
    await search(page).fill(`${requestCode}-T01`);
    const option = page.getByRole('option').first();
    await expect(option).toContainText(taskTitle);
    await expect(option).toContainText('Tarea');
    await search(page).press('Enter');
    await expect(page).toHaveURL(/\/seguimiento\/tareas\?taskId=/);
  });

  test('un código inexistente anuncia «no encontrado»', async ({ page }) => {
    await page.goto('/inicio');
    await search(page).fill('PRY-9999-T99');
    await expect(page.getByText('No encontramos PRY-9999-T99, o no tienes acceso.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'No se encontró PRY-9999-T99' })).toBeAttached();
    await expect(search(page)).toHaveAttribute('aria-invalid', 'true');
  });

  test('un texto que no es código avisa de que no es válido al pulsar Intro', async ({ page }) => {
    await page.goto('/inicio');
    await search(page).fill('hola mundo');
    await search(page).press('Enter');
    await expect(page.getByText(/No es un código válido/)).toBeVisible();
  });

  test('teclado: «/» enfoca la búsqueda, Escape la limpia y no actúa dentro de un campo', async ({ page }) => {
    await page.goto('/inicio');
    await expect(search(page)).toBeVisible();
    // Reintenta hasta que la hidratación registre el atajo.
    await expect(async () => {
      await page.keyboard.press('/');
      await expect(search(page)).toBeFocused({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await search(page).fill(requestCode);
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape'); // cierra el panel
    await expect(page.getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Escape'); // limpia el texto
    await expect(search(page)).toHaveValue('');
    // El atajo no roba la «/» a otro campo editable.
    await page.goto('/demanda/solicitudes');
    const q = page.locator('#sol-buscar');
    await q.focus();
    await page.keyboard.type('a/b');
    await expect(q).toHaveValue('a/b');
    await expect(search(page)).not.toBeFocused();
  });

  test('la cabecera de búsqueda no tiene violaciones serias de accesibilidad', async ({ page }) => {
    await page.goto('/inicio');
    await expect(search(page)).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      await search(page).fill(`${requestCode}-T01`);
      await expect(page.getByRole('option').first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('form[role="search"]')
        .analyze();
      expect(
        violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
        `axe ${scheme}`,
      ).toEqual([]);
      await search(page).fill('PRY-9999');
      await expect(page.getByText('No encontramos PRY-9999, o no tienes acceso.')).toBeVisible();
      const notFound = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('form[role="search"]')
        .analyze();
      expect(
        notFound.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
        `axe no encontrado ${scheme}`,
      ).toEqual([]);
      await search(page).fill('');
    }
  });
});

test.describe('Búsqueda global por ID (móvil)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el botón abre el modo búsqueda, resuelve la tarea y navega', async ({ page }) => {
    await page.goto('/inicio');
    await expect(search(page)).toHaveCount(0);
    await page.getByRole('button', { name: SEARCH }).click();
    await expect(search(page)).toBeFocused();
    await search(page).fill(`${requestCode}-T01`);
    await expect(page.getByRole('option').first()).toContainText(taskTitle);
    await search(page).press('Enter');
    await expect(page).toHaveURL(/\/seguimiento\/tareas\?taskId=/);
    await expect(search(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: SEARCH })).toBeVisible();
  });

  test('Escape sin texto cierra el modo búsqueda y devuelve el foco al botón', async ({ page }) => {
    await page.goto('/inicio');
    await page.getByRole('button', { name: SEARCH }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: SEARCH })).toBeFocused();
  });
});

test.describe('IdChip en Triage, Aprobaciones y Capacidad', () => {
  test('Triage muestra el código en la bandeja y en el encabezado de la solicitud', async ({ page }) => {
    await page.goto('/demanda/triage');
    const chip = page.locator(`[data-id-chip="${untriagedCode}"]`).first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(untriagedCode);
    // Al elegir la solicitud, el encabezado repite el ID (RequestContextBar).
    await page.getByText(`E2E sin triage ${ts}`).first().click();
    await expect(page.getByRole('button', { name: `Código ${untriagedCode}, copiar` }).first()).toBeVisible();
  });

  test('Priorización muestra el código de la solicitud pendiente', async ({ page }) => {
    await page.goto('/demanda/priorizacion');
    await expect(page.locator(`[data-id-chip="${pendingApprovalCode}"]`).first()).toBeVisible();
  });

  test('Aprobaciones muestra el código completo de lo que espera decisión', async ({ page }) => {
    await page.goto('/administracion/revision');
    await expect(page.getByRole('heading', { name: 'Aprobaciones', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Código ${pendingApprovalCode}, copiar` }).first(),
    ).toBeVisible();
  });

  test('Capacidad carga (sin asignaciones de demo no hay chips que comprobar)', async ({ page }) => {
    await page.goto('/activos/capacidad');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Panel y Reporte semanal cargan sin chips (solo conteos y texto)', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page.getByRole('heading', { name: 'Requiere tu atención' })).toBeVisible();
    await expect(page.locator('[data-id-chip]')).toHaveCount(0);
    await page.goto('/seguimiento/semanal');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-id-chip]')).toHaveCount(0);
  });
});
