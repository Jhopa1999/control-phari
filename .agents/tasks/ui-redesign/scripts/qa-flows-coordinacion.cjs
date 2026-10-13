// Coordinación desde la UI: alta y transición de estado en Novedades,
// Reuniones y Compromisos.
'use strict';
const L = require('./qa-flows-lib.cjs');

const NOV = 'QA UI · Bloqueo de credenciales de prueba';
const REU = 'QA UI · Revisión de tablero de prueba';
const COM = 'QA UI · Entregar borrador de prueba';

async function run() {
  const s = await L.open('beto', 'coordinacion');
  const { page } = s;
  try {
    // ---------------------------------------------------------------- Novedad
    await L.goto(page, '/seguimiento/novedades');
    const novExists = (await L.apiGet('beto', '/issues')).some((i) => i.title === NOV);
    if (!novExists) {
      await L.step('alta de novedad', async () => {
        await page.getByRole('button', { name: 'Nueva novedad' }).first().click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await L.choose(d, page, 'nov-process', /^BI$/);
        await d.locator('#nov-title').fill(NOV);
        await d.locator('#nov-detail').fill(`Detalle de prueba. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', '/issues');
        await d.getByRole('button', { name: 'Crear novedad' }).click();
        const r = await res;
        const body = await r.json();
        L.check('POST /issues', r.status() === 201 && body.title === NOV, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('novedad de prueba ya existe (reejecución)', true);
    }
    await L.step('transición de estado de la novedad', async () => {
      await page.getByRole('button', { name: new RegExp(NOV) }).first().click();
      await L.settle(page);
      const buttons = page.getByRole('button').filter({ hasText: /^(En curso|Bloqueado|En revisión|Resuelto|Cerrado|Archivado|Reabrir|Mover a)/ });
      const count = await buttons.count();
      if (count === 0) {
        L.check('la novedad no tiene transiciones (estado terminal)', true);
        return;
      }
      const res = L.waitApi(page, 'POST', /\/issues\/[0-9a-f-]+\/transition$/);
      await buttons.first().click();
      const r = await res;
      L.check('POST /issues/:id/transition', r.ok(), String(r.status()));
      L.check('toast «Novedad movida a …»', await L.toast(page, 'Novedad movida'));
    });

    // --------------------------------------------------------------- Reunión
    await L.goto(page, '/seguimiento/reuniones');
    const reuExists = (await L.apiGet('beto', '/meetings')).some((m) => m.title === REU);
    if (!reuExists) {
      await L.step('alta de reunión', async () => {
        await page.getByRole('button', { name: 'Nueva reunión' }).first().click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await L.choose(d, page, 'reu-process', /^BI$/);
        await d.locator('#reu-title').fill(REU);
        await d.locator('#reu-date').fill('2027-01-20');
        await d.locator('#reu-time').fill('10:30');
        await d.locator('#reu-agenda').fill(`Agenda de prueba. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', '/meetings');
        await d.getByRole('button', { name: 'Crear reunión' }).click();
        const r = await res;
        L.check('POST /meetings', r.status() === 201, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('reunión de prueba ya existe (reejecución)', true);
    }

    // ------------------------------------------------------------- Compromiso
    await L.goto(page, '/seguimiento/compromisos');
    const comExists = (await L.apiGet('beto', '/commitments')).some((c) => c.title === COM);
    if (!comExists) {
      await L.step('alta de compromiso', async () => {
        await page.getByRole('button', { name: 'Nuevo compromiso' }).first().click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await L.choose(d, page, 'com-process', /^BI$/);
        await d.locator('#com-title').fill(COM);
        await d.locator('#com-due').fill('2027-01-25');
        await d.locator('#com-result').fill(`Resultado esperado de prueba. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', '/commitments');
        await d.getByRole('button', { name: 'Crear compromiso' }).click();
        const r = await res;
        L.check('POST /commitments', r.status() === 201, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('compromiso de prueba ya existe (reejecución)', true);
    }
    await L.step('transición de estado del compromiso', async () => {
      await page.getByRole('button', { name: new RegExp(COM) }).first().click();
      await L.settle(page);
      const buttons = page.getByRole('button').filter({ hasText: /^(Bloqueado|En curso|Completado|Archivado)/ });
      if ((await buttons.count()) === 0) {
        L.check('el compromiso no tiene transiciones', true);
        return;
      }
      const res = L.waitApi(page, 'POST', /\/commitments\/[0-9a-f-]+\/transition$/);
      await buttons.first().click();
      const r = await res;
      L.check('POST /commitments/:id/transition', r.ok(), String(r.status()));
      L.check('toast «Compromiso movido a …»', await L.toast(page, 'Compromiso movido'));
    });

    L.check('coordinación (beto): sin errores de consola', s.errors.length === 0, s.errors);
    await L.shot(page, 'coordinacion-compromisos');
  } finally {
    await s.close();
  }
}

module.exports = { run };
