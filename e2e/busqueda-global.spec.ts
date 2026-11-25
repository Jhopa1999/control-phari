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
const SEARCH = 'Buscar pantallas, solicitudes o tareas';

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
  // D8: solo un activo ACTIVO admite asociaciones nuevas; el jefe lo activa antes.
  await send(request, 'post', `/assets/${asset.id}/status`, { targetStatus: 'ACTIVO' });
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
  // D8: solo un activo ACTIVO admite asociaciones nuevas; el jefe lo activa antes.
  await send(request, 'post', `/assets/${pendingAsset.id}/status`, { targetStatus: 'ACTIVO' });
  await send(request, 'post', `/requests/${pendingId}/asset`, { assetId: pendingAsset.id as string });
  await send(request, 'post', `/requests/${pendingId}/priority`, PRIORITY);

  // Sin triage todavía (bandeja de Triage).
  untriagedCode = (await createRequest(request, `E2E sin triage ${ts}`)).code as string;
});

/** En desarrollo, la primera visita a una ruta la compila al vuelo: margen para navegar. */
const NAV = { timeout: 20_000 } as const;

function palette(page: import('@playwright/test').Page) {
  return page.getByRole('dialog', { name: 'Buscar en el portal' });
}

function search(page: import('@playwright/test').Page) {
  return palette(page).getByRole('combobox', { name: SEARCH });
}

