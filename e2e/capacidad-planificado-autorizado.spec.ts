import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Oleada 2, PR-B (D7, BL-066).
 *
 * «Planificado» en Capacidad cuenta solo tareas de planes AUTORIZADOS en
 * solicitudes vivas; el resumen lista a todas las personas con asignación activa
 * (también sin registros ese mes) y la web las filtra por defecto con «Solo con
 * carga o sin disponibilidad registrada». Los topes de horas se validan en la API.
 *
 * Crea sus propias personas y solicitudes por la API real (prefijo «E2E») en un
 * mes lejano (2030-02). No toca a los usuarios demo. Con E2E_CAPTURAS_DIR guarda
 * capturas a 1440 y 390 en claro y oscuro.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
const MONTH = '2030-02';
const ts = Date.now();

async function call(
  api: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: Record<string, unknown>,
) {
  return api[method](`${API_URL}${path}`, {
    headers: { 'X-Actor-Id': JEFE },
    ...(body ? { data: body } : {}),
  });
}

async function ok<T = Record<string, unknown>>(
  api: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await call(api, method, path, body);
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (res.status() === 204 ? {} : await res.json()) as T;
}

interface SummaryRow {
  userId: string;
  userName: string;
  disponible: number | null;
  comprometido: number;
  planificado: number;
  estado: string;
}

let fibiId = '';
const people: Record<'carga' | 'vacia' | 'holgada', { id: string; name: string }> = {
  carga: { id: '', name: `E2E Capacidad carga ${ts}` },
  vacia: { id: '', name: `E2E Capacidad sin registros ${ts}` },
  holgada: { id: '', name: `E2E Capacidad holgada ${ts}` },
};

async function createPerson(api: APIRequestContext, key: keyof typeof people): Promise<void> {
  const user = await ok<{ id: string }>(api, 'post', '/users', {
    identifier: `e2e.capacidad.${key}.${ts}@demo.local`,
    name: people[key].name,
  });
  people[key].id = user.id;
  await ok(api, 'post', '/grants', { userId: user.id, roleCode: 'INTEGRANTE', processId: fibiId });
}

/** Solicitud con un plan de una tarea para `userId`; `authorize` lo lleva a AUTORIZADO. */
async function createPlanned(
  api: APIRequestContext,
  userId: string,
  label: string,
  hours: number,
  authorize: boolean,
): Promise<string> {
  const req = await ok<{ id: string }>(api, 'post', '/requests', {
    title: `E2E capacidad ${label} ${ts}`,
    mainProcessId: fibiId,
  });
  await ok(api, 'post', `/requests/${req.id}/triage`, {
    decision: 'CONTINUAR',
    mainProcessId: fibiId,
    participantProcessIds: [fibiId],
  });
  const asset = await ok<{ id: string }>(api, 'post', '/assets', {
    processId: fibiId,
    name: `E2E Activo capacidad ${label} ${ts}`,
  });
  await ok(api, 'post', `/requests/${req.id}/asset`, { assetId: asset.id });
  await ok(api, 'post', `/requests/${req.id}/priority`, {
    impact: 3,
    alignment: 3,
    riskControl: 3,
    urgency: 3,
    scope: 3,
    dataAvailability: 3,
    feasibility: 3,
    reuse: 3,
  });
  await ok(api, 'post', `/requests/${req.id}/approval`, { decision: 'APROBAR' });
  const plan = await ok<{ id: string }>(api, 'post', `/requests/${req.id}/plan`, {});
  const phase = await ok<{ id: string }>(api, 'post', `/plans/${plan.id}/phases`, {
    name: 'Fase capacidad',
    startDate: '2030-02-01',
    endDate: '2030-02-28',
  });
  await ok(api, 'post', `/phases/${phase.id}/tasks`, {
    title: `Tarea ${label}`,
    responsibleUserId: userId,
    startDate: '2030-02-05',
    endDate: '2030-02-20',
    estimateHours: hours,
  });
  if (authorize) {
    await ok(api, 'patch', `/requests/${req.id}/plan`, { commitmentDate: '2030-02-20' });
    await ok(api, 'post', `/requests/${req.id}/plan/submit`, {});
    await ok(api, 'post', `/requests/${req.id}/plan/authorize`, {});
  }
  return req.id;
}

async function summary(api: APIRequestContext): Promise<SummaryRow[]> {
  return ok<SummaryRow[]>(api, 'get', `/capacity/summary?month=${MONTH}`);
}

