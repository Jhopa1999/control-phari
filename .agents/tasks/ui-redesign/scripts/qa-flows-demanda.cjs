// Demanda desde la UI: alta y edición de solicitud, triage, evaluación,
// aprobación y devolución, con los toasts encadenados («Ir a triage»,
// «Ir a priorización», «Ir a aprobaciones»).
'use strict';
const L = require('./qa-flows-lib.cjs');

const TITLE_A = 'QA flujos · Alertas de stock crítico por bodega';
const TITLE_B = 'QA flujos · Conciliación semanal de devoluciones';

async function chooseFirstReal(scope, page, triggerId) {
  await scope.locator(`#${triggerId}`).click();
  const options = page.getByRole('listbox').getByRole('option');
  const names = await options.allInnerTexts();
  const idx = names.findIndex((n) => !/^Sin /.test(n.trim()));
  await L.pick(page, options.nth(idx));
  return names[idx].trim();
}

async function findRequest(actor, title) {
  const list = await L.apiGet(actor, '/requests');
  return list.find((r) => r.title === title) || null;
}

/** Última acción del toast con ese nombre (evita strict mode si hay varios). */
async function clickLastToastAction(page, name) {
  const buttons = page.locator('[data-sonner-toast]').getByRole('button', { name });
  await buttons.last().click();
}

