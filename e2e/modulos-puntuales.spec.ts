import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * Oleada 3 · PR-E «módulos puntuales»:
 * - formato de códigos de áreas, procesos y maestras (API y diálogos);
 * - 6.3 Áreas: conteos y bloqueo al desactivar con procesos activos;
 * - 6.4 Procesos: confirmación al desactivar con trabajo en curso;
 * - 4.3 persona fuera de alcance en compromisos (400 en español, no 500);
 * - 4.4 el administrador abre Actividades recurrentes en Gestión;
 * - 3.4 periodo invertido en Indicadores.
 *
 * Modo dev-header (el de la suite). No modifica a los usuarios demo. Los datos
 * llevan el prefijo `E2E_PUNT_` (áreas y procesos no se pueden borrar: al
 * terminar se desactivan con filtro estricto por ese prefijo).
 */

const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
const ADMIN = 'admin@demo.local';
const RUN = Date.now().toString(36).toUpperCase();
const PREFIX = `E2E_PUNT_${RUN}`;
const CAPTURES_DIR = process.env.E2E_CAPTURES_DIR;
// Áreas y procesos no se pueden borrar: se crean con orden alto para que, ya
// desactivados, queden al final de las listas y no sean "el primer proceso"
// que toman otras pruebas (processes[0]).
const SORT_LAST = 9999;

type Json = Record<string, unknown>;

