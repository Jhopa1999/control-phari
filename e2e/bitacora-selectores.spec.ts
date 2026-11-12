import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

/**
 * Bitácora: selectores de proyecto y tarea con buscador (docs/design/bitacora-selectores.md).
 *
 * Prerrequisito creado por la API real: una solicitud del proceso FIBI con plan,
 * dos tareas del integrante demo (una con tilde en el título) y una del jefe. El
 * integrante solo debe ver las suyas; el jefe ve las ajenas con «Todos del área».
 * El diario se crea por API en una fecha única por ejecución y se borra al final.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = 'jefe@demo.local';
const INTEGRANTE = 'integrante@demo.local';

const ts = Date.now();
const titles = {
  mine1: `Revisión de integración ${ts}`,
  mine2: `Ñandú migración ${ts}`,
  other: `Tarea del jefe ${ts}`,
};

let requestCode = '';
let requestId = '';
let processId = '';
let integranteLogId = '';
let jefeLogId = '';
let activityId = '';
const logDate = (() => {
  // Fecha única por ejecución (el diario es único por persona, proceso y día).
  const d = new Date(Date.UTC(2041, 0, 1) + (ts % (300 * 24 * 3600 * 1000)));
  return d.toISOString().slice(0, 10);
})();

async function send(
  api: APIRequestContext,
  actor: string,
  method: 'post' | 'patch' | 'get' | 'delete',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await api[method](`${API_URL}${path}`, { headers: { 'X-Actor-Id': actor }, data: body });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

test.beforeAll(async ({ request }) => {
  const processes = (await (
    await request.get(`${API_URL}/processes`, { headers: { 'X-Actor-Id': JEFE } })
  ).json()) as Array<{ id: string; code: string }>;
  processId = (processes.find((p) => p.code === 'FIBI') ?? processes[0]).id;

  const req = await send(request, JEFE, 'post', '/requests', { title: `E2E selectores ${ts}`, mainProcessId: processId });
  requestId = req.id as string;
  requestCode = req.code as string;
  await send(request, JEFE, 'post', `/requests/${requestId}/triage`, { decision: 'CONTINUAR' });
  const asset = await send(request, JEFE, 'post', '/assets', { processId, name: `Activo selectores ${ts}` });
  await send(request, JEFE, 'post', `/requests/${requestId}/asset`, { assetId: asset.id as string });
  await send(request, JEFE, 'post', `/requests/${requestId}/priority`, {
    impact: 3, alignment: 3, riskControl: 3, urgency: 3, scope: 3, dataAvailability: 3, feasibility: 3, reuse: 3,
  });
  await send(request, JEFE, 'post', `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  const plan = await send(request, JEFE, 'post', `/requests/${requestId}/plan`, {});
  const phase = await send(request, JEFE, 'post', `/plans/${plan.id as string}/phases`, { name: 'Construcción' });
  const phaseId = phase.id as string;

  const integrantePerms = await send(request, INTEGRANTE, 'get', '/me/permissions');
  const jefePerms = await send(request, JEFE, 'get', '/me/permissions');
  const t1 = await send(request, JEFE, 'post', `/phases/${phaseId}/tasks`, { title: titles.mine1 });
  const t2 = await send(request, JEFE, 'post', `/phases/${phaseId}/tasks`, { title: titles.mine2 });
  const t3 = await send(request, JEFE, 'post', `/phases/${phaseId}/tasks`, { title: titles.other });
  await send(request, JEFE, 'patch', `/tasks/${t1.id as string}`, { responsibleUserId: integrantePerms.userId as string });
  await send(request, JEFE, 'patch', `/tasks/${t2.id as string}`, { responsibleUserId: integrantePerms.userId as string });
  await send(request, JEFE, 'patch', `/tasks/${t3.id as string}`, { responsibleUserId: jefePerms.userId as string });

  const logI = await send(request, INTEGRANTE, 'post', '/worklog/daily', { date: logDate, processId });
  integranteLogId = logI.id as string;
  const logJ = await send(request, JEFE, 'post', '/worklog/daily', { date: logDate, processId });
  jefeLogId = logJ.id as string;
  const act = await send(request, INTEGRANTE, 'post', `/worklog/daily/${integranteLogId}/activities`, {
    classificationCode: 'PLANIFICADA',
    projectRequestId: requestId,
    hours: 2,
  });
  activityId = act.id as string;
});

test.afterAll(async ({ request }) => {
  if (integranteLogId) {
    await request.delete(`${API_URL}/worklog/daily/${integranteLogId}`, { headers: { 'X-Actor-Id': INTEGRANTE } });
  }
  if (jefeLogId) {
    await request.delete(`${API_URL}/worklog/daily/${jefeLogId}`, { headers: { 'X-Actor-Id': JEFE } });
  }
});

function asActor(identifier: string) {
  return {
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: 'actorId', value: identifier }] }],
    },
  };
}

async function openNewActivity(page: Page, logId: string) {
  await page.goto(`/seguimiento/bitacora?diario=${logId}`);
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar actividad' });
  await expect(dialog).toBeVisible();
  // Las opciones llegaron: el campo ya no está en «Cargando».
  await expect(dialog.getByRole('combobox', { name: 'Tarea' })).toBeEnabled();
  return dialog;
}

test.describe('integrante', () => {
  test.use(asActor(INTEGRANTE));

  test('solo ve sus tareas, agrupadas por proyecto y fase, y no existe «Novedad relacionada»', async ({ page }) => {
    const dialog = await openNewActivity(page, integranteLogId);
    await expect(dialog.getByText('Novedad relacionada')).toHaveCount(0);
    // El integrante no ve el conmutador del jefe.
    await expect(dialog.getByRole('radiogroup', { name: 'Mostrar' })).toHaveCount(0);

    await dialog.getByRole('combobox', { name: 'Tarea' }).click();
    const list = dialog.getByRole('listbox', { name: 'Tareas' });
    await expect(list.getByRole('option', { name: new RegExp(titles.mine1) })).toBeVisible();
    await expect(list.getByRole('option', { name: new RegExp(titles.mine2) })).toBeVisible();
    await expect(list.getByRole('option', { name: new RegExp(titles.other) })).toHaveCount(0);
    // Grupo con el encabezado «PRY-xxxx · Proyecto › Fase».
    await expect(list.getByRole('group', { name: new RegExp(`${requestCode} · E2E selectores ${ts} › Construcción`) })).toBeVisible();
    await expect(list.getByText('Otras tareas de tus procesos')).toHaveCount(0);
  });

  test('busca por T0X, por código completo y por título sin tildes ni mayúsculas', async ({ page }) => {
    const dialog = await openNewActivity(page, integranteLogId);
    const task = dialog.getByRole('combobox', { name: 'Tarea' });
    await task.click();
    const list = dialog.getByRole('listbox', { name: 'Tareas' });

    // La BD de desarrollo puede tener más tareas del integrante: se acota por el proyecto del fixture.
    await task.fill(`t01 ${requestCode.toLowerCase()}`);
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option', { name: new RegExp(titles.mine1) })).toBeVisible();

    await task.fill(`${requestCode}-T02`.toLowerCase());
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option', { name: new RegExp(titles.mine2) })).toBeVisible();

    await task.fill(`NANDU MIGRACION ${ts}`);
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option', { name: new RegExp(titles.mine2) })).toBeVisible();

    await task.fill('zzzz');
    await expect(list).toHaveCount(0);
    await expect(dialog.getByText('Sin resultados para “zzzz”.')).toBeVisible();
  });

  test('teclado: ↓ ↑ Home End Enter y Escape cierra solo el listado', async ({ page }) => {
    const dialog = await openNewActivity(page, integranteLogId);
    const task = dialog.getByRole('combobox', { name: 'Tarea' });
    await task.focus();
    // Recibir el foco no abre el listado.
    await expect(task).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowDown');
    await expect(task).toHaveAttribute('aria-expanded', 'true');
    // Se acota al proyecto del fixture (2 tareas del integrante).
    await task.fill(requestCode);
    await expect(dialog.getByRole('listbox', { name: 'Tareas' }).getByRole('option')).toHaveCount(2);
    const options = dialog.getByRole('listbox', { name: 'Tareas' }).getByRole('option');
    const activeId = async () => task.getAttribute('aria-activedescendant');
    const firstId = await options.first().getAttribute('id');
    const lastId = await options.last().getAttribute('id');
    expect(await activeId()).toBe(firstId);

    await page.keyboard.press('End');
    expect(await activeId()).toBe(lastId);
    await page.keyboard.press('ArrowUp');
    expect(await activeId()).toBe(firstId);
    await page.keyboard.press('Home');
    expect(await activeId()).toBe(firstId);

    // Escape cierra solo el listado.
    await page.keyboard.press('Escape');
    await expect(task).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog).toBeVisible();

    // Enter con el listado abierto elige la opción y no envía el formulario.
    await task.fill(requestCode);
    await page.keyboard.press('Enter');
    await expect(task).toHaveAttribute('aria-expanded', 'false');
    await expect(task).toHaveValue(new RegExp(`${requestCode}-T0[12] · `));
    await expect(dialog).toBeVisible();

    // Con el listado cerrado, el siguiente Escape cierra el diálogo.
    await task.focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('elegir una tarea rellena el proyecto y se guarda con el ID visible', async ({ page }) => {
    const dialog = await openNewActivity(page, integranteLogId);
    await dialog.getByRole('combobox', { name: 'Tarea' }).click();
    await dialog.getByRole('option', { name: new RegExp(titles.mine1) }).click();

    await expect(dialog.getByRole('combobox', { name: 'Proyecto (solicitud)' })).toHaveValue(
      new RegExp(`^${requestCode} · `),
    );
    await expect(dialog.getByText(`Proyecto actualizado a ${requestCode}.`)).toBeVisible();

    await dialog.getByLabel('Horas (dedicación)').fill('3');
    await dialog.getByRole('button', { name: 'Agregar' }).click();
    await expect(page.getByText('Actividad agregada.')).toBeVisible();
    // Lista del diario: ID de proyecto y de tarea.
    await expect(page.locator(`[data-id-chip="${requestCode}-T01"]`).first()).toBeVisible();
  });

  test('la API rechaza una tarea ajena aunque el cliente la mande', async ({ request }) => {
    const mine = (await (
      await request.get(`${API_URL}/worklog/options?processId=${processId}&date=${logDate}&scope=all&q=${ts}`, {
        headers: { 'X-Actor-Id': JEFE },
      })
    ).json()) as { tasks: Array<{ id: string; title: string; isMine: boolean }> };
    const other = mine.tasks.find((t) => t.title === titles.other);
    expect(other).toBeDefined();
    const res = await request.post(`${API_URL}/worklog/daily/${integranteLogId}/activities`, {
      headers: { 'X-Actor-Id': INTEGRANTE },
      data: { classificationCode: 'PLANIFICADA', taskId: other!.id },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('no está asignada a ti');
  });

  test('edición: conserva el proyecto que ya no es elegible («No disponible») y lo explica', async ({ page }) => {
    await page.route('**/worklog/options**', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { projects: unknown[]; tasks: unknown[] };
      await route.fulfill({ response: res, json: { ...body, projects: [], tasks: [] } });
    });
    await page.goto(`/seguimiento/bitacora?diario=${integranteLogId}`);
    await page.locator('details > summary').first().click();
    await page.locator(`#act-edit-${activityId}`).click();
    const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
    const project = dialog.getByRole('combobox', { name: 'Proyecto (solicitud)' });
    await expect(project).toHaveValue(new RegExp(`^${requestCode} · `));
    await expect(dialog.getByText(/ya no está disponible para imputar/)).toBeVisible();
    await project.click();
    await expect(dialog.getByRole('group', { name: 'Valor actual' })).toBeVisible();
    await expect(dialog.getByRole('option', { name: /No disponible/ })).toBeVisible();
    await page.keyboard.press('Escape');
    // Guardar sin cambiar la referencia sigue permitido (el servidor no la revalida).
    await dialog.getByLabel('Horas (dedicación)').fill('5');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Actividad actualizada.')).toBeVisible();
  });

  test('edición: cambiar de proyecto en una actividad con tarea quita la tarea y guarda (B1)', async ({ page, request }) => {
    test.setTimeout(90_000);
    // Segundo proyecto con una tarea del integrante, para poder elegirlo en el formulario.
    const req2 = await send(request, JEFE, 'post', '/requests', { title: `E2E selectores B ${ts}`, mainProcessId: processId });
    const request2Id = req2.id as string;
    const request2Code = req2.code as string;
    await send(request, JEFE, 'post', `/requests/${request2Id}/triage`, { decision: 'CONTINUAR' });
    const asset2 = await send(request, JEFE, 'post', '/assets', { processId, name: `Activo selectores B ${ts}` });
    await send(request, JEFE, 'post', `/requests/${request2Id}/asset`, { assetId: asset2.id as string });
    await send(request, JEFE, 'post', `/requests/${request2Id}/priority`, {
      impact: 3, alignment: 3, riskControl: 3, urgency: 3, scope: 3, dataAvailability: 3, feasibility: 3, reuse: 3,
    });
    await send(request, JEFE, 'post', `/requests/${request2Id}/approval`, { decision: 'APROBAR' });
    const plan2 = await send(request, JEFE, 'post', `/requests/${request2Id}/plan`, {});
    const phase2 = await send(request, JEFE, 'post', `/plans/${plan2.id as string}/phases`, { name: 'Construcción B' });
    const t = await send(request, JEFE, 'post', `/phases/${phase2.id as string}/tasks`, { title: `Tarea B ${ts}` });
    const perms = await send(request, INTEGRANTE, 'get', '/me/permissions');
    await send(request, JEFE, 'patch', `/tasks/${t.id as string}`, { responsibleUserId: perms.userId as string });

    // Actividad con proyecto A y su tarea (el id de la tarea sale de las opciones).
    const opts = (await (
      await request.get(`${API_URL}/worklog/options?processId=${processId}&date=${logDate}`, { headers: { 'X-Actor-Id': INTEGRANTE } })
    ).json()) as { tasks: Array<{ id: string; title: string }> };
    const taskA = opts.tasks.find((x) => x.title === titles.mine1)!;
    const act = await send(request, INTEGRANTE, 'post', `/worklog/daily/${integranteLogId}/activities`, {
      classificationCode: 'PLANIFICADA',
      taskId: taskA.id,
      hours: 1,
    });
    const actId = act.id as string;

    await page.goto(`/seguimiento/bitacora?diario=${integranteLogId}`);
    // Cada actividad es un <details>: se abre el que contiene esta actividad.
    await page.locator('details', { has: page.locator(`#act-edit-${actId}`) }).locator('summary').click();
    await page.locator(`#act-edit-${actId}`).click();
    const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
    const project = dialog.getByRole('combobox', { name: 'Proyecto (solicitud)' });
    await expect(project).toBeEnabled();
    await project.click();
    await project.fill(request2Code);
    await dialog.getByRole('option', { name: new RegExp(request2Code) }).first().click();
    await expect(dialog.getByRole('combobox', { name: 'Tarea' })).toHaveValue('');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Actividad actualizada.')).toBeVisible();

    const after = (await (
      await request.get(`${API_URL}/worklog/daily/${integranteLogId}`, { headers: { 'X-Actor-Id': INTEGRANTE } })
    ).json()) as { activities: Array<{ id: string; projectRequestId: string | null; taskId: string | null }> };
    const saved = after.activities.find((a) => a.id === actId)!;
    expect(saved.projectRequestId).toBe(request2Id);
    expect(saved.taskId).toBeNull();
  });

  test('edición: un proyecto cerrado se rotula «Cerrado»', async ({ page }) => {
    await page.route('**/worklog/options**', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { projects: unknown[]; tasks: unknown[] };
      await route.fulfill({ response: res, json: { ...body, projects: [], tasks: [] } });
    });
    await page.route(`**/worklog/daily/${integranteLogId}`, async (route) => {
      const res = await route.fetch();
      const log = (await res.json()) as { activities: Array<Record<string, unknown>> };
      log.activities = log.activities.map((a) => ({ ...a, projectRequestState: 'CERRADA' }));
      await route.fulfill({ response: res, json: log });
    });
    await page.goto(`/seguimiento/bitacora?diario=${integranteLogId}`);
    await page.locator('details > summary').first().click();
    await page.locator(`#act-edit-${activityId}`).click();
    const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
    await expect(dialog.getByText(/está cerrado y ya no admite nuevas actividades/)).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Proyecto (solicitud)' }).click();
    await expect(dialog.getByRole('option', { name: /Cerrado/ })).toBeVisible();
  });

  test('con la lista recortada, lo escrito se busca también en el servidor', async ({ page }) => {
    const queries: string[] = [];
    await page.route('**/worklog/options**', async (route) => {
      const url = new URL(route.request().url());
      queries.push(url.searchParams.get('q') ?? '');
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      await route.fulfill({ response: res, json: { ...body, projectsTruncated: true, tasksTruncated: true } });
    });
    const dialog = await openNewActivity(page, integranteLogId);
    const project = dialog.getByRole('combobox', { name: 'Proyecto (solicitud)' });
    await project.click();
    await expect(dialog.getByText('Mostrando las primeras 200. Escribe para acotar.')).toBeVisible();
    await project.fill(requestCode);
    await expect.poll(() => queries.includes(requestCode)).toBeTruthy();
  });

  test('accesibilidad: el diálogo con el listado abierto no tiene violaciones serias', async ({ page }) => {
    const dialog = await openNewActivity(page, integranteLogId);
    await dialog.getByRole('combobox', { name: 'Tarea' }).click();
    await expect(dialog.getByRole('listbox', { name: 'Tareas' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html).slice(0, 2) })))).toEqual([]);
  });
});