/** Abre la paleta con el botón de la barra superior; reintenta hasta que la hidratación lo permita. */
async function openPalette(page: import('@playwright/test').Page): Promise<void> {
  await expect(async () => {
    if (!(await search(page).isVisible())) {
      await page.getByRole('button', { name: /^Buscar en el portal/ }).click({ timeout: 1_000 });
    }
    await expect(search(page)).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
}

test.describe('Paleta de búsqueda (escritorio)', () => {
  test('PRY-xxxx abre la ficha de la solicitud', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill(requestCode.toLowerCase());
    const option = page.getByRole('option').first();
    await expect(option).toContainText(`E2E búsqueda ${ts}`);
    await expect(option).toContainText('Solicitud');
    await search(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/demanda/solicitudes/${requestId}`), NAV);
    await expect(palette(page)).toBeHidden();
    // El foco pasa al contenido nuevo.
    await expect(page.locator('main#contenido')).toBeFocused();
  });

  test('PRY-xxxx-F1 abre el Plan con la fase visible', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill(`${requestCode}-F1`);
    await expect(page.getByRole('option').first()).toContainText('Fase');
    await search(page).press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/seguimiento/plan\\?requestId=${requestId}&phaseId=${phaseId}`),
      NAV,
    );
  });

  test('PRY-xxxx-T01 abre el detalle de la tarea', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill(`${requestCode}-T01`);
    const option = page.getByRole('option').first();
    await expect(option).toContainText(taskTitle);
    await expect(option).toContainText('Tarea');
    await search(page).press('Enter');
    await expect(page).toHaveURL(/\/seguimiento\/tareas\?taskId=/, NAV);
  });

  test('un código inexistente anuncia «no encontrado»', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill('PRY-9999-T99');
    await expect(
      palette(page).getByText(
        'No encontramos PRY-9999-T99, o no tienes acceso. Revisa que esté completo.',
      ),
    ).toBeVisible();
    await expect(
      palette(page).getByRole('status').filter({ hasText: 'No encontramos PRY-9999-T99' }),
    ).toBeAttached();
  });

  test('un texto por título lista solicitudes y tareas y Intro abre la primera', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill(`E2E búsqueda ${ts}`);
    const results = palette(page).getByRole('group', { name: 'Solicitudes y tareas' });
    await expect(results.getByRole('option').first()).toContainText(`E2E búsqueda ${ts}`);
    await expect(results.getByRole('option').first()).toContainText('Solicitud');
    await search(page).fill(`Tarea búsqueda ${ts}`);
    await expect(results.getByRole('option').first()).toContainText(`${requestCode}-T01`);
    await expect(results.getByRole('option').first()).toContainText('Tarea');
    await search(page).press('Enter');
    await expect(page).toHaveURL(/\/seguimiento\/tareas\?taskId=/, NAV);
  });

  test('un solo carácter filtra pantallas y pide al menos 2 para solicitudes y tareas', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill('s');
    await expect(
      palette(page).getByText('Escribe al menos 2 caracteres para buscar solicitudes y tareas.'),
    ).toBeVisible();
  });

  test('un texto sin coincidencias muestra «sin resultados»', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill(`zzqx${ts}`);
    await expect(palette(page).getByText(`No encontramos resultados para «zzqx${ts}»`)).toBeVisible();
  });

  test('una pantalla se abre desde la paleta', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill('priorizacion');
    await expect(
      palette(page).getByRole('group', { name: 'Pantallas' }).getByRole('option'),
    ).toHaveText([/Priorización/]);
    await search(page).press('Enter');
    await expect(page).toHaveURL('/demanda/priorizacion', NAV);
  });

  test('teclado: Ctrl+K abre, las flechas mueven, Esc cierra y devuelve el foco', async ({ page }) => {
    await page.goto('/demanda/solicitudes');
    const q = page.locator('#sol-buscar');
    await expect(q).toBeVisible();
    await q.focus();
    // Reintenta hasta que la hidratación registre el atajo. Ctrl+K funciona incluso dentro de un campo.
    await expect(async () => {
      if (!(await search(page).isVisible())) await page.keyboard.press('Control+K');
      await expect(search(page)).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    const options = palette(page).getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(q).toBeFocused();
    // Ctrl+K con la paleta abierta la cierra.
    await page.keyboard.press('Control+K');
    await expect(search(page)).toBeVisible();
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeHidden();
  });

  test('teclado: «/» abre la paleta y no actúa dentro de un campo editable', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page.getByRole('button', { name: /^Buscar en el portal/ })).toBeVisible();
    await expect(async () => {
      if (!(await search(page).isVisible())) await page.keyboard.press('/');
      await expect(search(page)).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await expect(search(page)).toHaveValue('');
    await page.keyboard.press('Escape');
    await page.goto('/demanda/solicitudes');
    const q = page.locator('#sol-buscar');
    await q.focus();
    await page.keyboard.type('a/b');
    await expect(q).toHaveValue('a/b');
    await expect(palette(page)).toHaveCount(0);
  });

  test('Esc cierra y, al reabrir, el campo está vacío', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill('algo');
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await openPalette(page);
    await expect(search(page)).toHaveValue('');
  });

  test('la paleta no tiene violaciones serias de accesibilidad', async ({ page }) => {
    await page.goto('/inicio');
    await openPalette(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      for (const text of [`${requestCode}-T01`, 'PRY-9999', 'priorizacion', `zzqx${ts}`]) {
        await search(page).fill(text);
        await expect(palette(page).getByRole('status')).toBeAttached();
        // Espera a que la búsqueda se asiente (sin esqueleto).
        await expect(palette(page).locator('[aria-busy="true"]')).toHaveCount(0);
        await expect(palette(page).locator('[aria-hidden="true"].animate-none')).toHaveCount(0);
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .include('[role="dialog"]')
          .analyze();
        expect(
          violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
          `axe ${scheme} «${text}»`,
        ).toEqual([]);
      }
    }
  });
});

