// Equipo y permisos desde la UI: crear usuario, asignar rol (grant) y revocar un
// rol. La revocación es un DELETE: el harness lo intercepta y responde 204 sin
// tocar la API (instrucción: no borrar nada), así se comprueba el cableado de la
// UI (petición correcta, confirmación y manejo del éxito) sin revocar de verdad.
'use strict';
const L = require('./qa-flows-lib.cjs');

const USER_ID = 'qa.ui.user@demo.local';
const USER_NAME = 'Persona QA UI';

async function run() {
  const s = await L.open('jefe', 'equipo');
  const { page } = s;
  try {
    await L.goto(page, '/gobierno/equipo');
    await L.settle(page);

    // --------------------------------------------------------- crear usuario
    let user = (await L.apiGet('jefe', '/users')).find((u) => u.identifier === USER_ID);
    if (user) {
      L.check('usuario de prueba ya existe (reejecución)', true, user.id);
    } else {
      await L.step('crear usuario', async () => {
        await page.getByRole('button', { name: 'Nuevo usuario' }).first().click();
        const d = page.getByRole('dialog', { name: 'Nuevo usuario' });
        await d.waitFor();
        let posted = false;
        const onReq = (r) => {
          if (r.method() === 'POST' && new URL(r.url()).pathname === '/users') posted = true;
        };
        page.on('request', onReq);
        await d.getByRole('button', { name: 'Crear' }).click();
        await d.getByText('obligatori', { exact: false }).first().waitFor().catch(() => undefined);
        L.check('usuario sin datos: no llama a la API', !posted);
        page.off('request', onReq);
        await d.locator('#user-identifier').fill(USER_ID);
        await d.locator('#user-name').fill(USER_NAME);
        const res = L.waitApi(page, 'POST', '/users');
        await d.getByRole('button', { name: 'Crear' }).click();
        const r = await res;
        const body = await r.json();
        L.check('POST /users', r.status() === 201 && body.identifier === USER_ID, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
      user = (await L.apiGet('jefe', '/users')).find((u) => u.identifier === USER_ID);
    }
    if (!user) return;

    // ---------------------------------------------------------- asignar rol
    let grant = (await L.apiGet('jefe', '/grants')).find((g) => g.userId === user.id && g.active);
    if (grant) {
      L.check('el usuario de prueba ya tiene un rol (reejecución)', true, grant.id);
    } else {
      await L.step('asignar rol', async () => {
        await page.getByRole('button', { name: 'Asignar rol' }).first().click();
        const d = page.getByRole('dialog', { name: 'Asignar rol' });
        await d.waitFor();
        await L.choose(d, page, 'grant-user', new RegExp(USER_ID.replace(/[.]/g, '\\.')));
        await L.choose(d, page, 'grant-role', /^Integrante$/);
        await L.choose(d, page, 'grant-process', /^BI/);
        const res = L.waitApi(page, 'POST', '/grants');
        await d.getByRole('button', { name: 'Asignar' }).click();
        const r = await res;
        const body = await r.json();
        L.check('POST /grants', r.status() === 201 && body.userId === user.id, String(r.status()));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
      grant = (await L.apiGet('jefe', '/grants')).find((g) => g.userId === user.id && g.active);
    }

    // ------------------------------------------- revocar (DELETE interceptado)
    await L.step('revocar un rol (DELETE interceptado, sin borrar)', async () => {
      L.check('hay un grant del usuario de prueba para revocar', Boolean(grant), grant && grant.id);
      if (!grant) return;
      const revoke = page.locator(`#revocar-${grant.id}`);
      await revoke.scrollIntoViewIfNeeded();
      const deletedBefore = s.deletes.length;
      await revoke.click();
      const d = page.getByRole('alertdialog', { name: '¿Revocar este rol?' });
      await d.waitFor();
      await d.getByRole('button', { name: 'Revocar rol' }).click();
      await L.toast(page, 'revocad').catch(() => undefined);
      await page.waitForTimeout(1000);
      L.check('la UI envía DELETE /grants/:id', s.deletes.some((p) => p === `/grants/${grant.id}`), s.deletes.slice(deletedBefore).join(','));
      const still = (await L.apiGet('jefe', '/grants')).find((g) => g.id === grant.id);
      L.check('el grant NO se borró en la API (DELETE interceptado)', Boolean(still && still.active), still ? `active=${still.active}` : 'ausente');
    });
    await L.shot(page, 'equipo-tras-flujo');
    L.check('equipo (jefe): sin errores de consola', s.errors.length === 0, s.errors);
  } finally {
    await s.close();
  }
}

module.exports = { run };