test.describe('jefe de área', () => {
  test.use(asActor(JEFE));

  test('conmutador «Mis proyectos / Todos del área» y grupo de tareas ajenas', async ({ page }) => {
    const dialog = await openNewActivity(page, jefeLogId);
    const scope = dialog.getByRole('radiogroup', { name: 'Mostrar' });
    await expect(scope).toBeVisible();
    await expect(scope.getByLabel('Mis proyectos')).toBeChecked();

    const task = dialog.getByRole('combobox', { name: 'Tarea' });
    await task.click();
    const list = dialog.getByRole('listbox', { name: 'Tareas' });
    await expect(list.getByRole('option', { name: new RegExp(titles.other) })).toBeVisible();
    await expect(list.getByRole('option', { name: new RegExp(titles.mine1) })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await scope.getByText('Todos del área').click();
    await task.click();
    // En la BD de desarrollo «Todos del área» supera el tope de 200: se acota por el fixture
    // (con lista recortada, lo escrito se busca también en el servidor).
    await task.fill(String(ts));
    await expect(list.getByRole('group', { name: 'Otras tareas de tus procesos' })).toBeVisible();
    await expect(list.getByRole('option', { name: new RegExp(titles.mine1) })).toBeVisible();
  });

  test('elegir un proyecto filtra sus tareas y cambiar de proyecto quita la tarea', async ({ page }) => {
    const dialog = await openNewActivity(page, jefeLogId);
    const task = dialog.getByRole('combobox', { name: 'Tarea' });
    await task.click();
    await dialog.getByRole('option', { name: new RegExp(titles.other) }).click();
    await expect(dialog.getByRole('combobox', { name: 'Proyecto (solicitud)' })).toHaveValue(new RegExp(`^${requestCode} · `));

    // Limpiar el proyecto quita la tarea que le pertenecía y lo explica.
    await dialog.getByRole('button', { name: 'Quitar proyecto seleccionado' }).click();
    await page.keyboard.press('Escape');
    await expect(task).toHaveValue('');
    await expect(dialog.getByText('Se quitó la tarea porque pertenece a otro proyecto.')).toBeVisible();
  });
});
