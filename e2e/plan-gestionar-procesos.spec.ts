import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Flujo crítico: el jefe de área corrige, desde la Planificación, los procesos
 * que intervienen en la solicitud (el triage se registra una sola vez). Agregar
 * un proceso habilita al instante a su gente en el selector de responsable;
 * quitar un proceso con tareas asignadas a su gente se bloquea con el motivo;
 * el líder de proceso no ve la acción y la API le responde 403.
 *
 * Crea sus propias personas y solicitud mediante la API real. El actor por
 * defecto es el del global-setup (jefe@demo.local, JEFE_AREA).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const HEADERS = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const ACTION = /Gestionar procesos que intervienen/;

async function send(
  api: APIRequestContext,
  method: 'post' | 'get' | 'put',
  path: string,
  body?: Record<string, unknown>,
  actor: string = HEADERS['X-Actor-Id'],
): Promise<Record<string, unknown> & Array<Record<string, unknown>>> {
  const res = await api[method](`${API_URL}${path}`, {
    headers: { 'X-Actor-Id': actor },
    ...(body ? { data: body } : {}),
  });
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown> & Array<Record<string, unknown>>;
}

const ts = Date.now();
const names = {
  FIID: `Persona Integraciones ${ts}`,
  FIAA: `Persona IA ${ts}`,
} as const;
const userIds: Record<string, string> = {};
const processIds: Record<string, string> = {};
const taskTitle = `Tarea gestionar procesos ${ts}`;

/** Solicitud con plan y fase; el triage deja solo `participantes` (además de FIBI). */
async function crearSolicitud(
  api: APIRequestContext,
  participantes: string[],
  titulo: string,
): Promise<{ requestId: string; phaseId: string }> {
  const req = await send(api, 'post', '/requests', { title: titulo, mainProcessId: processIds.FIBI });
  const requestId = req.id as unknown as string;
  await send(api, 'post', `/requests/${requestId}/triage`, {
    decision: 'CONTINUAR',
    mainProcessId: processIds.FIBI,
    participantProcessIds: participantes.map((c) => processIds[c]),
  });
  const asset = await send(api, 'post', '/assets', {
    processId: processIds.FIBI,
    name: `Activo gestionar procesos ${titulo}`,
  });
  await send(api, 'post', `/requests/${requestId}/asset`, { assetId: asset.id });
  await send(api, 'post', `/requests/${requestId}/priority`, {
    impact: 3,
    alignment: 3,
    riskControl: 3,
    urgency: 3,
    scope: 3,
    dataAvailability: 3,
    feasibility: 3,
    reuse: 3,
  });
  await send(api, 'post', `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  const plan = await send(api, 'post', `/requests/${requestId}/plan`, {});
  const phase = await send(api, 'post', `/plans/${plan.id}/phases`, { name: 'Fase gestionar procesos' });
  return { requestId, phaseId: phase.id as unknown as string };
}

test.beforeAll(async ({ request }) => {
  const processes = (await send(request, 'get', '/processes')) as unknown as Array<{
    id: string;
    code: string;
  }>;
  for (const code of ['FIBI', 'FIID', 'FIAA']) {
    const p = processes.find((x) => x.code === code);
    expect(p, `el seed debe tener el proceso ${code}`).toBeTruthy();
    processIds[code] = p!.id;
  }
  for (const code of ['FIID', 'FIAA'] as const) {
    const user = await send(request, 'post', '/users', {
      identifier: `e2e.gestionar.${code.toLowerCase()}.${ts}@demo.local`,
      name: names[code],
    });
    userIds[code] = user.id as unknown as string;
    await send(request, 'post', '/grants', {
      userId: user.id,
      roleCode: 'INTEGRANTE',
      processId: processIds[code],
    });
  }
});

test('el jefe agrega un proceso al plan y el selector ofrece a su gente al instante', async ({
  page,
  request,
}) => {
  // Triage con un solo proceso interviniente (Integraciones): IA no es elegible.
  const { requestId, phaseId } = await crearSolicitud(request, ['FIBI', 'FIID'], `E2E gestionar agrega ${ts}`);
  await send(request, 'post', `/phases/${phaseId}/tasks`, { title: taskTitle });

  await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
  const row = page.getByRole('row', { name: new RegExp(taskTitle) });
  await expect(row).toBeVisible();
  const trigger = row.getByRole('combobox', { name: new RegExp(`Responsable de .*${taskTitle}`) });
  await trigger.click();
  await expect(page.getByRole('option').filter({ hasText: names.FIID })).toBeVisible();
  await expect(page.getByRole('option').filter({ hasText: names.FIAA })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: ACTION }).click();
  const dialog = page.getByRole('dialog', { name: ACTION });
  await expect(dialog).toBeVisible();
  // El principal va marcado y bloqueado, igual que en el triage.
  await expect(dialog.getByText('Principal · Líder')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Principal/ })).toBeDisabled();
  // Marca el proceso de la persona de IA.
  await dialog.locator(`#participant-${processIds.FIAA}`).check();

  const [put] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/plan/participants') && r.request().method() === 'PUT'),
    dialog.getByRole('button', { name: 'Guardar cambios' }).click(),
  ]);
  expect(put.status()).toBe(200);
  await expect(dialog).toBeHidden();

  // Sin recargar: el selector ya ofrece a la persona de IA y se le asigna.
  await trigger.click();
  const option = page.getByRole('option').filter({ hasText: names.FIAA });
  await expect(option).toBeVisible();
  const [patch] = await Promise.all([
    page.waitForResponse((r) => /\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH'),
    option.click(),
  ]);
  expect(patch.status()).toBe(200);
  await expect(row.getByRole('combobox', { name: /Responsable de/ })).toContainText(names.FIAA);
});