async function createRequest(page, title, { participant } = {}) {
  await page.getByRole('button', { name: 'Nueva solicitud' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nueva solicitud' });
  await dialog.waitFor();
  // Validación local: sin título ni proceso no se envía.
  let posted = false;
  const onReq = (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/requests') posted = true;
  };
  page.on('request', onReq);
  await dialog.getByRole('button', { name: 'Registrar solicitud' }).click();
  await dialog.getByText('obligatori', { exact: false }).first().waitFor();
  L.check(`${title}: el envío vacío muestra errores y no llama a la API`, !posted);
  page.off('request', onReq);
  await dialog.locator('#sol-title').fill(title);
  await L.choose(dialog, page, 'sol-main-process', /^BI$/);
  if (participant) {
    const box = dialog.getByRole('checkbox', { name: participant });
    if ((await box.count()) > 0) await box.check();
    else L.check(`${title}: sin otros procesos activos en el alcance para participar`, true, participant);
  }
  await dialog.locator('#sol-area').fill('Logística (QA)');
  await dialog.locator('#sol-requester').fill('Persona de prueba QA');
  await dialog.locator('#sol-owner').fill('Coordinación logística (QA)');
  await dialog.locator('#sol-target').fill('2027-02-26');
  await dialog.locator('#sol-result').fill(`Creada desde la UI por la QA final del rediseño.\n${L.MARKER}`);
  const res = L.waitApi(page, 'POST', '/requests');
  await dialog.getByRole('button', { name: 'Registrar solicitud' }).click();
  const r = await res;
  const body = await r.json();
  L.check(`${title}: POST /requests`, r.status() === 201, `${r.status()} participantes=${(body.participants || []).length} targetDate=${body.targetDate}`);
  L.check(`${title}: fecha objetivo enviada como el día elegido`, body.targetDate === '2027-02-26T00:00:00.000Z', body.targetDate);
  L.check(`${title}: toast «Solicitud registrada.»`, await L.toast(page, 'Solicitud registrada.'));
  await dialog.waitFor({ state: 'hidden' });
  return body;
}

async function triageFor(page, req, label, follow) {
  const fresh = (await L.apiGet('beto', `/requests/${req.id}`)) || req;
  if (fresh.currentTriageDecision) {
    L.check(`triage ${label} ya registrado (reejecución)`, true, fresh.currentTriageDecision);
    return;
  }
  const trigger = page.locator('#triage-request');
  L.check(`Triage preselecciona ${label}`, (await trigger.innerText()).includes(req.title), (await trigger.innerText()).trim());
  // Sin decisión no se envía.
  let posted = false;
  const onReq = (r) => {
    if (r.method() === 'POST' && /\/triage$/.test(new URL(r.url()).pathname)) posted = true;
  };
  page.on('request', onReq);
  await page.getByRole('button', { name: 'Guardar triage' }).click();
  await page.getByText('La decisión es obligatoria.').first().waitFor();
  L.check(`triage ${label}: sin decisión no llama a la API`, !posted);
  page.off('request', onReq);
  const ruta = await chooseFirstReal(page, page, 'triage-route');
  await chooseFirstReal(page, page, 'triage-type');
  await chooseFirstReal(page, page, 'triage-criticality');
  await chooseFirstReal(page, page, 'triage-size');
  await chooseFirstReal(page, page, 'triage-data');
  await page.locator('#triage-effort').fill('40');
  await page.locator('#triage-responsible').fill('Beto Lider BI');
  await page.locator('#triage-notes').fill(`Triage desde la UI (QA final).\n${L.MARKER}`);
  await page.getByRole('radio', { name: 'Continuar' }).check();
  const res = L.waitApi(page, 'POST', `/requests/${req.id}/triage`);
  await page.getByRole('button', { name: 'Guardar triage' }).click();
  const r = await res;
  const body = await r.json();
  L.check(`POST triage ${label}`, r.status() === 201 && body.decision === 'CONTINUAR', `${r.status()} ruta=${ruta} decision=${body.decision} horas=${body.totalEffortHours}`);
  L.check(`toast «Triage registrado.» (${label})`, await L.toast(page, 'Triage registrado.'));
  if (follow) {
    await clickLastToastAction(page, 'Ir a priorización');
    await page.waitForURL(/\/demanda\/priorizacion\?requestId=/);
    L.check(`«Ir a priorización» lleva a Priorización con ${label}`, page.url().includes(req.id));
  }
  await L.clearToasts(page);
}

async function evaluate(page, req, label, scores, follow) {
  const fresh = await L.apiGet('beto', `/requests/${req.id}`);
  if (fresh.currentScore !== null && fresh.currentScore !== undefined) {
    L.check(`evaluación ${label} ya registrada (reejecución)`, true, String(fresh.currentScore));
    return;
  }
  L.check(`Priorización preselecciona ${label}`, (await page.locator('#priority-request').innerText()).includes(req.title));
  // Ids estables `priority-<key>-<valor>`; el input es sr-only, se pulsa su label.
  const KEY = { Impacto: 'impact', 'Alineación': 'alignment', 'Control del riesgo': 'riskControl', Urgencia: 'urgency', Alcance: 'scope', 'Disponibilidad de datos': 'dataAvailability', Factibilidad: 'feasibility', 'Reutilización': 'reuse' };
  for (const [criterion, value] of Object.entries(scores)) {
    const input = page.locator(`#priority-${KEY[criterion]}-${value}`);
    await input.locator('xpath=ancestor::label[1]').click();
    L.check(`criterio ${criterion}=${value} queda marcado (${label})`, await input.isChecked());
  }
  await page.locator('#priority-justification').fill(`Evaluación desde la UI (QA final). ${L.MARKER}`);
  const res = L.waitApi(page, 'POST', `/requests/${req.id}/priority`);
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  const r = await res;
  const body = await r.json();
  L.check(`POST priority ${label}`, r.status() === 201 && body.impact === scores.Impacto, `${r.status()} score=${body.score} ${body.thresholdLabel} impacto=${body.impact}`);
  L.check(`toast «Evaluación guardada. Score …» (${label})`, await L.toast(page, `Score ${body.score}`));
  if (follow) {
    await clickLastToastAction(page, 'Ir a aprobaciones');
    await page.waitForURL(/\/administracion\/revision/);
    L.check(`«Ir a aprobaciones» lleva a Aprobaciones (${label})`, true);
    await L.settle(page);
    L.check(`${label} aparece en «Compromisos por aprobar»`, (await page.getByRole('row').filter({ hasText: req.title }).count()) === 1);
  }
  await L.clearToasts(page);
}

async function run() {
  // ---------------------------------------------------------- B: alta + edición
  const s = await L.open('beto', 'demanda');
  const { page } = s;
  try {
    await L.goto(page, '/demanda/solicitudes');
    let reqB = await findRequest('beto', TITLE_B);
    if (!reqB) {
      await L.step('alta solicitud B', () => createRequest(page, TITLE_B, { participant: 'Integraciones' }));
      await s.flush();
      reqB = await findRequest('beto', TITLE_B);
    } else {
      L.check('solicitud B ya existía (reejecución)', true, reqB.id);
    }
    await L.clearToasts(page);
    await L.settle(page);
    await L.step('edición de la solicitud B', async () => {
      await page.getByLabel('Buscar').fill('Conciliación semanal');
      await L.settle(page);
      await page.getByRole('button', { name: TITLE_B, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Editar solicitud' });
      await dialog.waitFor();
      L.check('la ficha abre con el título guardado', (await dialog.locator('#sol-title').inputValue()) === TITLE_B);
      await dialog.locator('#sol-requester').fill('Persona de prueba QA (editada)');
      await dialog.locator('#sol-justification').fill('Ajuste del solicitante desde la UI (QA final).');
      const res = L.waitApi(page, 'PATCH', `/requests/${reqB.id}`);
      await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
      const r = await res;
      const body = await r.json();
      L.check('PATCH /requests/:id de la edición', r.ok() && body.requesterName === 'Persona de prueba QA (editada)', `${r.status()} ${body.requesterName}`);
      L.check('toast «Solicitud actualizada.»', await L.toast(page, 'Solicitud actualizada.'));
      await dialog.waitFor({ state: 'hidden' });
      await L.clearToasts(page);
    });
    // -------------------------------------------- A: alta + «Ir a triage» del toast
    let reqA = await findRequest('beto', TITLE_A);
    if (!reqA) {
      await page.getByLabel('Buscar').fill('');
      await L.step('alta solicitud A', () => createRequest(page, TITLE_A));
      await s.flush();
      reqA = await findRequest('beto', TITLE_A);
      await L.step('acción «Ir a triage» del toast', async () => {
        await clickLastToastAction(page, 'Ir a triage');
        await page.waitForURL(/\/demanda\/triage\?requestId=/);
        L.check('«Ir a triage» lleva a Triage con la solicitud', page.url().includes(reqA.id));
      });
    } else {
      L.check('solicitud A ya existía (reejecución)', true, reqA.id);
      await L.goto(page, `/demanda/triage?requestId=${reqA.id}`);
    }
    await L.clearToasts(page);
    await L.settle(page);
    await L.shot(page, 'demanda-triage-A');
    // ------------------------------------------------------------- triage A
    await L.step('triage A', () => triageFor(page, reqA, 'A', true));
    if (!page.url().includes('/demanda/priorizacion')) await L.goto(page, `/demanda/priorizacion?requestId=${reqA.id}`);
    await L.settle(page);
    // ---------------------------------------------------------- evaluación A
    await L.step('evaluación A', () =>
      evaluate(page, reqA, 'A', { Impacto: 5, 'Alineación': 4, 'Control del riesgo': 4, Urgencia: 5, Alcance: 3, 'Disponibilidad de datos': 4, Factibilidad: 4, 'Reutilización': 3 }, true),
    );
    // -------------------------------------------------------- triage + eval B
    await L.goto(page, `/demanda/triage?requestId=${reqB.id}`);
    await L.step('triage B', () => triageFor(page, reqB, 'B', false));
    await L.goto(page, `/demanda/priorizacion?requestId=${reqB.id}`);
    await L.step('evaluación B', () =>
      evaluate(page, reqB, 'B', { Impacto: 2, 'Alineación': 2, 'Control del riesgo': 3, Urgencia: 2, Alcance: 2, 'Disponibilidad de datos': 3, Factibilidad: 3, 'Reutilización': 2 }, false),
    );
    L.check('demanda (beto): sin errores de consola', s.errors.length === 0, s.errors);
  } finally {
    await s.close();
  }
  // -------------------------------------------- aprobación y devolución (jefe)
  const j = await L.open('jefe', 'demanda-aprobaciones');
  try {
    const p = j.page;
    await L.goto(p, '/administracion/revision');
    const reqA = await findRequest('jefe', TITLE_A);
    const reqB = await findRequest('jefe', TITLE_B);
    if (reqA && reqA.operationalState === 'BACKLOG_PRIORIZADO') {
      await L.step('aprobar A', async () => {
        const row = p.getByRole('row').filter({ hasText: TITLE_A });
        const res = L.waitApi(p, 'POST', `/requests/${reqA.id}/approval`);
        await row.getByRole('button', { name: 'Aprobar' }).click();
        const r = await res;
        const body = await r.json();
        L.check('POST approval APROBAR (A)', r.status() === 201 && body.decision === 'APROBAR', `${r.status()} ${body.decision}`);
        L.check('toast «Solicitud aprobada. Pasa a Comprometida.»', await L.toast(p, 'Solicitud aprobada. Pasa a Comprometida.'));
        await L.settle(p);
        L.check('A sale de la cola', (await p.getByRole('row').filter({ hasText: TITLE_A }).count()) === 0);
        const after = await L.apiGet('jefe', `/requests/${reqA.id}`);
        L.check('A queda Comprometida', after.operationalState === 'COMPROMETIDA', after.operationalState);
      });
    } else {
      L.check('A ya aprobada (reejecución)', true, reqA ? reqA.operationalState : 'sin A');
    }
    if (reqB && reqB.operationalState === 'BACKLOG_PRIORIZADO') {
      await L.step('devolver B', async () => {
        const row = p.getByRole('row').filter({ hasText: TITLE_B });
        await row.getByRole('button', { name: 'Devolver' }).click();
        const dialog = p.getByRole('dialog', { name: 'Devolver solicitud' });
        await dialog.waitFor();
        let posted = false;
        const onReq = (r) => {
          if (r.method() === 'POST' && /\/approval$/.test(new URL(r.url()).pathname)) posted = true;
        };
        p.on('request', onReq);
        await dialog.getByRole('button', { name: 'Devolver' }).click();
        await dialog.getByRole('alert').first().waitFor().catch(() => undefined);
        L.check('devolver sin motivo: error en el campo y sin llamada', !posted && (await dialog.locator('#devolver-reason').getAttribute('aria-invalid')) === 'true');
        p.off('request', onReq);
        await dialog.locator('#devolver-reason').fill('Falta acotar el alcance de la conciliación (QA final).');
        const res = L.waitApi(p, 'POST', `/requests/${reqB.id}/approval`);
        await dialog.getByRole('button', { name: 'Devolver' }).click();
        const r = await res;
        const body = await r.json();
        L.check('POST approval DEVOLVER (B)', r.status() === 201 && body.decision === 'DEVOLVER', `${r.status()} ${body.decision} «${body.reason}»`);
        L.check('toast «Solicitud devuelta a triage.»', await L.toast(p, 'Solicitud devuelta a triage.'));
        await dialog.waitFor({ state: 'hidden' });
        const after = await L.apiGet('jefe', `/requests/${reqB.id}`);
        L.check('B vuelve a triage', after.operationalState !== 'BACKLOG_PRIORIZADO', after.operationalState);
      });
    } else {
      L.check('B ya devuelta (reejecución)', true, reqB ? reqB.operationalState : 'sin B');
    }
    await L.shot(p, 'aprobaciones-tras-flujo');
    L.check('aprobaciones (jefe): sin errores de consola', j.errors.length === 0, j.errors);
  } finally {
    await j.close();
  }
}

module.exports = { run, TITLE_A, TITLE_B, findRequest };