async function call(
  request: APIRequestContext,
  actor: string,
  method: 'get' | 'post' | 'patch',
  path: string,
  data?: Json,
) {
  const response = await request[method](`${API_URL}${path}`, {
    headers: { 'X-Actor-Id': actor },
    ...(data ? { data } : {}),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status(), body };
}

async function actAs(context: BrowserContext, identifier: string): Promise<void> {
  await context.addInitScript(
    ([origin, id]) => {
      if (window.location.origin === origin) window.localStorage.setItem('actorId', id);
    },
    [WEB_ORIGIN, identifier],
  );
}

async function expectNoSeriousA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('#contenido')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

const created: { areaIds: string[]; processIds: string[] } = { areaIds: [], processIds: [] };
let areaId = '';
let areaCode = '';
let processId = '';
let processCode = '';
let areaName = '';

test.beforeAll(async ({ request }) => {
  areaCode = `${PREFIX}_A`;
  areaName = `E2E Área ${RUN}`;
  const area = await call(request, JEFE, 'post', '/areas', { code: areaCode, name: areaName, sortOrder: SORT_LAST });
  expect(area.status, JSON.stringify(area.body)).toBe(201);
  areaId = (area.body as { id: string }).id;
  created.areaIds.push(areaId);

  processCode = `${PREFIX}_P`;
  const process = await call(request, JEFE, 'post', '/processes', {
    code: processCode,
    name: `E2E Proceso ${RUN}`,
    areaId,
    kind: 'PROCESS',
    sortOrder: SORT_LAST,
  });
  expect(process.status, JSON.stringify(process.body)).toBe(201);
  processId = (process.body as { id: string }).id;
  created.processIds.push(processId);
});

test.afterAll(async ({ request }) => {
  // Desactiva solo lo creado aquí: primero los procesos, después las áreas.
  for (const id of created.processIds) {
    await call(request, JEFE, 'patch', `/processes/${id}`, {
      active: false,
      confirmDeactivation: true,
    });
  }
  for (const id of created.areaIds) {
    await call(request, JEFE, 'patch', `/areas/${id}`, { active: false });
  }
});

test.describe('API · formato de códigos', () => {
  test('un área con «mal codigo» responde 400 en español', async ({ request }) => {
    const res = await call(request, JEFE, 'post', '/areas', { code: 'mal codigo', name: 'X' });
    expect(res.status).toBe(400);
    expect((res.body as { message: string[] }).message).toContain(
      'El código solo admite letras mayúsculas, números y guion bajo.',
    );
  });

  test('guion, tilde y más de 40 caracteres se rechazan; las minúsculas se normalizan', async ({
    request,
  }) => {
    for (const code of ['MAL-CODIGO', 'ANALÍTICA']) {
      const res = await call(request, JEFE, 'post', '/areas', { code, name: 'X' });
      expect(res.status, code).toBe(400);
    }
    const long = await call(request, JEFE, 'post', '/processes', {
      code: 'X'.repeat(41),
      name: 'X',
      areaId,
      kind: 'PROCESS',
      sortOrder: SORT_LAST,
    });
    expect(long.status).toBe(400);
    expect((long.body as { message: string[] }).message).toContain(
      'El código admite como máximo 40 caracteres.',
    );

    const lower = await call(request, JEFE, 'post', '/areas', {
      code: `${PREFIX.toLowerCase()}_min`,
      name: `E2E minúsculas ${RUN}`,
      sortOrder: SORT_LAST,
    });
    expect(lower.status, JSON.stringify(lower.body)).toBe(201);
    expect((lower.body as { code: string }).code).toBe(`${PREFIX}_MIN`);
    created.areaIds.push((lower.body as { id: string }).id);
  });

  test('un código de área repetido responde 409 «Ya existe un área con ese código.»', async ({
    request,
  }) => {
    const res = await call(request, JEFE, 'post', '/areas', { code: areaCode, name: 'Otra' });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe('Ya existe un área con ese código.');
  });

  test('maestras: catálogo y código con formato inválido responden 400', async ({ request }) => {
    const res = await call(request, JEFE, 'post', '/catalog-items', {
      catalog: 'mi catalogo',
      code: 'COD-1',
      label: 'E2E formato',
    });
    expect(res.status).toBe(400);
    const messages = (res.body as { message: string[] }).message;
    expect(messages).toContain('El catálogo solo admite letras mayúsculas, números y guion bajo.');
    expect(messages).toContain('El código solo admite letras mayúsculas, números y guion bajo.');
  });
});

test.describe('API · áreas: conteos y bloqueo', () => {
  test('processCount cuenta solo procesos activos y el 409 trae el recuento', async ({
    request,
  }) => {
    const list = await call(request, JEFE, 'get', '/areas');
    const row = (list.body as Array<{ id: string; processCount: number }>).find(
      (a) => a.id === areaId,
    );
    expect(row?.processCount).toBe(1);

    const blocked = await call(request, JEFE, 'patch', `/areas/${areaId}`, { active: false });
    expect(blocked.status).toBe(409);
    expect((blocked.body as { message: string }).message).toBe(
      'No se puede desactivar el área: tiene 1 proceso activo.',
    );
    expect(JSON.stringify(blocked.body)).not.toContain(areaId);
  });
});

test.describe('API · procesos: confirmar al desactivar', () => {
  test('con una solicitud abierta el primer intento pide confirmación y el reintento la acepta', async ({
    request,
  }) => {
    const proc = await call(request, JEFE, 'post', '/processes', {
      code: `${PREFIX}_C`,
      name: `E2E Proceso confirmar ${RUN}`,
      areaId,
      kind: 'PROCESS',
      sortOrder: SORT_LAST,
    });
    expect(proc.status).toBe(201);
    const id = (proc.body as { id: string }).id;
    created.processIds.push(id);
    const req = await call(request, JEFE, 'post', '/requests', {
      title: `E2E confirmar desactivación ${RUN}`,
      mainProcessId: id,
    });
    expect(req.status, JSON.stringify(req.body)).toBe(201);

    const first = await call(request, JEFE, 'patch', `/processes/${id}`, { active: false });
    expect(first.status).toBe(409);
    expect(first.body).toMatchObject({ requiresConfirmation: true, openRequests: 1 });

    const confirmed = await call(request, JEFE, 'patch', `/processes/${id}`, {
      active: false,
      confirmDeactivation: true,
    });
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as { active: boolean }).active).toBe(false);
  });

  test('sin trabajo en curso se desactiva sin confirmar', async ({ request }) => {
    const proc = await call(request, JEFE, 'post', '/processes', {
      code: `${PREFIX}_L`,
      name: `E2E Proceso libre ${RUN}`,
      areaId,
      kind: 'PROCESS',
      sortOrder: SORT_LAST,
    });
    const id = (proc.body as { id: string }).id;
    created.processIds.push(id);
    const res = await call(request, JEFE, 'patch', `/processes/${id}`, { active: false });
    expect(res.status).toBe(200);
  });
});

