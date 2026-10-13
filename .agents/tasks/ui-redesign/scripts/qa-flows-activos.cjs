// Activos y Documentos desde la UI: alta de activo y transición de estado;
// alta de documento, nueva versión y transición de estado.
'use strict';
const L = require('./qa-flows-lib.cjs');

const ASSET = 'QA UI · Modelo de datos de prueba';
const DOC = 'QA UI · Ficha técnica de prueba';

async function run() {
  const s = await L.open('beto', 'activos');
  const { page } = s;
  try {
    // ---------------------------------------------------------------- Activo
    await L.goto(page, '/activos/catalogo');
    let asset = (await L.apiGet('beto', '/assets')).find((a) => a.name === ASSET);
    if (!asset) {
      await L.step('alta de activo', async () => {
        await page.getByRole('button', { name: 'Nuevo activo' }).first().click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await L.choose(d, page, 'activo-process', /^BI$/);
        await d.locator('#activo-name').fill(ASSET);
        await d.locator('#activo-functional').fill(`Activo de prueba desde la UI. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', '/assets');
        await d.getByRole('button', { name: 'Crear activo' }).click();
        const r = await res;
        asset = await r.json();
        L.check('POST /assets', r.status() === 201 && asset.name === ASSET, `${r.status()} estado=${asset.status}`);
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('activo de prueba ya existe (reejecución)', true, asset.status);
    }
    if (asset && asset.status === 'BORRADOR') {
      await L.step('activar el activo', async () => {
        await page.getByLabel('Buscar').fill(ASSET);
        await L.settle(page);
        const row = page.getByRole('row').filter({ hasText: ASSET });
        const res = L.waitApi(page, 'POST', `/assets/${asset.id}/status`);
        await row.getByRole('button', { name: 'Activar' }).click();
        const r = await res;
        L.check('POST /assets/:id/status (Activar)', r.ok(), String(r.status()));
        L.check('toast «Activo movido a …»', await L.toast(page, 'Activo movido'));
        await L.settle(page);
      });
    } else {
      L.check('activo ya no está en borrador (reejecución)', true, asset ? asset.status : 'sin activo');
    }

    // ------------------------------------------------------------- Documento
    await L.goto(page, '/activos/documentos');
    let doc = (await L.apiGet('beto', '/documents')).find((x) => x.title === DOC);
    if (!doc) {
      await L.step('alta de documento', async () => {
        await page.getByRole('button', { name: 'Nuevo documento' }).first().click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await L.choose(d, page, 'doc-asset', new RegExp(ASSET));
        await d.locator('#doc-title').fill(DOC);
        await d.locator('#doc-content').fill(`# Ficha técnica de prueba\n\nContenido de prueba desde la UI. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', '/documents');
        await d.getByRole('button', { name: /Guardar/ }).click();
        const r = await res;
        doc = await r.json();
        L.check('POST /documents', r.status() === 201 && doc.title === DOC, `${r.status()} estado=${doc.status}`);
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
    } else {
      L.check('documento de prueba ya existe (reejecución)', true, doc.status);
    }
    if (doc) {
      await L.step('nueva versión del documento', async () => {
        await page.getByLabel('Buscar').fill(DOC);
        await L.settle(page);
        const row = page.getByRole('row').filter({ hasText: DOC });
        await row.getByRole('button', { name: 'Editar' }).click();
        const d = page.getByRole('dialog');
        await d.waitFor();
        await d.locator('#doc-content').waitFor();
        await d.locator('#doc-content').fill(`# Ficha técnica de prueba (v2)\n\nSegunda versión desde la UI. ${L.MARKER}`);
        const res = L.waitApi(page, 'POST', `/documents/${doc.id}/versions`);
        await d.getByRole('button', { name: /Guardar/ }).click();
        const r = await res;
        L.check('POST /documents/:id/versions', r.status() === 201, String(r.status()));
        L.check('toast «Nueva versión guardada.»', await L.toast(page, 'Nueva versión guardada.'));
        await d.waitFor({ state: 'hidden' });
        await L.settle(page);
      });
      const fresh = await L.apiGet('beto', `/documents/${doc.id}`);
      if (fresh.status === 'BORRADOR') {
        await L.step('publicar el documento', async () => {
          const row = page.getByRole('row').filter({ hasText: DOC });
          await row.getByRole('button', { name: /Más acciones/ }).click();
          const res = L.waitApi(page, 'POST', `/documents/${doc.id}/status`);
          await page.getByRole('menuitem', { name: 'Publicar' }).click();
          const r = await res;
          L.check('POST /documents/:id/status (Publicar)', r.ok(), String(r.status()));
          L.check('toast «Documento movido a …»', await L.toast(page, 'Documento movido'));
          await L.settle(page);
        });
      } else {
        L.check('documento ya no está en borrador (reejecución)', true, fresh.status);
      }
    }

    L.check('activos (beto): sin errores de consola', s.errors.length === 0, s.errors);
    await L.shot(page, 'documentos-tras-flujo');
  } finally {
    await s.close();
  }
}

module.exports = { run };
