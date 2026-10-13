// Capacidad desde la UI: registrar disponibilidad (incluido el 409 «Ya hay
// disponibilidad…» con la acción «Editar la existente») y crear una asignación.
'use strict';
const L = require('./qa-flows-lib.cjs');

const MONTH = '2027-04';
const PERSON = 'Beto Lider BI';
const BETO_ID = '2a6264af-e786-4eba-96ce-9dc6fd6c6846';

async function run() {
  const s = await L.open('beto', 'capacidad');
  const { page } = s;
  try {
    await L.goto(page, '/activos/capacidad');
    await page.locator('#capacidad-month').fill(MONTH);
    await L.settle(page);

    const availBefore = await L.apiGet('beto', `/capacity/availability?month=${MONTH}`);
    const mine = availBefore.find((a) => a.userId === BETO_ID);

    if (!mine) {
      await L.step('registrar disponibilidad', async () => {
        await page.getByRole('button', { name: 'Registrar disponibilidad' }).first().click();
        const d = page.getByRole('dialog', { name: 'Registrar disponibilidad' });
        await d.waitFor();
        await L.choose(d, page, 'disp-person', new RegExp(PERSON));
        await d.locator('#disp-hours').fill('120');
        const res = L.waitApi(page, 'POST', '/capacity/availability');
        await d.getByRole('button', { name: 'Registrar' }).click();
        const r = await res;
        L.check('POST /capacity/availability', r.status() === 201, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('disponibilidad del mes ya existe (reejecución)', true, `${mine.availableHours} h`);
    }

    // 409 al intentar registrar una segunda vez para la misma persona/mes.
    await L.step('409 «Ya hay disponibilidad…» con acción «Editar la existente»', async () => {
      await page.getByRole('button', { name: 'Registrar disponibilidad' }).first().click();
      const d = page.getByRole('dialog', { name: 'Registrar disponibilidad' });
      await d.waitFor();
      await L.choose(d, page, 'disp-person', new RegExp(PERSON));
      await d.locator('#disp-hours').fill('100');
      const res = L.waitApi(page, 'POST', '/capacity/availability');
      await d.getByRole('button', { name: 'Registrar' }).click();
      const r = await res;
      L.check('la segunda alta devuelve 409', r.status() === 409, String(r.status()));
      L.check('toast «Ya hay disponibilidad para esa persona y mes.»', await L.toast(page, 'Ya hay disponibilidad'));
      // El 409 cierra el diálogo de alta (el overlay taparía el toast). La
      // acción del toast abre la edición de la fila existente.
      await d.waitFor({ state: 'hidden' });
      const action = page.getByRole('button', { name: 'Editar la existente' });
      await action.first().click();
      const edit = page.getByRole('dialog', { name: 'Editar disponibilidad' });
      await edit.waitFor();
      L.check('«Editar la existente» abre el diálogo de edición', true);
      await edit.getByRole('button', { name: 'Cancelar' }).click();
      await edit.waitFor({ state: 'hidden' }).catch(() => undefined);
      await L.clearToasts(page);
      await L.settle(page);
    });

    // Asignación.
    await L.step('nueva asignación', async () => {
      await page.getByRole('button', { name: 'Nueva asignación' }).first().click();
      const d = page.getByRole('dialog', { name: /asignación/i });
      await d.waitFor();
      await L.choose(d, page, 'asig-person', new RegExp(PERSON));
      await L.choose(d, page, 'asig-process', /^BI$/);
      await d.locator('#asig-hours').fill('20');
      await d.locator('#asig-description').fill(`Asignación de prueba desde la UI. ${L.MARKER}`);
      const res = L.waitApi(page, 'POST', '/capacity/assignments');
      await d.getByRole('button', { name: 'Crear asignación' }).click();
      const r = await res;
      L.check('POST /capacity/assignments', r.status() === 201, String(r.status()));
      await d.waitFor({ state: 'hidden' });
      await L.settle(page);
    });

    L.check('capacidad (beto): sin errores de consola', s.errors.length === 0, s.errors);
    await L.shot(page, 'capacidad-tras-flujo');
  } finally {
    await s.close();
  }
}

module.exports = { run };