test.describe('API · 4.3 persona fuera de alcance', () => {
  test('un responsable inexistente da 400 en español, no 500', async ({ request }) => {
    const ghost = '00000000-0000-4000-8000-00000000abcd';
    const commitment = await call(request, JEFE, 'post', '/commitments', {
      processId,
      title: `E2E persona inexistente ${RUN}`,
      dueDate: '2030-01-15',
      responsibleUserId: ghost,
    });
    expect(commitment.status).toBe(400);
    expect((commitment.body as { message: string }).message).toBe(
      'La persona indicada no existe o no pertenece al proceso.',
    );
    const assigned = await call(request, JEFE, 'post', '/commitments', {
      processId,
      title: `E2E asignado inexistente ${RUN}`,
      dueDate: '2030-01-15',
      assignedUserId: ghost,
    });
    expect(assigned.status).toBe(400);
    const meeting = await call(request, JEFE, 'post', '/meetings', {
      processId,
      title: `E2E reunión persona ${RUN}`,
      meetingDate: '2030-01-15',
      responsibleUserId: ghost,
    });
    expect(meeting.status).toBe(400);
  });
});

test.describe('Áreas (web)', () => {
  test('el diálogo muestra la ayuda de formato y el error junto al código', async ({ page }) => {
    await page.goto('/administracion/areas');
    await page.getByRole('button', { name: 'Nueva área' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('Letras mayúsculas, números y guion bajo. Máximo 40 caracteres.'),
    ).toBeVisible();
    const code = dialog.getByLabel('Código');
    await expect(code).toHaveAttribute('placeholder', 'p. ej. ANALITICA');
    await code.fill('mal codigo');
    await dialog.getByLabel('Nombre').fill('E2E nunca se crea');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    const error = dialog.getByText(
      'El código solo admite letras mayúsculas, números y guion bajo.',
    );
    await expect(error).toBeVisible();
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toBeFocused();
    await expectNoSeriousA11y(page);
    // El error se borra al editar el campo.
    await code.fill('OK_CODE');
    await expect(error).toHaveCount(0);
  });

  test('un error de formato del servidor se asigna al campo y un duplicado también', async ({
    page,
  }) => {
    await page.goto('/administracion/areas');
    await page.getByRole('button', { name: 'Nueva área' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Código').fill(areaCode);
    await dialog.getByLabel('Nombre').fill('E2E duplicada');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(dialog.getByText('Ya existe un área con ese código.')).toBeVisible();
    await expect(dialog.getByLabel('Código')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog).toBeVisible();
  });

  test('la fila con procesos activos muestra los conteos y «Desactivar» no disponible con su motivo', async ({
    page,
  }) => {
    await page.goto('/administracion/areas');
    const row = page.getByRole('row').filter({ hasText: areaCode });
    await expect(row).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Procesos activos' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Solicitantes' })).toBeVisible();
    const deactivate = row.getByRole('button', { name: 'Desactivar' });
    await expect(deactivate).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled: Playwright lo considera «no habilitado»; el clic real abre el motivo.
    await deactivate.click({ force: true });
    await expect(
      page
        .getByRole('tooltip')
        .getByText(
          'No se puede desactivar el área: tiene 1 proceso activo. Desactiva o reasigna esos procesos primero.',
        ),
    ).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('a 390 px cada área es una tarjeta con los conteos y sin desplazamiento horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/administracion/areas');
    const card = page.getByRole('list', { name: 'Áreas' }).getByRole('listitem').filter({
      hasText: areaCode,
    });
    await expect(card.getByText('1 proceso activo')).toBeVisible();
    await expect(card.getByText('0 solicitantes')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoSeriousA11y(page);
  });

  test('en la edición el interruptor «Activa» queda no disponible con el motivo visible', async ({
    page,
  }) => {
    await page.goto('/administracion/areas');
    await page
      .getByRole('row')
      .filter({ hasText: areaCode })
      .getByRole('button', { name: 'Editar' })
      .click();
    const dialog = page.getByRole('dialog');
    const toggle = dialog.getByRole('switch', { name: 'Activa' });
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(
      dialog.getByText('No se puede desactivar el área: tiene 1 proceso activo.', { exact: false }),
    ).toBeVisible();
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked();
  });
});

test.describe('Procesos (web)', () => {
  test('el diálogo de proceso trae ayuda, marcadores y valida el formato', async ({ page }) => {
    await page.goto('/administracion/procesos');
    await page.getByRole('button', { name: 'Nuevo proceso' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Código')).toHaveAttribute('placeholder', 'p. ej. FIBI');
    await expect(dialog.getByLabel('Nombre')).toHaveAttribute(
      'placeholder',
      'p. ej. Inteligencia de negocio',
    );
    await expect(dialog.getByLabel('Marco')).toHaveAttribute('placeholder', 'p. ej. INS-006');
    await dialog.getByLabel('Código').fill('COD-1');
    await dialog.getByLabel('Nombre').fill('E2E nunca se crea');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(
      dialog.getByText('El código solo admite letras mayúsculas, números y guion bajo.'),
    ).toBeVisible();
  });

  test('desactivar un proceso con una solicitud abierta pide confirmación con el recuento', async ({
    page,
    request,
  }) => {
    const proc = await call(request, JEFE, 'post', '/processes', {
      code: `${PREFIX}_W`,
      name: `E2E Proceso web ${RUN}`,
      areaId,
      kind: 'PROCESS',
      sortOrder: SORT_LAST,
    });
    const id = (proc.body as { id: string }).id;
    created.processIds.push(id);
    const req = await call(request, JEFE, 'post', '/requests', {
      title: `E2E confirmar web ${RUN}`,
      mainProcessId: id,
    });
    expect(req.status).toBe(201);

    await page.goto('/administracion/procesos');
    const row = page.getByRole('row').filter({ hasText: `${PREFIX}_W` });
    await row.getByRole('button', { name: 'Desactivar' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(
      confirm.getByRole('heading', { name: `¿Desactivar el proceso «E2E Proceso web ${RUN}»?` }),
    ).toBeVisible();
    await expect(confirm.getByText('1 solicitud abierta')).toBeVisible();
    await expect(confirm.getByText('asignaciones')).toHaveCount(0);
    await expectNoSeriousA11y(page);

    // Cancelar no cambia nada.
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toHaveCount(0);
    const still = await call(request, JEFE, 'get', `/processes/${id}`);
    expect((still.body as { active: boolean }).active).toBe(true);

    await row.getByRole('button', { name: 'Desactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar proceso' }).click();
    await expect(page.getByText('Proceso desactivado.')).toBeVisible();
    const done = await call(request, JEFE, 'get', `/processes/${id}`);
    expect((done.body as { active: boolean }).active).toBe(false);
  });
});

test.describe('Maestras (web)', () => {
  test('el formato del catálogo y del código se valida junto a cada campo', async ({ page }) => {
    await page.goto('/administracion/maestras');
    await page.getByRole('button', { name: 'Nuevo elemento' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Catálogo').fill('mi catalogo');
    await dialog.getByLabel('Código').fill('COD-1');
    await dialog.getByLabel('Etiqueta').fill('E2E nunca se crea');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(
      dialog.getByText('El catálogo solo admite letras mayúsculas, números y guion bajo.'),
    ).toBeVisible();
    await expect(
      dialog.getByText('El código solo admite letras mayúsculas, números y guion bajo.'),
    ).toBeVisible();
    await expect(dialog.getByLabel('Catálogo')).toBeFocused();
  });
});

test.describe('4.3 Compromisos: persona fuera de alcance (web)', () => {
  test('el error de persona va junto al selector, sin toast', async ({ page }) => {
    await page.route('**/commitments', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': WEB_ORIGIN,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({
          statusCode: 400,
          message: 'La persona indicada no existe o no pertenece al proceso.',
          error: 'Bad Request',
        }),
      });
    });
    await page.goto('/seguimiento/reuniones');
    await page.getByRole('tab', { name: /Compromisos/ }).click();
    await page.getByRole('button', { name: 'Compromiso sin acta' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Proceso').click();
    await page.getByRole('option').first().click();
    await dialog.getByLabel('Título').fill('E2E compromiso persona');
    await dialog.getByLabel('Responsable').click();
    const options = page.getByRole('option');
    await options.nth(1).click();
    await dialog.getByRole('button', { name: 'Crear compromiso' }).click();
    const message = 'La persona indicada no existe o no pertenece al proceso.';
    await expect(dialog.getByText(message)).toHaveCount(1);
    await expect(dialog.getByLabel('Responsable')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Título')).toHaveValue('E2E compromiso persona');
  });
});

test.describe('4.4 Actividades recurrentes como administrador (web)', () => {
  test('el administrador ve la sección en el menú, abre en Gestión y no tiene «Qué me toca»', async ({
    page,
    context,
  }) => {
    await actAs(context, ADMIN);
    await page.goto('/actividades-recurrentes');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Actividades recurrentes' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Qué me toca' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Gestión' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', {
        name: 'Actividades recurrentes',
      }),
    ).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('el jefe conserva «Qué me toca» como pestaña inicial', async ({ page }) => {
    await page.goto('/actividades-recurrentes');
    await expect(page.getByRole('tab', { name: 'Qué me toca' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('el administrador recibe una lista vacía en «Qué me toca» (no ve ocurrencias ajenas)', async ({
    request,
  }) => {
    const res = await call(request, ADMIN, 'get', '/recurring-activities/occurrences/my-work');
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items).toEqual([]);
  });

  test('GET /me/permissions del administrador incluye recurring', async ({ request }) => {
    const res = await call(request, ADMIN, 'get', '/me/permissions');
    expect(res.status).toBe(200);
    expect((res.body as { allowedModules: string[] }).allowedModules).toContain('recurring');
  });
});

test.describe('3.4 Indicadores: periodo inválido (web)', () => {
  test('con Desde posterior a Hasta el aviso sale junto a los campos y se conservan las cifras', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/area-control/indicators')) requests.push(req.url());
    });
    await page.goto('/demanda/resumen');
    const from = page.locator('#indicadores-from');
    const to = page.locator('#indicadores-to');
    await expect(from).toBeVisible();
    // Espera a que carguen las cifras del periodo válido.
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    const firstHeading = (await page.getByRole('heading', { level: 2 }).first().innerText()).trim();
    const callsBefore = requests.length;

    await from.fill('2099-12-31');
    const alert = page.getByRole('alert').filter({
      hasText: 'La fecha «Desde» no puede ser posterior a «Hasta».',
    });
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(/Corrige el periodo para actualizar los indicadores\./);
    await expect(from).toHaveAttribute('aria-invalid', 'true');
    await expect(to).toHaveAttribute('aria-invalid', 'true');
    await expect(from).toHaveAttribute('aria-describedby', 'indicadores-periodo-error');
    // No se pidió al servidor y no apareció el esqueleto de carga.
    expect(requests.length).toBe(callsBefore);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    // Las cifras del último periodo válido siguen a la vista.
    await expect(page.getByRole('heading', { level: 2, name: firstHeading }).first()).toBeVisible();
    await expectNoSeriousA11y(page);

    // Al corregir el periodo desaparece el aviso y se recarga.
    await from.fill('2020-01-01');
    await expect(alert).toHaveCount(0);
    await expect(from).not.toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('Capturas (solo con E2E_CAPTURES_DIR)', () => {
  test.skip(!CAPTURES_DIR, 'Define E2E_CAPTURES_DIR para generar las capturas');

  for (const theme of ['claro', 'oscuro'] as const) {
    for (const [label, width, height] of [
      ['1440', 1440, 900],
      ['390', 390, 844],
    ] as const) {
      test(`capturas ${theme} ${label}`, async ({ page, context }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height });
        await context.addInitScript((t) => {
          window.localStorage.setItem('theme', t === 'oscuro' ? 'dark' : 'light');
        }, theme);
        await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light' });
        const shot = async (name: string) => {
          await page.waitForTimeout(500); // termina la animación de diálogos y tooltips
          await page.screenshot({
            path: `${CAPTURES_DIR}/${name}-${theme}-${label}.png`,
            fullPage: false,
          });
        };

        // Diálogo de área con error de código.
        await page.goto('/administracion/areas');
        await page.getByRole('button', { name: 'Nueva área' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Código').fill('mal codigo');
        await dialog.getByLabel('Nombre').fill('E2E captura');
        await dialog.getByRole('button', { name: 'Crear' }).click();
        await expect(dialog.getByText('El código solo admite', { exact: false })).toBeVisible();
        await shot('area-codigo-error');
        await page.keyboard.press('Escape');

        // Fila de área con «Desactivar» bloqueado.
        if (width >= 768) {
          const row = page.getByRole('row').filter({ hasText: areaCode });
          await row.scrollIntoViewIfNeeded();
          await row.getByRole('button', { name: 'Desactivar' }).click({ force: true });
          await expect(page.getByRole('tooltip')).toBeVisible();
        } else {
          // Móvil: la tarjeta con los conteos y el menú de acciones abierto.
          const card = page
            .getByRole('list', { name: 'Áreas' })
            .getByRole('listitem')
            .filter({ hasText: areaCode });
          await card.scrollIntoViewIfNeeded();
          await card.getByRole('button', { name: /Más acciones/ }).click();
          await expect(page.getByRole('menuitem', { name: /Desactivar/ })).toBeVisible();
        }
        await shot('area-desactivar-bloqueado');
        await page.keyboard.press('Escape');

        // Confirmación de proceso.
        const capCode = `${PREFIX}_K${theme === 'claro' ? 'C' : 'O'}${label}`;
        const cap = await call(page.request, JEFE, 'post', '/processes', {
          code: capCode,
          name: `E2E captura ${theme} ${label}`,
          areaId,
          kind: 'PROCESS',
    sortOrder: SORT_LAST,
        });
        const capId = (cap.body as { id: string }).id;
        created.processIds.push(capId);
        await call(page.request, JEFE, 'post', '/requests', {
          title: `E2E captura ${theme} ${label}`,
          mainProcessId: capId,
        });
        await page.goto('/administracion/procesos');
        await page
          .getByRole('row')
          .filter({ hasText: capCode })
          .getByRole('button', { name: 'Desactivar' })
          .click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await shot('proceso-confirmar');
        await page.getByRole('button', { name: 'Cancelar' }).click();

        // Indicadores con periodo invertido.
        await page.goto('/demanda/resumen');
        await expect(page.locator('#indicadores-from')).toBeVisible();
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
        await page.locator('#indicadores-from').fill('2099-12-31');
        await expect(page.getByRole('alert').filter({ hasText: 'Desde' })).toBeVisible();
        await shot('indicadores-periodo');
      });
    }
  }

  test('capturas recurrentes como administrador', async ({ page, context }) => {
    await actAs(context, ADMIN);
    for (const [label, width, height] of [
      ['1440', 1440, 900],
      ['390', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/actividades-recurrentes');
      await expect(page.getByRole('tab', { name: 'Gestión' })).toBeVisible();
      await page.screenshot({ path: `${CAPTURES_DIR}/recurrentes-admin-${label}.png` });
    }
  });
});