test('quitar un proceso con tareas asignadas a su gente se bloquea y explica el motivo', async ({
  page,
  request,
}) => {
  const { requestId, phaseId } = await crearSolicitud(request, ['FIBI', 'FIID'], `E2E gestionar quita ${ts}`);
  const task = await send(request, 'post', `/phases/${phaseId}/tasks`, {
    title: taskTitle,
    responsibleUserId: userIds.FIID,
  });
  expect(task.id).toBeTruthy();

  await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
  await page.getByRole('button', { name: ACTION }).click();
  const dialog = page.getByRole('dialog', { name: ACTION });
  const integraciones = dialog.locator(`#participant-${processIds.FIID}`);
  await expect(integraciones).toBeChecked();
  await expect(integraciones).toBeDisabled();
  await expect(dialog.getByText(/No se puede quitar: 1 tarea asignada/)).toBeVisible();
  await expect(dialog.getByText(new RegExp(taskTitle))).toBeVisible();

  // La API también lo rechaza con 409 y un mensaje en español.
  const res = await request.put(`${API_URL}/requests/${requestId}/plan/participants`, {
    headers: HEADERS,
    data: { participantProcessIds: [] },
  });
  expect(res.status()).toBe(409);
  expect(((await res.json()) as { message: string }).message).toContain('No se puede quitar');
});

test.describe('líder de proceso', () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: 'actorId', value: 'lider@demo.local' }] }],
    },
  });

  test('no ve la acción y la API responde 403', async ({ page, request }) => {
    const { requestId } = await crearSolicitud(request, ['FIBI', 'FIID'], `E2E gestionar líder ${ts}`);

    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
    await expect(page.getByRole('heading', { name: 'Fases' })).toBeVisible();
    await expect(page.getByRole('button', { name: ACTION })).toHaveCount(0);

    const get = await request.get(`${API_URL}/requests/${requestId}/plan/participants`, {
      headers: { 'X-Actor-Id': 'lider@demo.local' },
    });
    expect(get.status()).toBe(403);
    const put = await request.put(`${API_URL}/requests/${requestId}/plan/participants`, {
      headers: { 'X-Actor-Id': 'lider@demo.local' },
      data: { participantProcessIds: [processIds.FIAA] },
    });
    expect(put.status()).toBe(403);
  });
});
