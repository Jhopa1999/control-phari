#!/usr/bin/env node
/**
 * feat-009-check.cjs — verificación de interacción de FEAT-009 sin mutar datos:
 * diálogos abiertos, enviados vacíos (todos los errores a la vez) y cancelados;
 * confirmaciones abiertas y canceladas; foco tras elegir en 390 px.
 */
'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { chromium } = require(require.resolve('@playwright/test', { paths: [ROOT] }));
const BASE = 'http://localhost:3300';

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: Boolean(ok), extra });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
}

async function newPage(browser, actor, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((id) => window.localStorage.setItem('actorId', id), actor);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  return { context, page, consoleErrors };
}

async function waitReady(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, {
    timeout: 30000,
  });
}

async function activeInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return el ? { tag: el.tagName, id: el.id, text: (el.textContent || '').trim().slice(0, 60) } : null;
  });
}

async function chooseOption(page, triggerSelector, optionName) {
  await page.locator(triggerSelector).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- Bitácora, jefe, 1440 ----------
    {
      const { context, page, consoleErrors } = await newPage(browser, 'jefe@demo.local', {
        width: 1440,
        height: 900,
      });
      await page.goto(`${BASE}/seguimiento/bitacora`);
      await waitReady(page);

      // Nuevo diario vacío.
      await page.getByRole('button', { name: 'Nuevo diario' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.waitFor();
      const today = await page.evaluate(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
      check('diario: fecha propuesta = hoy local', (await dlg.locator('#diario-date').inputValue()) === today);
      await dlg.locator('#diario-date').fill('');
      await dlg.getByRole('button', { name: 'Crear diario' }).click();
      check('diario: error proceso', await dlg.getByText('Selecciona un proceso.').isVisible());
      check('diario: error fecha a la vez', await dlg.getByText('La fecha es obligatoria.').isVisible());
      check(
        'diario: aria-invalid en proceso y fecha',
        (await dlg.locator('#diario-process').getAttribute('aria-invalid')) === 'true' &&
          (await dlg.locator('#diario-date').getAttribute('aria-invalid')) === 'true',
      );
      check('diario: foco al primer campo con error', (await activeInfo(page))?.id === 'diario-process');
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });

      // Diario en borrador seleccionado (el primero del jefe es borrador).
      const detailHeading = page.locator('h2[tabindex="-1"]');
      const hasDraftActions = await page.getByRole('button', { name: 'Enviar a revisión' }).isVisible();
      check('detalle: acciones de borrador visibles', hasDraftActions);

      // Agregar actividad vacío.
      await page.getByRole('button', { name: 'Agregar actividad' }).first().click();
      const act = page.getByRole('dialog');
      await act.waitFor();
      await act.locator('#act-hours').fill('1.5');
      await act.getByRole('button', { name: 'Agregar', exact: true }).click();
      check(
        'actividad planificada: regla combinada en FormError',
        await act.locator('#act-form-error').getByText('Una actividad planificada requiere un proyecto o una tarea.').isVisible(),
      );
      check(
        'actividad: error de horas a la vez',
        await act.getByText('Las horas deben ser un entero mayor o igual a 0.').isVisible(),
      );
      const projDesc = (await act.locator('#act-project').getAttribute('aria-describedby')) || '';
      check(
        'actividad planificada: aria-invalid + describedby en proyecto y tarea',
        (await act.locator('#act-project').getAttribute('aria-invalid')) === 'true' &&
          (await act.locator('#act-task').getAttribute('aria-invalid')) === 'true' &&
          projDesc.includes('act-form-error'),
        projDesc,
      );
      check('actividad: foco en proyecto', (await activeInfo(page))?.id === 'act-project');

      await chooseOption(page, '#act-class', 'Extraordinaria');
      await act.locator('#act-requester').fill('Alguien');
      await act.getByRole('button', { name: 'Agregar', exact: true }).click();
      check(
        'actividad extraordinaria: regla combinada',
        await act.getByText('Una actividad extraordinaria requiere solicitante y justificación.').isVisible(),
      );
      check(
        'actividad extraordinaria: aria-invalid solo en justificación (NIT 6b)',
        (await act.locator('#act-justification').getAttribute('aria-invalid')) === 'true' &&
          (await act.locator('#act-requester').getAttribute('aria-invalid')) === null,
      );
      check('actividad: foco en justificación', (await activeInfo(page))?.id === 'act-justification');

      await chooseOption(page, '#act-class', 'Soporte');
      await act.getByRole('button', { name: 'Agregar', exact: true }).click();
      check(
        'actividad soporte: error bajo el activo',
        await act.locator('#act-asset-error').getByText('Una actividad de soporte requiere indicar el activo.').isVisible(),
      );
      check('actividad: valores conservados (horas)', (await act.locator('#act-hours').inputValue()) === '1.5');
      const noScroll = await act.evaluate((el) => !el.className.includes('overflow-y-auto') && !el.className.includes('90vh'));
      check('actividad: sin max-h-[90vh] overflow-y-auto en el contenido', noScroll);
      await act.getByRole('button', { name: 'Cancelar' }).click();
      await act.waitFor({ state: 'hidden' });

      // Confirmación de eliminar diario: abrir y cancelar.
      const delBtn = page.getByRole('button', { name: 'Eliminar', exact: true });
      await delBtn.click();
      const conf = page.getByRole('alertdialog');
      await conf.waitFor();
      const confTitle = await conf.getByRole('heading').first().textContent();
      check('eliminar diario: título de §13.3', /^¿Eliminar el diario del .+\?$/.test(confTitle || ''), confTitle);
      check('eliminar diario: foco inicial en Cancelar', (await activeInfo(page))?.text === 'Cancelar');
      await conf.getByRole('button', { name: 'Cancelar' }).click();
      await conf.waitFor({ state: 'hidden' });
      check('eliminar diario: foco vuelve a Eliminar', (await activeInfo(page))?.text === 'Eliminar');

      // Confirmación de enviar: abrir y cancelar.
      await page.getByRole('button', { name: 'Enviar a revisión' }).click();
      await conf.waitFor();
      check('enviar diario: título', await conf.getByText('¿Enviar el diario a revisión?').isVisible());
      await conf.getByRole('button', { name: 'Cancelar' }).click();
      await conf.waitFor({ state: 'hidden' });

      check('bitácora jefe: sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      // Dos h2 enfocables por script: el de la lista (NIT 4) y el del detalle.
      check('bitácora: h2 de lista y de detalle con tabindex -1', (await detailHeading.count()) === 2);
      await context.close();
    }

    // ---------- Bitácora: eliminar actividad (confirmación) en un borrador con actividades ----------
    {
      let found = false;
      for (const actor of ['jefe@demo.local', 'lider.bi@demo.local', 'integrante.bi@demo.local', 'lider.ia@demo.local']) {
        const { context, page } = await newPage(browser, actor, { width: 1440, height: 900 });
        await page.goto(`${BASE}/seguimiento/bitacora`);
        await waitReady(page);
        const items = page.getByRole('list', { name: 'Mis diarios' }).getByRole('button');
        const n = await items.count();
        for (let i = 0; i < n && !found; i += 1) {
          const txt = (await items.nth(i).textContent()) || '';
          if (!txt.includes('Borrador')) continue;
          await items.nth(i).click();
          await waitReady(page);
          const rows = page.getByRole('region', { name: 'Tabla de actividades del diario' }).locator('tbody tr');
          if ((await rows.count()) === 0) continue;
          found = true;
          const del = rows.first().getByRole('button', { name: 'Eliminar' });
          await del.click();
          const conf = page.getByRole('alertdialog');
          await conf.waitFor();
          check('eliminar actividad: título', await conf.getByText('¿Eliminar esta actividad?').isVisible(), actor);
          check(
            'eliminar actividad: descripción',
            await conf.getByText('Sus horas dejarán de contar en la dedicación del día.').isVisible(),
          );
          await conf.getByRole('button', { name: 'Cancelar' }).click();
          await conf.waitFor({ state: 'hidden' });
          check('eliminar actividad: foco vuelve al botón', (await activeInfo(page))?.text === 'Eliminar');
        }
        await context.close();
        if (found) break;
      }
      if (!found) check('eliminar actividad: no hay borrador con actividades en el dataset (no verificable)', true);
    }

    // ---------- Reporte semanal, jefe, 1440 ----------
    {
      const { context, page, consoleErrors } = await newPage(browser, 'jefe@demo.local', {
        width: 1440,
        height: 900,
      });
      await page.goto(`${BASE}/seguimiento/semanal`);
      await waitReady(page);
      await page.getByRole('button', { name: 'Nuevo reporte semanal' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.waitFor();
      check('semanal: título del diálogo', await dlg.getByRole('heading', { name: 'Nuevo reporte semanal' }).isVisible());
      const monday = await page.evaluate(() => {
        const d = new Date();
        const day = d.getDay();
        d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
      check('semanal: lunes local propuesto', (await dlg.locator('#sem-week').inputValue()) === monday);
      check('semanal: ayuda con tilde', await dlg.getByText('Se usará el lunes de esa semana.').isVisible());
      await dlg.locator('#sem-week').fill('');
      await dlg.getByRole('button', { name: 'Crear reporte semanal' }).click();
      check(
        'semanal: los dos errores a la vez',
        (await dlg.getByText('Selecciona un proceso.').isVisible()) &&
          (await dlg.getByText('Selecciona una fecha de la semana.').isVisible()),
      );
      check('semanal: foco al proceso', (await activeInfo(page))?.id === 'sem-process');
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });

      if (await page.getByRole('button', { name: 'Enviar reporte' }).isVisible()) {
        await page.getByRole('button', { name: 'Enviar reporte' }).click();
        const conf = page.getByRole('alertdialog');
        await conf.waitFor();
        check('enviar reporte: título', await conf.getByText('¿Enviar el reporte semanal?').isVisible());
        await conf.getByRole('button', { name: 'Cancelar' }).click();
        await conf.waitFor({ state: 'hidden' });
        check('enviar reporte: foco vuelve al botón', (await activeInfo(page))?.text === 'Enviar reporte');
      }
      const ids = ['sem-results', 'sem-proposals', 'sem-blockers', 'sem-commitments', 'sem-decisions'];
      let all = true;
      for (const id of ids) all = all && (await page.locator(`#${id}`).count()) === 1;
      check('semanal: 5 secciones con sus ids', all);
      // Un reporte enviado: secciones deshabilitadas y aviso.
      const sent = page.getByRole('list', { name: 'Mis reportes' }).getByRole('button').filter({ hasText: 'Enviado' }).first();
      await sent.click();
      await waitReady(page);
      check(
        'semanal enviado: aviso y secciones deshabilitadas',
        (await page.getByText('El reporte se envió; sus secciones ya no se pueden editar.').isVisible()) &&
          (await page.locator('#sem-results').isDisabled()),
      );
      check('semanal: sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await context.close();
    }

    // ---------- 390 px: el foco pasa al encabezado del detalle ----------
    for (const [route, listName] of [
      ['/seguimiento/bitacora', 'Mis diarios'],
      ['/seguimiento/semanal', 'Mis reportes'],
    ]) {
      const { context, page } = await newPage(browser, 'jefe@demo.local', { width: 390, height: 844 });
      await page.goto(`${BASE}${route}`);
      await waitReady(page);
      const items = page.getByRole('list', { name: listName }).getByRole('button');
      await items.nth(2).click();
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const bar = document.querySelector('header.sticky, [data-mobile-bar], header');
        const r = el ? el.getBoundingClientRect() : null;
        return {
          tag: el ? el.tagName : null,
          text: el ? (el.textContent || '').trim() : null,
          top: r ? r.top : null,
          barBottom: bar ? bar.getBoundingClientRect().bottom : null,
          vh: window.innerHeight,
        };
      });
      const expected = ((await items.nth(2).textContent()) || '').trim();
      check(
        `390 ${route}: foco en el h2 del detalle elegido, visible bajo la barra`,
        info.tag === 'H2' &&
          expected.startsWith(info.text) &&
          info.top !== null &&
          info.top >= (info.barBottom || 0) - 1 &&
          info.top < info.vh,
        info,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`total=${results.length} failed=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
