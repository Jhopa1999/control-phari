// Ejecución desde la UI: crear plan, fase y tarea (con responsable); enviar a
// autorización; autorizar (jefe); cambiar estado de la tarea y aceptarla.
// Reutiliza la solicitud A de qa-flows-demanda (Comprometida).
'use strict';
const L = require('./qa-flows-lib.cjs');
const { TITLE_A, findRequest } = require('./qa-flows-demanda.cjs');

const PHASE = 'QA UI · Fase de ejecución';
const TASK = 'QA UI · Tarea de la fase';

async function ensurePlan(page, req) {
  const existing = await L.apiGet('beto', `/requests/${req.id}/plan`).catch(() => null);
  if (existing && existing.id) {
    L.check('plan A ya existe (reejecución)', true, existing.status);
    return existing;
  }
  await L.step('crear plan', async () => {
    const res = L.waitApi(page, 'POST', `/requests/${req.id}/plan`);
    await page.getByRole('button', { name: 'Crear plan' }).click();
    const r = await res;
    L.check('POST /requests/:id/plan', r.status() === 201, String(r.status()));
    L.check('toast «Plan creado…»', await L.toast(page, 'Plan creado'));
    await L.settle(page);
  });
  return L.apiGet('beto', `/requests/${req.id}/plan`);
}

