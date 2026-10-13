// Regresiones decididas con el usuario (design §19), en el navegador real con
// dev-header y el navegador en America/Bogota (UTC−5).
//   1. Planificación: «Agregar tarea» en una fase que YA tiene una tarea crea la
//      segunda (plan QA1 de qa-data.cjs; ESCRIBE una tarea, que se registra
//      después con `node qa-data.cjs record-ui`).
//   2. Fechas de fase y tarea sin correrse un día (plan QA1 y plan PA).
//   3. «Solo mis tareas» devuelve las del usuario (lider.bi en el plan PA).
//   4. Valores de fecha por defecto con el calendario local (reloj fijo en
//      2026-11-01T01:30Z = 31 oct 20:30 en Bogotá). Solo abre y cancela diálogos.
// Uso: node qa-regresiones.cjs [--skip-create]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const BASE = process.env.WEB_URL || 'http://localhost:3300';
const API = process.env.API_URL || 'http://localhost:3301';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'QA-FINAL', 'regresiones');
const MANIFEST = path.resolve(__dirname, '..', '..', 'demo-data', 'manifest.json');
const SKIP_CREATE = process.argv.includes('--skip-create');
const TZ = 'America/Bogota';
const DATE_ONLY = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' });
const fmt = (iso) => DATE_ONLY.format(new Date(iso));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
async function apiGet(actor, route) {
  const res = await fetch(`${API}${route}`, { headers: { 'X-Actor-Id': actor } });
  if (!res.ok) throw new Error(`GET ${route} -> ${res.status}`);
  return res.json();
}
async function newPage(browser, actor, extra = {}) {
  const context = await browser.newContext({ locale: 'es-ES', timezoneId: TZ, viewport: { width: 1440, height: 900 }, ...extra });
  await context.addInitScript((id) => window.localStorage.setItem('actorId', id), actor);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { context, page, errors };
}
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, { timeout: 20000 }).catch(() => undefined);
}
async function choosePlanRequest(page, titleRe) {
  await page.locator('#plan-request').click();
  await page.getByRole('listbox').getByRole('option', { name: titleRe }).click();
  await settle(page);
}
const tasksSection = (page) => page.locator('section', { has: page.getByRole('heading', { name: 'Tareas', exact: true }) });
const phasesSection = (page) => page.locator('section', { has: page.getByRole('heading', { name: 'Fases', exact: true }) });
async function planRegressions(browser) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const byKey = new Map(manifest.entities.map((e) => [e.key, e]));
  const planId = byKey.get('qa.plan.QA1').id;
  const phaseId = byKey.get('qa.phase.QA1.F1').id;
  const BETO = 'lider.bi@demo.local';
  const { context, page, errors } = await newPage(browser, BETO);
  try {
    await page.goto(`${BASE}/seguimiento/plan`);
    await page.locator('main h1').waitFor();
    await settle(page);
    await choosePlanRequest(page, /QA final · Tablero de cumplimiento/);
    const before = (await apiGet(BETO, `/plans/${planId}/tasks`)).filter((t) => t.phaseId === phaseId);
    check('la fase QA ya tiene tareas antes de agregar', before.length >= 1, `${before.length} tarea(s)`);
    // Fechas de la fase (2 nov – 13 nov 2026) y de la primera tarea (2 – 6 nov).
    const phaseText = await phasesSection(page).innerText();
    const phaseExpected = `${fmt('2026-11-02T00:00:00.000Z')} – ${fmt('2026-11-13T00:00:00.000Z')}`;
    check('fechas de la fase sin correrse un día', phaseText.includes(phaseExpected) && !phaseText.includes(fmt('2026-11-01T00:00:00.000Z')), phaseExpected);
    const addButton = phasesSection(page).getByRole('button', { name: 'Agregar tarea' }).first();
    check('«Agregar tarea» habilitado en una fase con tareas', await addButton.isEnabled(), `aria-disabled=${await addButton.getAttribute('aria-disabled')}`);
    if (!SKIP_CREATE) {
      await addButton.click();
      const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
      await dialog.waitFor();
      await dialog.getByLabel('Título').fill('QA · Segunda tarea desde la UI');
      await dialog.getByLabel('Inicio').fill('2026-11-09');
      await dialog.getByLabel('Vencimiento').fill('2026-11-13');
      await dialog.getByLabel('Esfuerzo (horas)').fill('4');
      await dialog.getByLabel('Descripción').fill('Creada desde la UI por la QA final del rediseño.\nDato de prueba (demo-ui)');
      const post = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/phases/${phaseId}/tasks`);
      await dialog.getByRole('button', { name: 'Crear tarea' }).click();
      const res = await post;
      const created = await res.json();
      check('POST /phases/:id/tasks de la segunda tarea', res.status() === 201, `${res.status()} startDate=${created.startDate} endDate=${created.endDate}`);
      check('la fecha enviada es el día elegido (medianoche UTC)', created.startDate === '2026-11-09T00:00:00.000Z' && created.endDate === '2026-11-13T00:00:00.000Z', `${created.startDate} / ${created.endDate}`);
      await page.getByText('Tarea creada.').waitFor({ timeout: 15000 }).then(
        () => check('toast «Tarea creada.»', true),
        () => check('toast «Tarea creada.»', false),
      );
      await dialog.waitFor({ state: 'hidden' });
      await settle(page);
    }
    const after = (await apiGet(BETO, `/plans/${planId}/tasks`)).filter((t) => t.phaseId === phaseId);
    check('la fase queda con una tarea más', SKIP_CREATE || after.length === before.length + 1, `${before.length} -> ${after.length}`);
    const second = tasksSection(page).getByRole('row').filter({ hasText: 'QA · Segunda tarea desde la UI' });
    const secondText = (await second.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('la segunda tarea aparece en la tabla con 9 nov y 13 nov', secondText.includes(fmt('2026-11-09T00:00:00.000Z')) && secondText.includes(fmt('2026-11-13T00:00:00.000Z')) && !secondText.includes(fmt('2026-11-08T00:00:00.000Z')), secondText);
    const firstRow = (await tasksSection(page).getByRole('row').filter({ hasText: 'QA · Primera tarea de la fase' }).innerText()).replace(/\s+/g, ' ');
    check('la primera tarea sigue con 2 nov y 6 nov', firstRow.includes(fmt('2026-11-02T00:00:00.000Z')) && firstRow.includes(fmt('2026-11-06T00:00:00.000Z')), firstRow);
    check('«Agregar tarea» sigue habilitado con 2 tareas', await phasesSection(page).getByRole('button', { name: 'Agregar tarea' }).first().isEnabled());
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'plan-qa1-segunda-tarea--1440x900.png'), fullPage: true });

    // Plan PA (demo-data, solo lectura): fechas de las fases y «Solo mis tareas».
    await choosePlanRequest(page, /Tablero ejecutivo de ventas y margen por canal/);
    const pa = await apiGet(BETO, '/requests/a6eea150-ab92-4d93-a359-d020bddafceb/plan');
    const paPhases = await apiGet(BETO, `/plans/${pa.id}/phases`);
    const paTasks = await apiGet(BETO, `/plans/${pa.id}/tasks`);
    const phasesText = await phasesSection(page).innerText();
    const misses = paPhases
      .filter((p) => p.startDate && p.endDate)
      .map((p) => `${fmt(p.startDate)} – ${fmt(p.endDate)}`)
      .filter((s) => !phasesText.includes(s));
    check('fechas de las fases del plan PA iguales a las guardadas', misses.length === 0, misses.length ? misses : `${paPhases.length} fases`);
    const me = await apiGet(BETO, '/me/permissions');
    const mine = paTasks.filter((t) => t.responsibleUserId === me.userId);
    const rowsBefore = await tasksSection(page).locator('tbody tr').count();
    await page.getByLabel('Solo mis tareas').click();
    await settle(page);
    const rows = tasksSection(page).locator('tbody tr');
    const rowTexts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
    const expectedTitles = mine.map((t) => t.title);
    check(
      '«Solo mis tareas» devuelve las tareas del usuario',
      expectedTitles.length > 0 && rowTexts.length === expectedTitles.length && expectedTitles.every((t) => rowTexts.some((r) => r.includes(t))),
      { usuario: me.userId, esperadas: expectedTitles, filas: rowTexts.length, antes: rowsBefore },
    );
    // Fechas de tarea en la tabla: cada fila del usuario muestra sus fechas guardadas.
    const dateMisses = mine
      .filter((t) => t.startDate || t.endDate)
      .filter((t) => {
        const row = rowTexts.find((r) => r.includes(t.title)) || '';
        return (t.startDate && !row.includes(fmt(t.startDate))) || (t.endDate && !row.includes(fmt(t.endDate)));
      })
      .map((t) => t.title);
    check('fechas de tarea iguales a las guardadas', dateMisses.length === 0, dateMisses.length ? dateMisses : `${mine.length} tareas`);
    await page.screenshot({ path: path.join(OUT, 'plan-pa-solo-mis-tareas--1440x900.png'), fullPage: true });
    check('sin errores de consola en Planificación', errors.length === 0, errors);
  } finally {
    await context.close();
  }
}
async function defaultDates(browser) {
  const JEFE = 'jefe@demo.local';
  const cases = [
    { route: '/seguimiento/novedades', button: 'Nueva novedad', field: '#nov-date', expected: '2026-10-31' },
    { route: '/seguimiento/compromisos', button: 'Nuevo compromiso', field: '#com-due', expected: '2026-10-31' },
    { route: '/seguimiento/reuniones', button: 'Nueva reunión', field: '#reu-date', expected: '2026-10-31' },
    { route: '/seguimiento/bitacora', button: 'Nuevo diario', field: '#diario-date', expected: '2026-10-31' },
    { route: '/seguimiento/semanal', button: 'Nuevo reporte semanal', field: '#sem-week', expected: '2026-10-26' },
  ];
  for (const c of cases) {
    const { context, page } = await newPage(browser, JEFE);
    try {
      await page.clock.setFixedTime(new Date('2026-11-01T01:30:00Z'));
      await page.goto(`${BASE}${c.route}`);
      await page.locator('main h1').waitFor();
      await settle(page);
      await page.getByRole('button', { name: c.button }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const value = await dialog.locator(c.field).inputValue();
      check(`${c.route}: «${c.button}» propone ${c.expected}`, value === c.expected, `valor=${value}`);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await dialog.waitFor({ state: 'hidden' });
    } finally {
      await context.close();
    }
  }
  const fields = [
    { route: '/activos/capacidad', fields: { '#capacidad-month': '2026-10' } },
    { route: '/inicio', fields: { '#dashboard-from': '2026-10-01', '#dashboard-to': '2026-11-01' } },
    { route: '/demanda/resumen', fields: { '#indicadores-from': '2026-10-01', '#indicadores-to': '2026-11-01' } },
  ];
  for (const c of fields) {
    const { context, page } = await newPage(browser, JEFE);
    try {
      await page.clock.setFixedTime(new Date('2026-11-01T01:30:00Z'));
      await page.goto(`${BASE}${c.route}`);
      await page.locator('main h1').waitFor();
      await settle(page);
      for (const [sel, expected] of Object.entries(c.fields)) {
        const value = await page.locator(sel).inputValue().catch(() => null);
        check(`${c.route}: ${sel} por defecto ${expected}`, value === expected, `valor=${value}`);
      }
    } finally {
      await context.close();
    }
  }
}
(async () => {
  const browser = await chromium.launch();
  try {
    await planRegressions(browser);
    await defaultDates(browser);
  } finally {
    await browser.close();
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), timezone: TZ, results }, null, 2), 'utf8');
  const failed = results.filter((r) => !r.ok).length;
  console.log(`total=${results.length} fallidos=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