test.describe('Paleta de búsqueda (móvil)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la lupa abre la paleta a pantalla completa, resuelve la tarea y navega', async ({ page }) => {
    await page.goto('/inicio');
    await expect(search(page)).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Buscar', exact: true });
    await expect(async () => {
      if (!(await search(page).isVisible())) await trigger.click({ timeout: 1_000 });
      await expect(search(page)).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(search(page)).toBeFocused();
    // La animación de entrada escala el diálogo: se mide cuando termina.
    await expect.poll(async () => (await palette(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(389);
    await search(page).fill(`${requestCode}-T01`);
    await expect(page.getByRole('option').first()).toContainText(taskTitle);
    await search(page).press('Enter');
    await expect(page).toHaveURL(/\/seguimiento\/tareas\?taskId=/, NAV);
    await expect(palette(page)).toBeHidden();
    // La barra no cambia de forma: la lupa sigue visible.
    await expect(trigger).toBeVisible();
  });

  test('Esc cierra la paleta y devuelve el foco a la lupa', async ({ page }) => {
    await page.goto('/inicio');
    const trigger = page.getByRole('button', { name: 'Buscar', exact: true });
    await expect(async () => {
      if (!(await search(page).isVisible())) await trigger.click({ timeout: 1_000 });
      await expect(search(page)).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('el cajón del menú no duplica el buscador: la lupa de la barra abre la paleta', async ({ page }) => {
    await page.goto('/inicio');
    const drawer = page.getByRole('dialog', { name: 'Menú principal', exact: true });
    const trigger = page.getByRole('button', { name: 'Buscar', exact: true });
    // Espera a la hidratación (la lupa se monta con el actor) antes de abrir el cajón.
    await expect(trigger).toBeVisible();
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: /Buscar/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(async () => {
      if (!(await search(page).isVisible())) await trigger.click({ timeout: 1_000 });
      await expect(search(page)).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
  });
});

test.describe('Búsqueda por texto: el alcance manda', () => {
  const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;
  const scopeTag = `E2E alcance búsqueda ${ts}`;
  let jefeOnlyId = '';
  let ownId = '';

  test.beforeAll(async ({ request }) => {
    // Del jefe y sin proceso: fuera del alcance del integrante.
    const jefeReq = await request.post(`${API_URL}/requests`, {
      headers: HEADERS,
      data: { title: `${scopeTag} del jefe` },
    });
    expect(jefeReq.status()).toBe(201);
    jefeOnlyId = ((await jefeReq.json()) as { id: string }).id;
    // Creada por el integrante: dentro de su alcance.
    const own = await request.post(`${API_URL}/requests`, {
      headers: INTEGRANTE,
      data: { title: `${scopeTag} propia` },
    });
    expect(own.status()).toBe(201);
    ownId = ((await own.json()) as { id: string }).id;
  });

  test.afterAll(async ({ request }) => {
    for (const id of [jefeOnlyId, ownId]) {
      if (id) await request.delete(`${API_URL}/requests/${id}`, { headers: HEADERS });
    }
  });

  test('API: el jefe ve ambas; el integrante solo la suya; q corta o larga da 400', async ({ request }) => {
    const q = encodeURIComponent(scopeTag);
    const asJefe = await request.get(`${API_URL}/search?q=${q}`, { headers: HEADERS });
    expect(asJefe.ok()).toBeTruthy();
    const jefeBody = (await asJefe.json()) as { requests: Array<{ id: string }>; tasks: unknown[]; truncated: boolean };
    expect(jefeBody.requests.map((r) => r.id).sort()).toEqual([jefeOnlyId, ownId].sort());
    const asMember = await request.get(`${API_URL}/search?q=${q}`, { headers: INTEGRANTE });
    const memberBody = (await asMember.json()) as { requests: Array<{ id: string }> };
    expect(memberBody.requests.map((r) => r.id)).toEqual([ownId]);
    expect((await request.get(`${API_URL}/search?q=a`, { headers: HEADERS })).status()).toBe(400);
    expect(
      (await request.get(`${API_URL}/search?q=${'a'.repeat(81)}`, { headers: HEADERS })).status(),
    ).toBe(400);
    expect((await request.get(`${API_URL}/search?q=ab&limit=21`, { headers: HEADERS })).status()).toBe(400);
    const limited = await request.get(`${API_URL}/search?q=${q}&limit=1`, { headers: HEADERS });
    const limitedBody = (await limited.json()) as { requests: unknown[]; truncated: boolean };
    expect(limitedBody.requests).toHaveLength(1);
    expect(limitedBody.truncated).toBe(true);
  });

  test('UI: el integrante no ve en la paleta la solicitud del jefe', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('actorId', 'integrante@demo.local');
    });
    await page.goto('/inicio');
    await openPalette(page);
    await search(page).fill(scopeTag);
    const results = palette(page).getByRole('group', { name: 'Solicitudes y tareas' });
    await expect(results.getByRole('option')).toHaveCount(1);
    await expect(results.getByRole('option').first()).toContainText('propia');
    await expect(results.getByText('del jefe')).toHaveCount(0);
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