async function ensurePhase(page, planId) {
  const phases = await L.apiGet('beto', `/plans/${planId}/phases`);
  const found = phases.find((p) => p.name === PHASE);
  if (found) {
    L.check('fase A ya existe (reejecución)', true, found.id);
    return found;
  }
  await L.step('crear fase', async () => {
    await page.getByRole('button', { name: 'Nueva fase' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nueva fase' });
    await dialog.waitFor();
    let posted = false;
    const onReq = (r) => {
      if (r.method() === 'POST' && /\/phases$/.test(new URL(r.url()).pathname)) posted = true;
    };
    page.on('request', onReq);
    await dialog.getByRole('button', { name: 'Crear fase' }).click();
    await dialog.getByText('obligatori', { exact: false }).first().waitFor();
    L.check('fase sin nombre: no llama a la API', !posted);
    page.off('request', onReq);
    await dialog.getByLabel('Nombre').fill(PHASE);
    await dialog.getByLabel('Inicio').fill('2027-01-11');
    await dialog.getByLabel('Fin').fill('2027-01-22');
    await dialog.getByLabel('Entregable').fill(`Entregable de prueba (QA). ${L.MARKER}`);
    const res = L.waitApi(page, 'POST', `/plans/${planId}/phases`);
    await dialog.getByRole('button', { name: 'Crear fase' }).click();
    const r = await res;
    const body = await r.json();
    L.check('POST /plans/:id/phases', r.status() === 201 && body.name === PHASE, `${r.status()} ${body.startDate} – ${body.endDate}`);
    L.check('fecha de inicio de la fase sin desfase', body.startDate === '2027-01-11T00:00:00.000Z', body.startDate);
    await dialog.waitFor({ state: 'hidden' });
    await L.settle(page);
  });
  const phases2 = await L.apiGet('beto', `/plans/${planId}/phases`);
  return phases2.find((p) => p.name === PHASE);
}

/** Devuelve la tarea de QA de la fase (por fase, no por título exacto). */
async function qaTask(planId, phaseId) {
  const tasks = await L.apiGet('beto', `/plans/${planId}/tasks`);
  return tasks.find((t) => t.phaseId === phaseId) || null;
}

async function ensureTask(page, planId, phase) {
  const existing = await qaTask(planId, phase.id);
  if (existing) {
    L.check('tarea A ya existe (reejecución)', true, `${existing.title} resp=${existing.responsibleUserId}`);
    return existing;
  }
  await L.step('crear tarea con responsable', async () => {
    const row = page.getByRole('row').filter({ hasText: PHASE });
    await row.getByRole('button', { name: 'Agregar tarea' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
    await dialog.waitFor();
    await dialog.getByLabel('Título').fill(TASK);
    // Responsable: primera persona real del select.
    await L.choose(dialog, page, 'task-responsible', /Beto Lider BI/);
    await dialog.getByLabel('Inicio').fill('2027-01-11');
    await dialog.getByLabel('Vencimiento').fill('2027-01-15');
    await dialog.getByLabel('Esfuerzo (horas)').fill('6');
    await dialog.getByLabel('Descripción').fill(`Tarea creada desde la UI (QA final).\n${L.MARKER}`);
    const res = L.waitApi(page, 'POST', `/phases/${phase.id}/tasks`);
    await dialog.getByRole('button', { name: 'Crear tarea' }).click();
    const r = await res;
    const body = await r.json();
    L.check('POST /phases/:id/tasks', r.status() === 201 && body.title === TASK, `${r.status()} ${body.startDate} – ${body.endDate}`);
    L.check('toast «Tarea creada.»', await L.toast(page, 'Tarea creada.'));
    await dialog.waitFor({ state: 'hidden' });
    await L.settle(page);
  });
  return qaTask(planId, phase.id);
}

/** Si la tarea no tiene responsable, se lo asigna desde la UI (Editar). */
async function ensureResponsible(page, planId, task) {
  if (task.responsibleUserId) {
    L.check('la tarea ya tiene responsable', true, task.responsibleUserId);
    return task;
  }
  await L.step('asignar responsable a la tarea (Editar)', async () => {
    const row = page.getByRole('region', { name: 'Tabla de tareas' }).getByRole('row').filter({ hasText: task.title });
    await row.getByRole('button', { name: 'Editar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar tarea' });
    await dialog.waitFor();
    await L.choose(dialog, page, 'task-responsible', /Beto Lider BI/);
    const res = L.waitApi(page, 'PATCH', `/tasks/${task.id}`);
    await dialog.getByRole('button', { name: /Guardar/ }).click();
    const r = await res;
    const body = await r.json();
    L.check('PATCH /tasks/:id asigna responsable', r.ok() && Boolean(body.responsibleUserId), `${r.status()} resp=${body.responsibleUserId}`);
    await dialog.waitFor({ state: 'hidden' });
    await L.settle(page);
  });
  const tasks = await L.apiGet('beto', `/plans/${planId}/tasks`);
  return tasks.find((t) => t.id === task.id);
}

async function run() {
  const req = await findRequest('beto', TITLE_A);
  if (!req) {
    L.check('plan: hace falta la solicitud A comprometida (ejecuta antes «demanda»)', false);
    return;
  }
  const s = await L.open('beto', 'plan');
  const { page } = s;
  let planId;
  let phase;
  let task;
  try {
    await L.goto(page, `/seguimiento/plan?requestId=${req.id}`);
    await L.choose(page, page, 'plan-request', /Alertas de stock/);
    await L.settle(page);
    const plan = await ensurePlan(page, req);
    planId = plan.id;
    phase = await ensurePhase(page, planId);
    task = await ensureTask(page, planId, phase);
    task = await ensureResponsible(page, planId, task);
    await L.shot(page, 'plan-A-con-fase-y-tarea');

    const fresh = await L.apiGet('beto', `/requests/${req.id}/plan`);
    if (fresh.status === 'BORRADOR' || fresh.status === 'DEVUELTO') {
      await L.step('enviar a autorización', async () => {
        const guide = await L.apiGet('beto', `/requests/${req.id}/plan/guide`);
        if (!guide.canSubmit) {
          L.check('enviar a autorización: la guía aún tiene pendientes', false, guide.pendings.map((p) => p.code));
          return;
        }
        const btn = page.getByRole('button', { name: 'Enviar a autorización' }).first();
        await btn.waitFor();
        await btn.click();
        const dialog = page.getByRole('alertdialog', { name: '¿Enviar el plan a autorización?' });
        await dialog.waitFor();
        const res = L.waitApi(page, 'POST', `/requests/${req.id}/plan/submit`);
        await dialog.getByRole('button', { name: 'Enviar a autorización' }).click();
        const r = await res;
        L.check('POST /plan/submit', r.ok(), String(r.status()));
        await dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
        await L.settle(page);
        const after = await L.apiGet('beto', `/requests/${req.id}/plan`);
        L.check('el plan queda En autorización', after.status === 'EN_AUTORIZACION', after.status);
      });
    } else {
      L.check('plan ya enviado (reejecución)', true, fresh.status);
    }
    L.check('plan (beto): sin errores de consola', s.errors.length === 0, s.errors);
  } finally {
    await s.close();
  }

  // ------------------------------------------------- autorización (jefe)
  const j = await L.open('jefe', 'plan-autorizacion');
  try {
    const p = j.page;
    const plan = await L.apiGet('jefe', `/requests/${req.id}/plan`);
    if (plan.status === 'EN_AUTORIZACION') {
      await L.goto(p, '/administracion/revision');
      await L.step('autorizar plan', async () => {
        const row = p.getByRole('row').filter({ hasText: TITLE_A });
        await row.first().waitFor();
        const res = L.waitApi(p, 'POST', `/requests/${req.id}/plan/authorize`);
        await row.getByRole('button', { name: 'Autorizar' }).click();
        const r = await res;
        L.check('POST /plan/authorize', r.ok(), String(r.status()));
        L.check('toast «Plan autorizado…»', await L.toast(p, 'Plan autorizado'));
        const after = await L.apiGet('jefe', `/requests/${req.id}/plan`);
        L.check('el plan queda Autorizado', after.status === 'AUTORIZADO', after.status);
      });
    } else {
      L.check('plan ya autorizado (reejecución)', true, plan.status);
    }
    L.check('autorización (jefe): sin errores de consola', j.errors.length === 0, j.errors);
  } finally {
    await j.close();
  }

  // ------------------------------- estado y aceptación de la tarea
  const t = await L.open('beto', 'plan-tarea');
  try {
    const p = t.page;
    task = await qaTask(planId, phase.id);
    L.check('la tarea de QA existe para transicionar', Boolean(task), task && `${task.title} ${task.status}`);
    if (task && task.status === 'POR_HACER') {
      await L.goto(p, `/seguimiento/tareas?taskId=${task.id}`);
      await L.step('cambiar estado de la tarea a En curso', async () => {
        await L.choose(p, p, 'task-next-status', 'En curso');
        await p.locator('#task-progress').fill('40');
        await p.locator('#task-evidence').fill(`Avance de prueba (QA). ${L.MARKER}`);
        const res = L.waitApi(p, 'PATCH', `/tasks/${task.id}/status`);
        await p.getByRole('button', { name: 'Guardar cambios' }).click();
        const r = await res;
        const body = await r.json();
        L.check('PATCH /tasks/:id/status -> EN_CURSO', r.ok() && body.status === 'EN_CURSO', `${r.status()} ${body.status} ${body.progress}%`);
        await L.settle(p);
      });
    } else {
      L.check('la tarea ya está en curso (reejecución)', Boolean(task), task && task.status);
    }
  } finally {
    await t.close();
  }

  // Aceptación (jefe): EN_CURSO -> EN_REVISION -> TERMINADA -> aceptar.
  const jj = await L.open('jefe', 'plan-aceptar');
  try {
    const pj = jj.page;
    task = await L.apiGet('jefe', `/plans/${planId}/tasks`).then((xs) => xs.find((x) => x.phaseId === phase.id));
    if (task && task.accepted) {
      L.check('tarea ya aceptada (reejecución)', true);
    } else if (task) {
      await L.goto(pj, `/seguimiento/tareas?taskId=${task.id}`);
      await L.step('llevar la tarea a Terminada y aceptarla', async () => {
        let cur = await L.apiGet('jefe', `/plans/${planId}/tasks`).then((xs) => xs.find((x) => x.id === task.id));
        if (cur.status === 'EN_CURSO') {
          await L.choose(pj, pj, 'task-next-status', 'En revisión');
          const r1 = L.waitApi(pj, 'PATCH', `/tasks/${task.id}/status`);
          await pj.getByRole('button', { name: 'Guardar cambios' }).click();
          await r1;
          await L.settle(pj);
        }
        cur = await L.apiGet('jefe', `/plans/${planId}/tasks`).then((xs) => xs.find((x) => x.id === task.id));
        if (cur.status === 'EN_REVISION') {
          await L.choose(pj, pj, 'task-next-status', 'Terminada');
          const r2 = L.waitApi(pj, 'PATCH', `/tasks/${task.id}/status`);
          await pj.getByRole('button', { name: 'Guardar cambios' }).click();
          const rr2 = await r2;
          L.check('PATCH status -> TERMINADA', rr2.ok(), String(rr2.status()));
          await L.settle(pj);
        }
        const res3 = L.waitApi(pj, 'PATCH', `/tasks/${task.id}/accept`);
        await pj.getByRole('button', { name: 'Aceptar tarea' }).click();
        const r3 = await res3;
        const body3 = await r3.json();
        L.check('PATCH /tasks/:id/accept', r3.ok() && body3.accepted === true, `${r3.status()} accepted=${body3.accepted}`);
        await L.shot(pj, 'plan-tarea-aceptada');
      });
    }
    L.check('aceptación (jefe): sin errores de consola', jj.errors.length === 0, jj.errors);
  } finally {
    await jj.close();
  }
}

module.exports = { run };
