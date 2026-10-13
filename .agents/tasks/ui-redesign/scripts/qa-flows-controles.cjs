// Controles de gobierno desde la UI (hallazgo QA-1): registrar una validación,
// guardar la ruta proporcional y marcar GC4/GC5 como «No aplica» con el
// ReasonDialog del rediseño (ya no window.prompt). Usa la solicitud A, en
// ejecución y creada por la QA; no toca el expediente de los datos demo. No
// borra nada; las transiciones de gate quedan registradas en el manifest.
'use strict';
const L = require('./qa-flows-lib.cjs');
const { TITLE_A, findRequest } = require('./qa-flows-demanda.cjs');

async function pickFirstReal(scope, page, comboName) {
  await scope.getByRole('combobox', { name: comboName }).click();
  const options = page.getByRole('listbox').getByRole('option');
  const names = await options.allInnerTexts();
  const idx = names.findIndex((n) => !/^(Elige|Sin )/.test(n.trim()));
  await L.pick(page, options.nth(idx));
  return names[idx].trim();
}

async function run() {
  const req = await findRequest('jefe', TITLE_A);
  if (!req) {
    L.check('controles: hace falta la solicitud A (ejecuta antes «demanda» y «plan»)', false);
    return;
  }
  const s = await L.open('jefe', 'controles');
  const { page } = s;
  try {
    await L.goto(page, `/administracion/frameworks?requestId=${req.id}`);
    await L.choose(page, page, 'governance-request', /Alertas de stock/);
    await L.settle(page);

    // ----------------------- guardar ruta (simplificada: habilita «No aplica»)
    await L.step('guardar ruta proporcional (simplificada)', async () => {
      const route = page.getByRole('region', { name: 'Ruta proporcional' });
      await L.choose(route, page, 'governance-route', /Ruta simplificada/);
      const save = route.getByRole('button', { name: 'Guardar ruta' });
      if (!(await save.isEnabled())) {
        L.check('la ruta simplificada ya estaba guardada (reejecución)', true);
        return;
      }
      const res = L.waitApi(page, 'PUT', `/requests/${req.id}/governance-route`);
      await save.click();
      const r = await res;
      L.check('PUT /requests/:id/governance-route (simplificada)', r.ok(), String(r.status()));
      await L.settle(page);
    });

    // ------------------------------------------------- registrar validación
    await L.step('registrar validación', async () => {
      const before = await L.apiGet('jefe', `/requests/${req.id}/validations`);
      await page.getByRole('tab', { name: /Validaciones/ }).click();
      await L.settle(page);
      await page.getByRole('button', { name: 'Registrar validación' }).first().click();
      const d = page.getByRole('dialog', { name: 'Registrar validación' });
      await d.waitFor();
      // Envío vacío: validación local, sin llamada.
      let posted = false;
      const onReq = (r) => {
        if (r.method() === 'POST' && /\/validations$/.test(new URL(r.url()).pathname)) posted = true;
      };
      page.on('request', onReq);
      await d.getByRole('button', { name: 'Registrar validación' }).click();
      await d.getByText('obligatori', { exact: false }).first().waitFor();
      L.check('validación incompleta: no llama a la API', !posted);
      page.off('request', onReq);
      const tipo = await pickFirstReal(d, page, 'Tipo');
      await pickFirstReal(d, page, 'Resultado');
      await d.getByRole('textbox', { name: 'Caso de prueba' }).fill('QA UI · Caso de prueba del rediseño');
      await d.getByRole('textbox', { name: 'Versión de la solución' }).fill('v-qa-ui');
      await d.getByRole('textbox', { name: 'Ambiente' }).fill('QA');
      await pickFirstReal(d, page, 'Ejecutor');
      await d.getByRole('textbox', { name: 'Fecha de ejecución' }).fill('2027-01-20T10:30');
      await d.getByRole('textbox', { name: 'Notas' }).fill(`Validación de prueba desde la UI. ${L.MARKER}`);
      const res = L.waitApi(page, 'POST', `/requests/${req.id}/validations`);
      await d.getByRole('button', { name: 'Registrar validación' }).click();
      const r = await res;
      L.check('POST /requests/:id/validations', r.status() === 201, `${r.status()} tipo=${tipo}`);
      L.check('toast de validación registrada (BR-008)', await L.toast(page, 'validación'));
      await d.waitFor({ state: 'hidden' }).catch(() => undefined);
      await L.settle(page);
      const after = await L.apiGet('jefe', `/requests/${req.id}/validations`);
      L.check('la validación aparece en el registro', after.length >= before.length + 1, `${before.length} -> ${after.length}`);
    });

    // ---------------------------------------------- GC4/GC5 «Marcar no aplica»
    for (const gate of ['GC4', 'GC5']) {
      await L.step(`marcar ${gate} como no aplica`, async () => {
        await page.getByRole('tab', { name: 'Controles' }).click();
        await L.settle(page);
        const item = page.getByRole('listitem', { name: new RegExp(`Control ${gate}`) });
        if ((await item.innerText()).includes('No aplica')) {
          L.check(`${gate} ya está en «No aplica» (reejecución)`, true);
          return;
        }
        const waive = item.getByRole('button', { name: 'Marcar como no aplica' });
        if ((await waive.count()) === 0) {
          L.check(`${gate}: sin acción «Marcar como no aplica» disponible`, false);
          return;
        }
        await waive.click();
        const d = page.getByRole('dialog', { name: `Marcar ${gate} como no aplica` });
        await d.waitFor();
        let posted = false;
        const onReq = (r) => {
          if (r.method() === 'POST' && /\/waive$/.test(new URL(r.url()).pathname)) posted = true;
        };
        page.on('request', onReq);
        await d.getByRole('button', { name: 'Marcar como no aplica' }).click();
        await d.getByText(/por qué/i).first().waitFor().catch(() => undefined);
        L.check(`${gate}: «No aplica» sin motivo no llama a la API`, !posted);
        page.off('request', onReq);
        await d.locator('#waive-reason').fill(`No aplica para la QA final del rediseño (${gate}). ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', `/requests/${req.id}/gates/${gate}/waive`);
        await d.getByRole('button', { name: 'Marcar como no aplica' }).click();
        const r = await res;
        L.check(`POST /gates/${gate}/waive`, r.ok(), String(r.status()));
        await d.waitFor({ state: 'hidden' }).catch(() => undefined);
        await L.settle(page);
        const after = page.getByRole('listitem', { name: new RegExp(`Control ${gate}`) });
        L.check(`${gate} queda en «No aplica»`, (await after.innerText()).includes('No aplica'));
      });
    }
    await L.shot(page, 'controles-tras-flujo');
    L.check('controles (jefe): sin errores de consola', s.errors.length === 0, s.errors);
  } finally {
    await s.close();
  }
}

module.exports = { run };