test.beforeAll(async ({ request }) => {
  const processes = await ok<Array<{ id: string; code: string }>>(request, 'get', '/processes');
  const fibi = processes.find((p) => p.code === 'FIBI');
  expect(fibi, 'el seed debe tener el proceso FIBI').toBeTruthy();
  fibiId = fibi!.id;
  for (const key of ['carga', 'vacia', 'holgada'] as const) await createPerson(request, key);
  // La persona holgada tiene disponibilidad y ninguna carga: el filtro la oculta.
  await ok(request, 'post', '/capacity/availability', {
    userId: people.holgada.id,
    month: MONTH,
    availableHours: 100,
  });
});

test.describe.serial('Capacidad: solo planes autorizados y todas las personas (D7)', () => {
  test('un plan en borrador no suma; autorizado sí; la persona sin registros aparece', async ({ request }) => {
    await createPlanned(request, people.carga.id, 'borrador', 50, false);
    let rows = await summary(request);
    expect(rows.find((r) => r.userId === people.carga.id)?.planificado ?? 0).toBe(0);

    await createPlanned(request, people.carga.id, 'autorizado', 10, true);
    rows = await summary(request);
    const carga = rows.find((r) => r.userId === people.carga.id);
    expect(carga?.planificado).toBe(10);

    const vacia = rows.find((r) => r.userId === people.vacia.id);
    expect(vacia).toMatchObject({
      userName: people.vacia.name,
      disponible: null,
      comprometido: 0,
      planificado: 0,
      estado: 'SIN_DISPONIBILIDAD',
    });
    expect(rows.find((r) => r.userId === people.holgada.id)?.estado).toBe('OK');
  });

  test('los topes de horas se validan en la API con mensajes en español', async ({ request }) => {
    const alta = await call(request, 'post', '/capacity/availability', {
      userId: people.vacia.id,
      month: MONTH,
      availableHours: 99999,
    });
    expect(alta.status()).toBe(400);
    expect(await alta.text()).toContain('La disponibilidad no puede superar 744 horas al mes.');

    const asignacion = await call(request, 'post', '/capacity/assignments', {
      userId: people.vacia.id,
      month: MONTH,
      processId: fibiId,
      committedHours: 0,
    });
    expect(asignacion.status()).toBe(400);
    expect(await asignacion.text()).toContain('La asignación debe ser de al menos 1 hora.');
  });

  test('la web filtra por defecto y permite ver a todas las personas', async ({ page }) => {
    await page.goto('/activos/capacidad');
    await page.locator('#capacidad-month').fill(MONTH);

    const filtro = page.getByLabel('Solo con carga o sin disponibilidad registrada');
    await expect(filtro).toBeChecked();
    const tabla = page.getByRole('table', { name: /Resumen de carga por persona/ });
    await expect(tabla.getByText(people.carga.name)).toBeVisible({ timeout: 20_000 });
    await expect(tabla.getByText(people.vacia.name)).toBeVisible();
    await expect(tabla.getByText(people.holgada.name)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Mostrando \d+ de \d+ personas/ })).toBeVisible();
    await expect(tabla.getByRole('columnheader', { name: /Planificado/ })).toContainText('planes autorizados');

    const dir = process.env.E2E_CAPTURAS_DIR;
    async function capturar(nombre: string): Promise<void> {
      if (!dir) return;
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          await page.screenshot({ path: `${dir}/${nombre}-${scheme}-${width}.png`, fullPage: true });
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await capturar('capacidad-filtro-activo');

    const results = await new AxeBuilder({ page }).disableRules(['label-content-name-mismatch']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    await filtro.uncheck();
    await expect(tabla.getByText(people.holgada.name)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /^\d+ personas$/ })).toBeVisible();
    await capturar('capacidad-filtro-desmarcado');
  });

  test('el diálogo de disponibilidad rechaza más de 744 horas junto al campo', async ({ page }) => {
    await page.goto('/activos/capacidad');
    await page.locator('#capacidad-month').fill(MONTH);
    await page.getByRole('button', { name: 'Registrar disponibilidad' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Horas disponibles').fill('99999');
    await dialog.getByRole('button', { name: 'Registrar' }).click();
    await expect(dialog.getByText('La disponibilidad no puede superar 744 horas al mes.')).toBeVisible();
  });
});
