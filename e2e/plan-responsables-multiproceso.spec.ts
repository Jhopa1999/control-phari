import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Flujo crítico: los procesos que el triage deja como participantes (el
 * principal y los marcados en «Procesos que intervienen») habilitan a sus
 * líderes y miembros como responsables en la Planificación de esa solicitud;
 * los procesos NO marcados no habilitan a su gente. Una persona que ya es
 * responsable de una tarea se sigue mostrando con su nombre real aunque su
 * proceso deje de intervenir.
 *
 * El seed solo trae personas del demo, así que la prueba crea sus propias
 * personas (una por proceso) y su propia solicitud mediante la API real. El
 * actor es el del global-setup (jefe@demo.local, JEFE_AREA en los 4 procesos).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const HEADERS = { 'X-Actor-Id': 'jefe@demo.local' } as const;

async function send(
  api: APIRequestContext,
  method: 'post' | 'get' | 'delete',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown> & Array<Record<string, unknown>>> {
  const res = await api[method](`${API_URL}${path}`, {
    headers: HEADERS,
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
const grantIds: Record<string, string> = {};
const processIds: Record<string, string> = {};
const taskTitle = `Tarea multiproceso ${ts}`;

/** Crea la cadena solicitud → triage → plan → fase y devuelve ids. */
async function crearSolicitud(
  api: APIRequestContext,
  participantes: string[],
  titulo: string,
): Promise<{ requestId: string; phaseId: string }> {
  const req = await send(api, 'post', '/requests', {
    title: titulo,
    mainProcessId: processIds.FIBI,
  });
  const requestId = req.id as unknown as string;
  await send(api, 'post', `/requests/${requestId}/triage`, {
    decision: 'CONTINUAR',
    mainProcessId: processIds.FIBI,
    participantProcessIds: participantes.map((c) => processIds[c]),
  });
  const asset = await send(api, 'post', '/assets', {
    processId: processIds.FIBI,
    name: `Activo multiproceso ${titulo}`,
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
  const phase = await send(api, 'post', `/plans/${plan.id}/phases`, { name: 'Fase multiproceso' });
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
      identifier: `e2e.multiproceso.${code.toLowerCase()}.${ts}@demo.local`,
      name: names[code],
    });
    const grant = await send(request, 'post', '/grants', {
      userId: user.id,
      roleCode: 'INTEGRANTE',
      processId: processIds[code],
    });
    grantIds[code] = grant.id as unknown as string;
  }
});

async function abrirSelectorResponsable(
  page: import('@playwright/test').Page,
  requestId: string,
) {
  await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
  const row = page.getByRole('row', { name: new RegExp(taskTitle) });
  await expect(row).toBeVisible();
  return row;
}

test('triage con dos procesos: la planificación ofrece a los miembros de ambos y asigna a uno del segundo', async ({
  page,
  request,
}) => {
  const { requestId, phaseId } = await crearSolicitud(
    request,
    ['FIBI', 'FIID', 'FIAA'],
    `E2E multiproceso ambos ${ts}`,
  );
  await send(request, 'post', `/phases/${phaseId}/tasks`, { title: taskTitle });

  const row = await abrirSelectorResponsable(page, requestId);
  await row.getByRole('combobox', { name: new RegExp(`Responsable de .*${taskTitle}`) }).click();
  const options = page.getByRole('option');
  await expect(options.filter({ hasText: names.FIID })).toBeVisible();
  await expect(options.filter({ hasText: names.FIAA })).toBeVisible();

  const [patch] = await Promise.all([
    page.waitForResponse((r) => /\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH'),
    options.filter({ hasText: names.FIAA }).click(),
  ]);
  expect(patch.status()).toBe(200);
  await expect(row.getByRole('combobox', { name: /Responsable de/ })).toContainText(names.FIAA);
});

test('un proceso no marcado en el triage no habilita a su gente; el responsable existente conserva su nombre', async ({
  page,
  request,
}) => {
  // Solo Integraciones participa: la persona de IA NO debe ser elegible.
  const { requestId, phaseId } = await crearSolicitud(
    request,
    ['FIBI', 'FIID'],
    `E2E multiproceso parcial ${ts}`,
  );
  const task = await send(request, 'post', `/phases/${phaseId}/tasks`, { title: taskTitle });

  const row = await abrirSelectorResponsable(page, requestId);
  const trigger = row.getByRole('combobox', { name: new RegExp(`Responsable de .*${taskTitle}`) });
  await trigger.click();
  const options = page.getByRole('option');
  await expect(options.filter({ hasText: names.FIID })).toBeVisible();
  await expect(options.filter({ hasText: names.FIAA })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // La API rechaza asignar a la persona de un proceso no participante (400).
  const personas = (await send(request, 'get', '/users')) as unknown as Array<{
    id: string;
    name: string;
  }>;
  const iaId = personas.find((p) => p.name === names.FIAA)?.id;
  const iidId = personas.find((p) => p.name === names.FIID)?.id;
  expect(iaId && iidId).toBeTruthy();
  const rechazo = await request.patch(`${API_URL}/tasks/${task.id}`, {
    headers: HEADERS,
    data: { responsibleUserId: iaId },
  });
  expect(rechazo.status()).toBe(400);

  // Se asigna a la persona de Integraciones y luego se le retira el grant (el
  // proceso deja de aportar gente): la tarea se conserva con su nombre real.
  const ok = await request.patch(`${API_URL}/tasks/${task.id}`, {
    headers: HEADERS,
    data: { responsibleUserId: iidId },
  });
  expect(ok.status()).toBe(200);
  await send(request, 'delete', `/grants/${grantIds.FIID}`);

  const row2 = await abrirSelectorResponsable(page, requestId);
  const trigger2 = row2.getByRole('combobox', { name: new RegExp(`Responsable de .*${taskTitle}`) });
  await expect(trigger2).toContainText(names.FIID);
  await expect(row2.getByText('Persona fuera de tu alcance')).toHaveCount(0);
});
