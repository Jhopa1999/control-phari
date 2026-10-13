// Registro diario desde la UI: diario con actividad y envío a revisión;
// reporte semanal con secciones y envío.
'use strict';
const L = require('./qa-flows-lib.cjs');

const DIARY_DATE = '2027-03-15';
const DIARY_BUTTON = '15 mar 2027 BI Borrador';

// Pulsa un disparador que abre un ConfirmDialog y confirma dentro del diálogo
// (el botón del diálogo repite la misma etiqueta que el disparador).
async function confirmAction(page, triggerName) {
  await page.getByRole('button', { name: triggerName }).first().click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: triggerName }).click();
}

async function run() {
  const s = await L.open('beto', 'registro');
  const { page } = s;
  try {
    // ------------------------------------------------------------- Bitácora
    await L.goto(page, '/seguimiento/bitacora');
    const existing = (await L.apiGet('beto', '/worklog/daily')).find((d) => d.date && d.date.startsWith(DIARY_DATE));
    let diaryId = existing ? existing.id : null;
    if (!diaryId) {
      await L.step('alta de diario', async () => {
        await page.getByRole('button', { name: 'Nuevo diario' }).first().click();
        const d = page.getByRole('dialog', { name: 'Nuevo diario' });
        await d.waitFor();
        await L.choose(d, page, 'diario-process', /^BI$/);
        await d.locator('#diario-date').fill(DIARY_DATE);
        await d.locator('#diario-notes').fill(`Diario de prueba desde la UI. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', '/worklog/daily');
        await d.getByRole('button', { name: 'Crear diario' }).click();
        const r = await res;
        const body = await r.json();
        diaryId = body.id;
        L.check('POST /worklog/daily', r.status() === 201, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('diario de prueba ya existe (reejecución)', true, existing.status);
    }

    const diary = diaryId ? await L.apiGet('beto', `/worklog/daily/${diaryId}`) : null;
    const activities = diary && diary.activities ? diary.activities : [];
    if (diary && diary.status === 'BORRADOR') {
      await page.getByRole('button', { name: DIARY_BUTTON }).first().click();
      await L.settle(page);
      if (activities.length === 0) {
        await L.step('agregar actividad al diario', async () => {
          await page.getByRole('button', { name: 'Agregar actividad' }).first().click();
          const d = page.getByRole('dialog');
          await d.waitFor();
          await L.choose(d, page, 'act-class', /Interna/);
          await d.locator('#act-hours').fill('3');
          await d.locator('#act-description').fill(`Actividad interna de prueba. ${L.MARKER}`);
          const res = L.waitApi(page, 'POST', `/worklog/daily/${diaryId}/activities`);
          await d.getByRole('button', { name: 'Agregar' }).click();
          const r = await res;
          L.check('POST /worklog/daily/:id/activities', r.status() === 201, String(r.status()));
          await d.waitFor({ state: 'hidden' });
          await L.settle(page);
        });
      } else {
        L.check('el diario ya tenía actividades (reejecución)', true, String(activities.length));
      }
      await L.step('enviar diario a revisión', async () => {
        const res = L.waitApi(page, 'POST', `/worklog/daily/${diaryId}/submit`);
        await confirmAction(page, 'Enviar a revisión');
        const r = await res;
        L.check('POST /worklog/daily/:id/submit', r.ok(), String(r.status()));
        await L.settle(page);
      });
    } else {
      L.check('diario ya enviado (reejecución)', true, diary ? diary.status : 'sin diario');
    }
    await L.shot(page, 'bitacora-tras-flujo');

    // --------------------------------------------------------------- Semanal
    await L.goto(page, '/seguimiento/semanal');
    const weekly = (await L.apiGet('beto', '/weekly-reports')).find((w) => w.weekStart && w.weekStart.startsWith('2027-03'));
    let weeklyId = weekly ? weekly.id : null;
    if (!weeklyId) {
      await L.step('alta de semanal', async () => {
        await page.getByRole('button', { name: 'Nuevo reporte semanal' }).first().click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await L.choose(d, page, 'sem-process', /^BI$/);
        await d.locator('#sem-week').fill(DIARY_DATE);
        const res = L.waitApi(page, 'POST', '/weekly-reports');
        await d.getByRole('button', { name: /Crear/ }).click();
        const r = await res;
        const body = await r.json();
        weeklyId = body.id;
        L.check('POST /weekly-reports', r.status() === 201, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('semanal de prueba ya existe (reejecución)', true, weekly.status);
    }

    const weeklyNow = weeklyId ? await L.apiGet('beto', `/weekly-reports/${weeklyId}`) : null;
    if (weeklyNow && weeklyNow.status === 'BORRADOR') {
      // Seleccionar el semanal recién creado (puede no ser el auto-seleccionado).
      await page.getByRole('button', { name: 'Semana del 15 mar 2027 BI Borrador' }).first().click().catch(() => undefined);
      await L.settle(page);
      await L.step('guardar secciones del semanal', async () => {
        await page.locator('#sem-results').fill(`Resultados de prueba. ${L.MARKER}`);
        await page.locator('#sem-blockers').fill('Sin bloqueos (prueba).');
        const res = L.waitApi(page, 'PATCH', `/weekly-reports/${weeklyId}`);
        await page.getByRole('button', { name: 'Guardar secciones' }).click();
        const r = await res;
        L.check('PATCH /weekly-reports/:id', r.ok(), String(r.status()));
        await L.settle(page);
      });
      await L.step('enviar semanal', async () => {
        const res = L.waitApi(page, 'POST', `/weekly-reports/${weeklyId}/submit`);
        await confirmAction(page, 'Enviar reporte');
        const r = await res;
        L.check('POST /weekly-reports/:id/submit', r.ok(), String(r.status()));
        await L.settle(page);
      });
    } else {
      L.check('semanal ya enviado (reejecución)', true, weeklyNow ? weeklyNow.status : 'sin semanal');
    }

    L.check('registro (beto): sin errores de consola', s.errors.length === 0, s.errors);
    await L.shot(page, 'semanal-tras-flujo');
  } finally {
    await s.close();
  }
}

module.exports = { run };
