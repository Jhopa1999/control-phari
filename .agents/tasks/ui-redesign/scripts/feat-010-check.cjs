#!/usr/bin/env node
/**
 * feat-010-check.cjs — verificación de interacción de FEAT-010 sin mutar datos:
 * los 3 diálogos de alta abiertos, enviados vacíos (todos los errores a la vez)
 * y cancelados; confirmación de eliminar reunión abierta y cancelada; ids del
 * inventario; grupo «Cambiar estado a:»; foco tras elegir en 390 px.
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
    return el ? { tag: el.tagName, id: el.id, text: (el.textContent || '').trim().slice(0, 80) } : null;
  });
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function allIds(dlg, ids) {
  const missing = [];
  for (const id of ids) if ((await dlg.locator(`#${id}`).count()) !== 1) missing.push(id);
  return missing;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- Novedades, jefe, 1440 ----------
    {
      const { context, page, consoleErrors } = await newPage(browser, 'jefe@demo.local', { width: 1440, height: 900 });
      await page.goto(`${BASE}/seguimiento/novedades`);
      await waitReady(page);
      check('novedades: h1', (await page.locator('h1').textContent()) === 'Novedades');
      check('novedades: autoselección (aria-current)', (await page.locator('[aria-current="true"]').count()) >= 1);
      check(
        'novedades: ficha con los 5 términos',
        (await page.locator('dt').allTextContents()).join('|') === 'Responsable|Fecha objetivo|Detalle|Impacto|Resolución',
      );
      check('novedades: grupo «Cambiar estado a:»', await page.getByRole('heading', { name: 'Cambiar estado a:' }).isVisible());

      await page.getByRole('button', { name: 'Nueva novedad' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.waitFor();
      check(
        'novedad: ids del inventario',
        (await allIds(dlg, ['nov-process', 'nov-date', 'nov-type', 'nov-title', 'nov-detail', 'nov-impact', 'nov-resolver', 'nov-target', 'nov-resolution'])).length === 0,
      );
      check('novedad: fecha = hoy local', (await dlg.locator('#nov-date').inputValue()) === todayLocal());
      check('novedad: tipo por defecto Bloqueo', ((await dlg.locator('#nov-type').textContent()) || '').includes('Bloqueo'));
      check('novedad: responsable por defecto Sin asignar', ((await dlg.locator('#nov-resolver').textContent()) || '').includes('Sin asignar'));
      check('novedad: botón Crear novedad', await dlg.getByRole('button', { name: 'Crear novedad' }).isVisible());
      await dlg.locator('#nov-date').fill('');
      await dlg.getByRole('button', { name: 'Crear novedad' }).click();
      check(
        'novedad: los 3 errores a la vez',
        (await dlg.getByText('Selecciona un proceso.').isVisible()) &&
          (await dlg.getByText('La fecha es obligatoria.').isVisible()) &&
          (await dlg.getByText('El título es obligatorio.').isVisible()),
      );
      check(
        'novedad: aria-invalid en proceso, fecha y título',
        (await dlg.locator('#nov-process').getAttribute('aria-invalid')) === 'true' &&
          (await dlg.locator('#nov-date').getAttribute('aria-invalid')) === 'true' &&
          (await dlg.locator('#nov-title').getAttribute('aria-invalid')) === 'true',
      );
      check('novedad: foco al primer campo con error', (await activeInfo(page))?.id === 'nov-process');
      await dlg.locator('#nov-title').fill('x');
      check('novedad: el error del título se limpia al editar', !(await dlg.getByText('El título es obligatorio.').isVisible()));
      const noScroll = await dlg.evaluate((el) => !el.className.includes('90vh'));
      check('novedad: sin max-h-[90vh] en el contenido', noScroll);
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });

      // Editar: proceso y fecha deshabilitados.
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      await dlg.waitFor();
      check(
        'novedad editar: proceso y fecha deshabilitados',
        (await dlg.locator('#nov-process').isDisabled()) && (await dlg.locator('#nov-date').isDisabled()),
      );
      check('novedad editar: botón Guardar cambios', await dlg.getByRole('button', { name: 'Guardar cambios' }).isVisible());
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);
      const afterEdit = await activeInfo(page);
      check('novedad editar: foco vuelve a Editar', afterEdit?.text === 'Editar', afterEdit);

      // Una novedad archivada o completada muestra sus destinos; ninguna en borrador
      // tiene transiciones (texto).
      const items = page.getByRole('list', { name: 'Novedades' }).getByRole('button');
      const n = await items.count();
      let checkedNone = false;
      for (let i = 0; i < n; i += 1) {
        const txt = (await items.nth(i).textContent()) || '';
        if (txt.includes('Borrador')) {
          await items.nth(i).click();
          check('novedad borrador: texto sin transiciones', await page.getByText('No hay transiciones disponibles desde este estado.').isVisible());
          checkedNone = true;
          break;
        }
      }
      if (!checkedNone) check('novedad borrador: no hay novedades en borrador en el dataset (no verificable)', true);
      for (let i = 0; i < n; i += 1) {
        const txt = (await items.nth(i).textContent()) || '';
        if (txt.includes('Archivado')) {
          await items.nth(i).click();
          const group = page.getByRole('group', { name: 'Cambiar estado a:' });
          const labels = await group.getByRole('button').allTextContents();
          check('novedad archivada: un solo destino En curso', labels.join('|') === 'En curso', labels);
          break;
        }
      }
      check('novedades: sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await context.close();
    }

    // ---------- Reuniones, jefe, 1440 ----------
    {
      const { context, page, consoleErrors } = await newPage(browser, 'jefe@demo.local', { width: 1440, height: 900 });
      await page.goto(`${BASE}/seguimiento/reuniones`);
      await waitReady(page);
      check('reuniones: h1', (await page.locator('h1').textContent()) === 'Reuniones');
      await page.getByRole('button', { name: 'Nueva reunión' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.waitFor();
      check(
        'reunión: ids del inventario',
        (await allIds(dlg, ['reu-process', 'reu-title', 'reu-date', 'reu-time', 'reu-responsible', 'reu-agenda', 'reu-decisions', 'reu-notes'])).length === 0,
      );
      check('reunión: descripción', await dlg.getByText('La reunión inicia en estado Borrador.').isVisible());
      check('reunión: fecha = hoy local', (await dlg.locator('#reu-date').inputValue()) === todayLocal());
      check('reunión: hora type=time', (await dlg.locator('#reu-time').getAttribute('type')) === 'time');
      check('reunión: participantes como grupo de casillas', (await dlg.getByRole('group', { name: 'Participantes' }).getByRole('checkbox').count()) > 0);
      await dlg.locator('#reu-date').fill('');
      await dlg.getByRole('button', { name: 'Crear reunión' }).click();
      check(
        'reunión: los 3 errores a la vez',
        (await dlg.getByText('Selecciona un proceso.').isVisible()) &&
          (await dlg.getByText('El título es obligatorio.').isVisible()) &&
          (await dlg.getByText('La fecha es obligatoria.').isVisible()),
      );
      check('reunión: foco al proceso', (await activeInfo(page))?.id === 'reu-process');
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });

      // Editar: proceso deshabilitado.
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      await dlg.waitFor();
      check('reunión editar: proceso deshabilitado', await dlg.locator('#reu-process').isDisabled());
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);
      check('reunión editar: foco vuelve a Editar', (await activeInfo(page))?.text === 'Editar');

      // Eliminar: abrir y cancelar.
      const title = ((await page.locator('h2[tabindex="-1"]').last().textContent()) || '').trim();
      await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      const conf = page.getByRole('alertdialog');
      await conf.waitFor();
      check('eliminar reunión: título de §13.3', await conf.getByText(`¿Eliminar la reunión «${title}»?`).isVisible(), title);
      check('eliminar reunión: descripción', await conf.getByText('Esta acción no se puede deshacer.').isVisible());
      check('eliminar reunión: botón Eliminar reunión', await conf.getByRole('button', { name: 'Eliminar reunión' }).isVisible());
      check('eliminar reunión: foco inicial en Cancelar', (await activeInfo(page))?.text === 'Cancelar');
      await conf.getByRole('button', { name: 'Cancelar' }).click();
      await conf.waitFor({ state: 'hidden' });
      check('eliminar reunión: foco vuelve a Eliminar', (await activeInfo(page))?.text === 'Eliminar');
      check('reuniones: h2 de lista y de detalle con tabindex -1', (await page.locator('h2[tabindex="-1"]').count()) === 2);
      check('reuniones: sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await context.close();
    }

    // ---------- Compromisos, jefe, 1440 ----------
    {
      const { context, page, consoleErrors } = await newPage(browser, 'jefe@demo.local', { width: 1440, height: 900 });
      await page.goto(`${BASE}/seguimiento/compromisos`);
      await waitReady(page);
      check('compromisos: h1', (await page.locator('h1').textContent()) === 'Compromisos');
      check(
        'compromisos: detalle con los 5 términos',
        (await page.locator('dt').allTextContents()).join('|') === 'Asignado|Responsable|Reunión de origen|Resultado esperado|Bloqueos',
      );
      const group = page.getByRole('group', { name: 'Cambiar estado a:' });
      const labels = await group.getByRole('button').allTextContents();
      check('compromiso en curso: destinos Bloqueado y Completado', labels.join('|') === 'Bloqueado|Completado', labels);
      await page.getByRole('button', { name: 'Nuevo compromiso' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.waitFor();
      check(
        'compromiso: ids del inventario',
        (await allIds(dlg, ['com-process', 'com-title', 'com-due', 'com-assigned', 'com-responsible', 'com-meeting', 'com-result', 'com-blockers'])).length === 0,
      );
      check('compromiso: vencimiento = hoy local', (await dlg.locator('#com-due').inputValue()) === todayLocal());
      await dlg.locator('#com-meeting').click();
      const opts = await page.getByRole('option').allTextContents();
      check('compromiso: reunión «Sin reunión» + «título (fecha)»', opts[0] === 'Sin reunión' && /\(\d{1,2} \S+ \d{4}\)$/.test(opts[1] || ''), opts.slice(0, 2));
      await page.keyboard.press('Escape');
      await dlg.locator('#com-due').fill('');
      await dlg.getByRole('button', { name: 'Crear compromiso' }).click();
      check(
        'compromiso: los 3 errores a la vez',
        (await dlg.getByText('Selecciona un proceso.').isVisible()) &&
          (await dlg.getByText('El título es obligatorio.').isVisible()) &&
          (await dlg.getByText('El vencimiento es obligatorio.').isVisible()),
      );
      check('compromiso: foco al proceso', (await activeInfo(page))?.id === 'com-process');
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);
      check('compromiso: foco vuelve a Nuevo compromiso', (await activeInfo(page))?.text === 'Nuevo compromiso');
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      await dlg.waitFor();
      check('compromiso editar: proceso deshabilitado', await dlg.locator('#com-process').isDisabled());
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);
      check('compromiso editar: foco vuelve a Editar', (await activeInfo(page))?.text === 'Editar');
      check('compromisos: sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await context.close();
    }

    // ---------- Integrante: sin ids crudos en pantalla ----------
    for (const route of ['/seguimiento/novedades', '/seguimiento/reuniones', '/seguimiento/compromisos']) {
      const { context, page } = await newPage(browser, 'integrante.bi@demo.local', { width: 1440, height: 900 });
      await page.goto(`${BASE}${route}`);
      await waitReady(page);
      const text = await page.locator('main').innerText();
      check(`integrante ${route}: sin UUID visibles`, !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text));
      await context.close();
    }

    // ---------- 390 px: el foco pasa al encabezado del detalle ----------
    for (const [route, listName] of [
      ['/seguimiento/novedades', 'Novedades'],
      ['/seguimiento/reuniones', 'Reuniones'],
      ['/seguimiento/compromisos', 'Compromisos'],
    ]) {
      const { context, page } = await newPage(browser, 'jefe@demo.local', { width: 390, height: 844 });
      await page.goto(`${BASE}${route}`);
      await waitReady(page);
      const items = page.getByRole('list', { name: listName }).getByRole('button');
      const target = items.nth(2);
      const expectedTitle = ((await target.locator('span.line-clamp-2').textContent()) || '').trim();
      await target.click();
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const bar = document.querySelector('header');
        const r = el ? el.getBoundingClientRect() : null;
        return {
          tag: el ? el.tagName : null,
          text: el ? (el.textContent || '').trim() : null,
          top: r ? r.top : null,
          barBottom: bar ? bar.getBoundingClientRect().bottom : null,
          vh: window.innerHeight,
        };
      });
      check(
        `390 ${route}: foco en el h2 del detalle elegido, visible`,
        info.tag === 'H2' && info.text === expectedTitle && info.top !== null && info.top >= 0 && info.top < info.vh,
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
