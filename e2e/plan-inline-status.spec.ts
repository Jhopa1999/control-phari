import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Flujo crítico (design §4.1): cambiar el estado de una tarea DESDE el listado
 * del plan, sin abrir la ficha. Modelada sobre responsible-selector.spec.ts: el
 * actor de desarrollo lo fija el storageState del global-setup
 * (jefe@demo.local, JEFE_AREA en los 4 procesos del seed).
 *
 * El seed NO crea requests, planes, fases ni tareas, así que la prueba crea su
 * propio prerrequisito mediante la API real (misma cadena de 7 endpoints del
 * diseño), recorriendo la máquina de estados de la solicitud
 * REGISTRADA → EN_TRIAGE → BACKLOG_PRIORIZADO → COMPROMETIDA → EN_PLANIFICACION
 * y creando un plan en BORRADOR con una fase y una tarea en POR_HACER.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
// Actor del global-setup: JEFE_AREA en los 4 procesos del seed (puede recorrer
// toda la cadena y editar el plan).
const ACTOR = 'jefe@demo.local';
const HEADERS = { 'X-Actor-Id': ACTOR } as const;

/** POST con cabecera de actor; falla explícitamente (sin skip) si no es 2xx. */
async function post(
  api: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await api.post(`${API_URL}${path}`, { headers: HEADERS, data: body });
  expect(res.ok(), `POST ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

let taskTitle = '';
let requestId = '';

test.beforeAll(async ({ request }) => {
  const ts = Date.now();
  // Proceso en alcance del jefe (cualquiera de los 4 del seed sirve).
  const procRes = await request.get(`${API_URL}/processes`, { headers: HEADERS });
  expect(procRes.ok(), `GET /processes → ${procRes.status()}`).toBeTruthy();
  const processes = (await procRes.json()) as Array<{ id: string }>;
  expect(processes.length, 'el seed debe tener procesos').toBeGreaterThan(0);
  const mainProcessId = processes[0].id;

  // 1) Solicitud (REGISTRADA)
  const req = await post(request, '/requests', {
    title: `E2E inline ${ts}`,
    mainProcessId,
  });
  requestId = req.id as string;
  // 2) Triage CONTINUAR → EN_TRIAGE
  await post(request, `/requests/${requestId}/triage`, { decision: 'CONTINUAR' });

  // 2b) Activo base: la priorización exige uno asociado en el triage (gate del
  // backend). El jefe crea el activo y lo asocia a la solicitud.
  const asset = await post(request, '/assets', {
    processId: mainProcessId,
    name: `Activo E2E ${ts}`,
  });
  await post(request, `/requests/${requestId}/asset`, { assetId: asset.id as string });
  // 3) Priorización → BACKLOG_PRIORIZADO
  await post(request, `/requests/${requestId}/priority`, {
    impact: 3,
    alignment: 3,
    riskControl: 3,
    urgency: 3,
    scope: 3,
    dataAvailability: 3,
    feasibility: 3,
    reuse: 3,
  });
  // 4) Aprobación APROBAR → COMPROMETIDA
  await post(request, `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  // 5) Plan (BORRADOR) → EN_PLANIFICACION
  const plan = await post(request, `/requests/${requestId}/plan`, {});
  const planId = plan.id as string;
  // 6) Fase
  const phase = await post(request, `/plans/${planId}/phases`, { name: 'Fase E2E' });
  const phaseId = phase.id as string;
  // 7) Tarea (nace en POR_HACER)
  taskTitle = `Tarea E2E ${ts}`;
  await post(request, `/phases/${phaseId}/tasks`, { title: taskTitle });
});

test('cambia el estado de una tarea desde el listado del plan (sin abrir la ficha)', async ({
  page,
}) => {
  // Entrar directo a la solicitud creada (?requestId= adopta la selección).
  await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);

  // Localizar la fila de la tarea por su título.
  const row = page.getByRole('row', { name: new RegExp(taskTitle) });
  await expect(row).toBeVisible();

  // El control de estado de esa fila: su aria-label incluye el título y el
  // estado actual (Por hacer). Abrirlo.
  const statusTrigger = row.getByRole('button', {
    name: new RegExp(`Cambiar estado de .*${taskTitle}.*Por hacer`),
  });
  await expect(statusTrigger).toBeEnabled();
  await statusTrigger.click();

  // Ofrece EXACTAMENTE «En curso» y «Bloqueada» (transiciones de POR_HACER).
  const menuItems = page.getByRole('menuitem');
  await expect(menuItems).toHaveCount(2);
  await expect(menuItems.filter({ hasText: 'En curso' })).toBeVisible();
  await expect(menuItems.filter({ hasText: 'Bloqueada' })).toBeVisible();

  // Elegir «En curso» y esperar el PATCH /tasks/{id}/status con 200.
  const [statusResponse] = await Promise.all([
    page.waitForResponse(
      (r) => /\/tasks\/[^/]+\/status$/.test(r.url()) && r.request().method() === 'PATCH',
    ),
    menuItems.filter({ hasText: 'En curso' }).click(),
  ]);
  expect(statusResponse.status()).toBe(200);

  // La fila refleja el nuevo estado (badge «En curso») sin navegar a la ficha.
  await expect(row.getByText('En curso', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/seguimiento\/plan/);

  // Toast de éxito (región aria-live de sonner).
  await expect(page.getByText('Estado de la tarea actualizado.')).toBeVisible();
});
