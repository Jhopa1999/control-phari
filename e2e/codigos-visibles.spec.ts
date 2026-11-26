import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

/**
 * Oleada 3 · PR-D: códigos visibles (ACT-####, DOC-####) y criterio común de
 * confirmación o «Deshacer».
 *
 * - La API devuelve `code` en activos y documentos (y `assetCode` en documentos).
 * - Activos y Documentos muestran el chip y se buscan por código.
 * - Retirar un activo sin dependientes ofrece «Deshacer»; con dependientes pide
 *   confirmación (2.5 / 5.1 / 5.3 / 6.6 del plan de mejora).
 * - Auditoría muestra el código y la etiqueta del objeto y filtra por código.
 * - Autorizar plan, Aprobar documento y dar o quitar el rol de administrador
 *   piden confirmación.
 *
 * Todo lo crea la propia prueba con el prefijo «E2E códigos». No toca a los
 * usuarios demo: el interruptor de administrador solo se abre y se cancela.
 * Con E2E_CAPTURAS_DIR guarda capturas a 1440 y 390 en claro y oscuro.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const ts = Date.now();
// Las pantallas se compilan bajo demanda en `next dev`: el primer goto puede tardar.
test.describe.configure({ timeout: 90_000 });

type Headers = typeof JEFE | typeof LIDER;

interface AssetDto {
  id: string;
  code: string;
  name: string;
  status: string;
  requestsCount: number;
  documentsCount: number;
}
interface DocDto {
  id: string;
  code: string;
  assetCode: string;
  title: string;
  status: string;
}

async function call<T = Record<string, unknown>>(
  api: APIRequestContext,
  headers: Headers,
  method: 'post' | 'get' | 'patch',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await api[method](`${API_URL}${path}`, { headers, data: body });
  const text = await res.text();
  expect(res.ok(), `${method} ${path} → ${res.status()} ${text}`).toBeTruthy();
  return (text ? JSON.parse(text) : {}) as T;
}

async function actAs(page: Page, actor: string): Promise<void> {
  await page.context().addInitScript(
    ([origin, id]) => {
      if (window.location.origin === origin) window.localStorage.setItem('actorId', id);
    },
    [WEB_ORIGIN, actor] as const,
  );
}

async function axeSerious(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Insignia de notificaciones del encabezado (en oscuro con contador): componente
    // del shell que este PR no toca; queda anotado en la descripción del PR.
    .exclude('.-right-0\\.5.-top-0\\.5.min-w-4')
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

let processId = '';
let free: AssetDto; // sin dependientes
let used: AssetDto; // con un documento
let usedDoc: DocDto;
let pendingDoc: DocDto;

test.beforeAll(async ({ request }) => {
  const processes = await call<Array<{ id: string }>>(request, LIDER, 'get', '/processes');
  processId = processes[0].id;
  const newAsset = async (name: string): Promise<AssetDto> => {
    const created = await call<AssetDto>(request, JEFE, 'post', '/assets', { processId, name });
    await call(request, JEFE, 'post', `/assets/${created.id}/status`, { targetStatus: 'ACTIVO' });
    return created;
  };
  free = await newAsset(`E2E códigos libre ${ts}`);
  used = await newAsset(`E2E códigos con documento ${ts}`);
  usedDoc = await call<DocDto>(request, JEFE, 'post', '/documents', {
    assetId: used.id,
    title: `E2E códigos documento ${ts}`,
    content: '# Contenido',
    categoryCode: 'TECNICA',
  });
  pendingDoc = await call<DocDto>(request, LIDER, 'post', '/documents', {
    assetId: used.id,
    title: `E2E códigos por aprobar ${ts}`,
    content: '# Contenido',
    categoryCode: 'TECNICA',
  });
  await call(request, LIDER, 'post', `/documents/${pendingDoc.id}/submit-approval`, {});
});

test.describe('API: códigos de activos y documentos', () => {
  test('activos y documentos traen su código, el del activo y los recuentos', async ({ request }) => {
    const assets = await call<AssetDto[]>(request, JEFE, 'get', '/assets');
    const a = assets.find((x) => x.id === free.id);
    const b = assets.find((x) => x.id === used.id);
    expect(a?.code).toMatch(/^ACT-\d{4,}$/);
    expect(b?.code).toMatch(/^ACT-\d{4,}$/);
    expect(a?.code).not.toBe(b?.code);
    expect(a).toMatchObject({ requestsCount: 0, documentsCount: 0 });
    expect(b).toMatchObject({ requestsCount: 0, documentsCount: 2 });
    const doc = await call<DocDto>(request, JEFE, 'get', `/documents/${usedDoc.id}`);
    expect(doc.code).toMatch(/^DOC-\d{4,}$/);
    expect(doc.assetCode).toBe(b?.code);
    // `q` también busca por código del documento.
    const found = await call<DocDto[]>(request, JEFE, 'get', `/documents?q=${doc.code}`);
    expect(found.map((d) => d.id)).toContain(usedDoc.id);
  });

  test('el código es de solo lectura: la API rechaza enviarlo', async ({ request }) => {
    const res = await request.patch(`${API_URL}/assets/${free.id}`, {
      headers: JEFE,
      data: { code: 'ACT-9999' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Activos: código, búsqueda y retiro', () => {
  test.describe.configure({ mode: 'serial' });

  test('muestra el chip de código y se busca por código, con y sin ceros', async ({ page, request }) => {
    const assets = await call<AssetDto[]>(request, JEFE, 'get', '/assets');
    const mine = assets.find((x) => x.id === free.id)!;
    await page.goto('/activos/catalogo');
    const search = page.getByLabel('Buscar por nombre o código');
    await search.fill(mine.code.toLowerCase());
    const row = page.getByRole('row', { name: new RegExp(free.name) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: new RegExp(`Código ${mine.code}, copiar`) })).toBeVisible();
    const short = `act-${Number(mine.code.slice(4))}`;
    await search.fill(short);
    await expect(page.getByRole('row', { name: new RegExp(free.name) })).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    const dir = process.env.E2E_CAPTURAS_DIR;
    if (dir) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          await page.screenshot({ path: `${dir}/activos-codigo-${scheme}-${width}.png` });
          expect(await axeSerious(page)).toEqual([]);
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });

  test('retirar sin dependientes ofrece «Deshacer» y lo revierte', async ({ page, request }) => {
    await page.goto('/activos/catalogo');
    await page.getByLabel('Buscar por nombre o código').fill(free.name);
    const row = page.getByRole('row', { name: new RegExp(free.name) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Retirar' }).click();
    const undo = page.getByRole('button', { name: /Deshacer/ });
    await expect(undo).toBeVisible();
    await expect(page.getByText(/ACT-\d{4,} retirado\./)).toBeVisible();
    expect((await call<AssetDto>(request, JEFE, 'get', `/assets/${free.id}`)).status).toBe('RETIRADO');
    const dir = process.env.E2E_CAPTURAS_DIR;
    if (dir) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.screenshot({ path: `${dir}/activos-deshacer-${scheme}-1440.png` });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
    await undo.click();
    await expect(page.getByText(/ACT-\d{4,} recuperado\./)).toBeVisible();
    await expect
      .poll(async () => (await call<AssetDto>(request, JEFE, 'get', `/assets/${free.id}`)).status)
      .toBe('ACTIVO');
    // El foco vuelve al «…» de la fila.
    await expect(
      page.getByRole('row', { name: new RegExp(free.name) }).getByRole('button', { name: /Más acciones para/ }),
    ).toBeFocused();
  });

  test('retirar con dependientes pide confirmación: Escape no cambia nada y confirmar retira', async ({
    page,
    request,
  }) => {
    await page.goto('/activos/catalogo');
    await page.getByLabel('Buscar por nombre o código').fill(used.name);
    const row = page.getByRole('row', { name: new RegExp(used.name) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Retirar' }).click();
    const dialog = page.getByRole('alertdialog', { name: /¿Retirar ACT-\d{4,}\?/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/asociado a 2 documentos/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    expect(await axeSerious(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect((await call<AssetDto>(request, JEFE, 'get', `/assets/${used.id}`)).status).toBe('ACTIVO');
    await row.getByRole('button', { name: 'Retirar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Retirar activo' }).click();
    await expect(page.getByText(/ACT-\d{4,} retirado\. Puedes recuperarlo/)).toBeVisible();
    // Con dependientes no hay «Deshacer»: la vía de vuelta es «Recuperar».
    await expect(page.getByRole('button', { name: /Deshacer/ })).toHaveCount(0);
    await expect
      .poll(async () => (await call<AssetDto>(request, JEFE, 'get', `/assets/${used.id}`)).status)
      .toBe('RETIRADO');
    await call(request, JEFE, 'post', `/assets/${used.id}/status`, { targetStatus: 'ACTIVO' });
  });
});

test.describe('Documentos: código, búsqueda y aprobación confirmada', () => {
  test.describe.configure({ mode: 'serial' });

  test('muestra los códigos del documento y de su activo, y se busca por código', async ({ page, request }) => {
    const doc = await call<DocDto>(request, JEFE, 'get', `/documents/${usedDoc.id}`);
    await page.goto('/activos/documentos');
    await page.getByLabel('Buscar por título o código').fill(doc.code);
    const row = page.getByRole('row', { name: new RegExp(usedDoc.title) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: new RegExp(`Código ${doc.code}, copiar`) })).toBeVisible();
    await expect(row.getByRole('button', { name: new RegExp(`Código ${doc.assetCode}, copiar`) })).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    const dir = process.env.E2E_CAPTURAS_DIR;
    if (dir) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          await page.screenshot({ path: `${dir}/documentos-codigo-${scheme}-${width}.png` });
          expect(await axeSerious(page)).toEqual([]);
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });

  test('aprobar un documento pide confirmación; cancelar no cambia nada', async ({ page, request }) => {
    test.setTimeout(90_000);
    await page.goto('/activos/documentos');
    await page.getByLabel('Buscar por título o código').fill(pendingDoc.title);
    const row = page.getByRole('row', { name: new RegExp(pendingDoc.title) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /Más acciones para/ }).click();
    await page.getByRole('menuitem', { name: 'Aprobar' }).click();
    const dialog = page.getByRole('alertdialog', { name: new RegExp(`¿Aprobar «${pendingDoc.title}»\\?`) });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('El documento pasará a Vigente.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    expect((await call<DocDto>(request, JEFE, 'get', `/documents/${pendingDoc.id}`)).status).toBe(
      'PENDIENTE_APROBACION',
    );
    await row.getByRole('button', { name: /Más acciones para/ }).click();
    await page.getByRole('menuitem', { name: 'Aprobar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Aprobar documento' }).click();
    await expect(page.getByText('Documento aprobado.')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await call<DocDto>(request, JEFE, 'get', `/documents/${pendingDoc.id}`)).status)
      .toBe('VIGENTE');
  });
});

test.describe('Auditoría: código y etiqueta del objeto', () => {
  test('muestra el código y el nombre del activo y filtra por su código', async ({ page, request }) => {
    test.setTimeout(90_000);
    const mine = (await call<AssetDto[]>(request, JEFE, 'get', '/assets')).find((x) => x.id === used.id)!;
    await page.goto('/gobierno/auditoria');
    const field = page.getByLabel('Código del objeto');
    await field.fill(mine.code);
    const row = page.getByRole('row', { name: new RegExp(used.name) }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: new RegExp(`Código ${mine.code}, copiar`) })).toBeVisible();
    await expect(row.getByText('Activo', { exact: true })).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    await field.fill('ACT-9999999');
    await expect(page.getByText('No hay eventos para ACT-9999999 dentro de tu alcance.')).toBeVisible({ timeout: 15_000 });
    const dir = process.env.E2E_CAPTURAS_DIR;
    if (dir) {
      await field.fill(mine.code);
      await expect(row).toBeVisible();
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          await page.screenshot({ path: `${dir}/auditoria-codigo-${scheme}-${width}.png` });
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });
});

test.describe('Rol de administrador (6.6)', () => {
  test('el interruptor no cambia hasta confirmar y cancelar lo deja igual', async ({ page }) => {
    await actAs(page, 'admin@demo.local');
    let adminCalls = 0;
    page.on('request', (r) => {
      if (r.method() !== 'GET' && /admin|users/.test(new URL(r.url()).pathname)) adminCalls += 1;
    });
    await page.goto('/administracion/configuracion-smtp');
    const toggle = page.getByRole('switch', { name: /^Administrador: / }).first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    const dialog = page.getByRole('alertdialog', { name: /rol de administrador a /i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    expect(await axeSerious(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-checked', before ?? 'false');
    await expect(toggle).toBeFocused();
    expect(adminCalls).toBe(0);
  });
});

test.describe('Autorizar plan (2.5)', () => {
  test('pide confirmación; cancelar no cambia el plan y confirmar lo autoriza', async ({ page, request }) => {
    test.setTimeout(180_000);
    const processes = await call<Array<{ id: string; code: string }>>(request, JEFE, 'get', '/processes');
    const main = processes.find((p) => p.code === 'FIBI') ?? processes[0];
    const req = await call<{ id: string; code: string; title: string }>(request, JEFE, 'post', '/requests', {
      title: `E2E códigos autorizar ${ts}`,
      mainProcessId: main.id,
    });
    await call(request, JEFE, 'post', `/requests/${req.id}/triage`, {
      decision: 'CONTINUAR',
      mainProcessId: main.id,
      participantProcessIds: [main.id],
    });
    const asset = await call<AssetDto>(request, JEFE, 'post', '/assets', {
      processId: main.id,
      name: `E2E códigos activo plan ${ts}`,
    });
    await call(request, JEFE, 'post', `/assets/${asset.id}/status`, { targetStatus: 'ACTIVO' });
    await call(request, JEFE, 'post', `/requests/${req.id}/asset`, { assetId: asset.id });
    await call(request, JEFE, 'post', `/requests/${req.id}/priority`, {
      impact: 3,
      alignment: 3,
      riskControl: 3,
      urgency: 3,
      scope: 3,
      dataAvailability: 3,
      feasibility: 3,
      reuse: 3,
    });
    await call(request, JEFE, 'post', `/requests/${req.id}/approval`, { decision: 'APROBAR' });
    const plan = await call<{ id: string }>(request, JEFE, 'post', `/requests/${req.id}/plan`, {});
    const phase = await call<{ id: string }>(request, JEFE, 'post', `/plans/${plan.id}/phases`, {
      name: 'Fase códigos',
      startDate: '2030-01-01',
      endDate: '2030-12-31',
    });
    const me = await call<{ userId?: string; user?: { id: string } }>(request, JEFE, 'get', '/me/permissions');
    const responsibleUserId = me.userId ?? me.user?.id;
    const task = await call<{ id: string }>(request, JEFE, 'post', `/phases/${phase.id}/tasks`, {
      title: 'Tarea códigos',
      responsibleUserId,
      startDate: '2030-02-01',
      endDate: '2030-02-10',
      estimateHours: 4,
    });
    await call(request, JEFE, 'patch', `/requests/${req.id}/plan`, { commitmentDate: '2030-02-10' });
    await call(request, JEFE, 'post', `/requests/${req.id}/plan/submit`, {});

    await page.goto('/administracion/revision');
    const row = page.getByRole('row', { name: new RegExp(req.title) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Autorizar', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: new RegExp(`¿Autorizar el plan de ${req.code}\\?`) });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/pasará a En ejecución/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    expect(await axeSerious(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    const still = await call<{ status: string }>(request, JEFE, 'get', `/requests/${req.id}/plan`);
    expect(still.status).toBe('EN_AUTORIZACION');
    await row.getByRole('button', { name: 'Autorizar', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Autorizar plan' }).click();
    await expect(page.getByText('Plan autorizado. La solicitud pasa a En ejecución.')).toBeVisible();
    await expect
      .poll(async () => (await call<{ status: string }>(request, JEFE, 'get', `/requests/${req.id}/plan`)).status)
      .toBe('AUTORIZADO');

    // Aprobar cierre (2.5): se prepara el cierre por la API y se aprueba desde la cola.
    for (const status of ['EN_CURSO', 'EN_REVISION', 'TERMINADA']) {
      await call(request, JEFE, 'patch', `/tasks/${task.id}/status`, {
        status,
        progress: 100,
        evidenceUrl: 'https://example.com/evidencia',
      });
    }
    const closureDoc = await call<{ id: string }>(request, JEFE, 'post', '/documents', {
      assetId: asset.id,
      title: `E2E códigos acta de cierre ${ts}`,
      categoryCode: 'CIERRE',
      requestId: req.id,
      content: '# Acta de cierre\n\nResultados.',
    });
    await call(request, JEFE, 'post', `/documents/${closureDoc.id}/submit-approval`, {});
    await call(request, JEFE, 'post', `/documents/${closureDoc.id}/review`, { decision: 'APROBAR' });
    await call(request, JEFE, 'post', `/requests/${req.id}/closure`, {});

    await page.goto('/administracion/revision');
    const closureRow = page.getByRole('row', { name: new RegExp(req.title) });
    await expect(closureRow).toBeVisible({ timeout: 30_000 });
    await closureRow.getByRole('button', { name: 'Aprobar cierre' }).click();
    const closureDialog = page.getByRole('alertdialog', {
      name: new RegExp(`¿Aprobar el cierre de ${req.code}\\?`),
    });
    await expect(closureDialog).toBeVisible();
    await expect(closureDialog.getByText(/El proyecto quedará cerrado/)).toBeVisible();
    await closureDialog.getByRole('button', { name: 'Cancelar' }).click();
    const open = await call<{ operationalState: string }>(request, JEFE, 'get', `/requests/${req.id}`);
    expect(open.operationalState).not.toBe('CERRADA');
    await closureRow.getByRole('button', { name: 'Aprobar cierre' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Aprobar cierre' }).click();
    await expect(page.getByText('Cierre aprobado. El proyecto quedó cerrado.')).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(async () => (await call<{ operationalState: string }>(request, JEFE, 'get', `/requests/${req.id}`)).operationalState)
      .toBe('CERRADA');
  });
});
