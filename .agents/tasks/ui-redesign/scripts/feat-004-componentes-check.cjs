// Comprobación de los componentes compartidos de FEAT-004 (artefacto, no se commitea).
// Usa las páginas temporales /qa-feat-004 y /qa-feat-004/servidor del worktree
// (se borran antes del commit). No crea ni modifica datos: todo es ficticio.
// Uso: node feat-004-componentes-check.cjs <outDir>
// Requiere web en http://localhost:3300 (dev-header) y API en 3301.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const OUT = path.resolve(process.argv[2] || '.');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function newPage(vp) {
    const context = await browser.newContext({ viewport: vp, locale: 'es-ES', timezoneId: 'America/Bogota' });
    await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    return { context, page, consoleErrors };
  }

  // Descripción accesible calculada como el navegador: textos de los ids de aria-describedby.
  const description = (locator) =>
    locator.evaluate((el) =>
      (el.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => (document.getElementById(id)?.textContent || '').trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  const activeInfo = (page) =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        label: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      };
    });

  try {
    // ---------------------------------------------------------------- 1440
    {
      const { context, page, consoleErrors } = await newPage({ width: 1440, height: 900 });
      await page.goto(`${BASE}/qa-feat-004`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.getByRole('heading', { level: 1, name: 'QA componentes' }).waitFor({ timeout: 120000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({ path: path.join(OUT, 'qa-componentes--1440x900.png'), fullPage: true });

      // --- Tabla: conteo, paginación y orden.
      const group = page.getByRole('group', { name: 'Filtros de QA' });
      const count = group.getByRole('status');
      const nav = page.getByRole('navigation', { name: 'Paginación de elementos' });
      const rows = page.getByRole('region', { name: 'Tabla de QA' }).locator('tbody tr');
      record('ResultCount sin filtros: «60 elementos»', (await count.innerText()) === '60 elementos', await count.innerText());
      record('Paginación: «1–25 de 60 elementos» y «Página 1 de 3»',
        (await nav.innerText()).includes('1–25 de 60 elementos') && (await nav.innerText()).includes('Página 1 de 3'),
        (await nav.innerText()).replace(/\s+/g, ' '));
      const prev = nav.getByRole('button', { name: 'Página anterior' });
      const next = nav.getByRole('button', { name: 'Página siguiente' });
      record('Página anterior deshabilitada en la primera página', await prev.isDisabled());
      record('Página siguiente habilitada', await next.isEnabled());
      record('25 filas en la página 1', (await rows.count()) === 25, await rows.count());
      record('Orden por defecto Nombre descendente: primera fila «Elemento 60»', (await rows.first().innerText()).includes('Elemento 60'));
      const sorted = page.locator('th[aria-sort]');
      record('Un solo th[aria-sort] y es Nombre descendente',
        (await sorted.count()) === 1 && (await sorted.first().getAttribute('aria-sort')) === 'descending' && (await sorted.first().innerText()).includes('Nombre'));
      const sortName = page.getByRole('button', { name: 'Nombre, ordenar' });
      await sortName.click();
      record('Nombre (columna por defecto) desde descendente pasa a ascendente',
        (await sorted.first().getAttribute('aria-sort')) === 'ascending' && (await rows.first().innerText()).includes('Elemento 01'),
        await sorted.first().getAttribute('aria-sort'));
      await sortName.click();
      record('Y de nuevo a descendente', (await sorted.first().getAttribute('aria-sort')) === 'descending' && (await rows.first().innerText()).includes('Elemento 60'));
      await page.getByRole('button', { name: 'Número, ordenar' }).click();
      record('Otra columna: ascendente y aria-sort solo en ella',
        (await sorted.count()) === 1 && (await sorted.first().innerText()).includes('Número') && (await sorted.first().getAttribute('aria-sort')) === 'ascending');
      record('Con Número ascendente la primera fila tiene n = 0', (await rows.first().locator('td').nth(1).innerText()).trim() === '0', await rows.first().locator('td').nth(1).innerText());
      // Teclado hasta el extremo: el foco pasa a «Página anterior».
      await next.focus();
      await page.keyboard.press('Enter');
      await wait(150);
      record('Página 2: «26–50 de 60 elementos»', (await nav.innerText()).includes('26–50 de 60 elementos'));
      await page.keyboard.press('Enter');
      await wait(300);
      const navText = (await nav.innerText()).replace(/\s+/g, ' ');
      record('Página 3: «51–60 de 60 elementos» y «Página 3 de 3»', navText.includes('51–60 de 60 elementos') && navText.includes('Página 3 de 3'), navText);
      record('En el extremo «Página siguiente» queda deshabilitada', await next.isDisabled());
      const afterEdge = await activeInfo(page);
      record('El foco pasa a «Página anterior» al llegar al extremo', afterEdge && afterEdge.label === 'Página anterior', afterEdge);
      await page.keyboard.press('Escape');
      // Con ratón: clic en «Página siguiente» hasta el extremo; el foco pasa por
      // script a «Página anterior» sin abrir su tooltip (NIT 3).
      await page.locator('h1').click();
      await prev.click();
      await wait(150);
      await page.mouse.move(5, 5);
      await next.click();
      await wait(400);
      await page.mouse.move(5, 5);
      await wait(400);
      record('NIT 3: con ratón, al llegar al extremo el foco pasa a «Página anterior» sin abrir su tooltip',
        ((await activeInfo(page)) || {}).label === 'Página anterior' && (await page.getByRole('tooltip').filter({ hasText: 'Página anterior' }).count()) === 0,
        await activeInfo(page));
      // Filas por página.
      await page.locator('#qa-paginacion-filas').click();
      await page.getByRole('option', { name: '50' }).click();
      await wait(300);
      const nav50 = (await nav.innerText()).replace(/\s+/g, ' ');
      record('Filas por página 50: «1–50 de 60 elementos» y «Página 1 de 2»', nav50.includes('1–50 de 60 elementos') && nav50.includes('Página 1 de 2'), nav50);
      record('La etiqueta «Filas por página» nombra el selector', (await page.getByRole('combobox', { name: 'Filas por página' }).count()) === 1);
      // Sin resultados.
      await page.locator('#qa-buscar').fill('zzz sin coincidencias');
      await wait(200);
      record('ResultCount con filtros: «0 de 60 elementos»', (await count.innerText()) === '0 de 60 elementos', await count.innerText());
      record('Sin resultados: título y descripción por defecto',
        (await page.getByText('Ningún resultado coincide con los filtros.').count()) === 1 &&
          (await page.getByText('Cambia o limpia los filtros para ver más resultados.').count()) === 1);
      record('Sin resultados: un solo «Limpiar filtros» (el del toolbar)', (await page.getByRole('button', { name: 'Limpiar filtros' }).count()) === 1);
      record('Sin resultados: no se pinta la paginación', (await nav.count()) === 0);
      await page.locator('#qa-buscar').fill('Elemento 0');
      await wait(200);
      record('ResultCount filtrado: «9 de 60 elementos»', (await count.innerText()) === '9 de 60 elementos', await count.innerText());
      record('Paginación siempre visible en ready aunque quepa en una página (D5)', (await nav.count()) === 1 && (await nav.innerText()).includes('Página 1 de 1'));
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await page.locator('[data-qa="rows-1"]').click();
      await wait(200);
      record('Una fila: «1 elemento» (singular)', (await count.innerText()) === '1 elemento', await count.innerText());
      const nav1 = (await nav.innerText()).replace(/\s+/g, ' ');
      record('Una fila: «1–1 de 1 elemento», ambos botones deshabilitados', nav1.includes('1–1 de 1 elemento') && (await prev.isDisabled()) && (await next.isDisabled()), nav1);
      await page.locator('[data-qa="rows-0"]').click();
      await wait(200);
      record('Vacío: EmptyState propio y sin paginación', (await page.getByText('Aún no hay elementos.').count()) === 1 && (await nav.count()) === 0);
      await page.locator('[data-qa="rows-60"]').click();
      await page.locator('[data-qa="state-loading"]').click();
      await wait(200);
      record('Cargando: «Cargando elementos…»', (await count.innerText()) === 'Cargando elementos…', await count.innerText());
      const dv = page.locator('[data-qa="dataview"]');
      record('Cargando: contenedor aria-busy con esqueleto aria-hidden',
        (await dv.locator('[aria-busy="true"]').count()) === 1 && (await dv.locator('[aria-busy="true"] > [aria-hidden="true"]').count()) === 1);
      await page.locator('[data-qa="state-error"]').click();
      await wait(200);
      const alert = dv.getByRole('alert');
      record('Error: role=alert con el título y el mensaje por defecto',
        (await alert.count()) === 1 &&
          (await alert.innerText()).includes('No fue posible cargar la información.') &&
          (await alert.innerText()).includes('Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.'));
      await alert.getByRole('button', { name: 'Reintentar' }).click();
      await wait(200);
      // El tamaño de página sigue en 50 (elegido antes).
      record('Reintentar vuelve a cargar (estado listo)', (await rows.count()) === 50, await rows.count());
      // Alturas de fila: RowActionsCell cuadra 40 px (defecto) y 32 px (compacta).
      const h = async (loc) => Math.round(((await loc.boundingBox()) || { height: -1 }).height);
      record('Fila con acciones en línea mide 40 px', (await h(rows.first())) === 40, await h(rows.first()));
      record('Fila por defecto con menú mide 40 px', (await h(page.locator('[data-qa="row-default"]'))) === 40, await h(page.locator('[data-qa="row-default"]')));
      record('Fila con botones de icono mide 40 px', (await h(page.locator('[data-qa="row-icons"]'))) === 40, await h(page.locator('[data-qa="row-icons"]')));
      record('Fila compacta con acciones mide 32 px', (await h(page.locator('[data-qa="row-compact"]'))) === 32, await h(page.locator('[data-qa="row-compact"]')));
      record('Fila compacta con menú mide 32 px', (await h(page.locator('[data-qa="row-compact-menu"]'))) === 32, await h(page.locator('[data-qa="row-compact-menu"]')));
      const region = page.getByRole('region', { name: 'Tabla de QA' });
      record('La región de la tabla es enfocable (tabindex 0)', (await region.getAttribute('tabindex')) === '0');
      const cellLink = rows.first().getByRole('link');
      record('CellTitle con href: enlace con title igual al texto', (await cellLink.getAttribute('title')) === (await cellLink.innerText()).trim(), await cellLink.getAttribute('title'));

      // --- RowActions.
      const rowDefault = page.locator('[data-qa="row-default"]');
      const inlineButtons = rowDefault.locator('td').last().locator(':scope > div > button');
      record('RowActions: 2 acciones en línea + disparador del menú', (await inlineButtons.count()) === 3, await inlineButtons.count());
      const activar = rowDefault.getByRole('button', { name: 'Activar' });
      record('Acción en línea no disponible: aria-disabled y enfocable', (await activar.getAttribute('aria-disabled')) === 'true' && (await activar.evaluate((b) => b.disabled)) === false);
      record('Acción en línea no disponible: el motivo es su descripción', (await description(activar)) === 'Motivo de la fila.', await description(activar));
      const trigger = rowDefault.getByRole('button', { name: 'Más acciones para «Fila 1»' });
      record('Disparador del menú con aria-label «Más acciones para «Fila 1»»', (await trigger.count()) === 1);
      await trigger.click();
      const menu = page.getByRole('menu');
      await menu.waitFor({ timeout: 5000 });
      const items = menu.getByRole('menuitem');
      const itemTexts = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      record('Menú: Ver detalle, Archivar (con motivo), Descargar .md, Eliminar, Sin motivo',
        itemTexts.length === 5 && itemTexts[0] === 'Ver detalle' && itemTexts[1].includes('No se puede archivar todavía.'), itemTexts);
      record('Ítem con href es un enlace', (await menu.locator('a[role="menuitem"]').count()) === 1);
      const archivar = items.nth(1);
      record('Ítem no disponible: aria-disabled y sin data-disabled de Radix',
        (await archivar.getAttribute('aria-disabled')) === 'true' && (await archivar.getAttribute('data-disabled')) === null);
      await archivar.click({ force: true });
      await wait(200);
      record('Elegir el ítem no disponible no cierra el menú', (await menu.isVisible()));
      record('Ítem sin motivo: deshabilitado por Radix', (await items.nth(4).getAttribute('data-disabled')) !== null);
      await page.keyboard.press('Escape');
      await wait(400);
      const afterMenu = await activeInfo(page);
      record('Escape cierra el menú y devuelve el foco al disparador', afterMenu && afterMenu.label === 'Más acciones para «Fila 1»', afterMenu);
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Eliminar' }).click();
      await wait(300);
      record('Elegir «Eliminar» ejecuta la acción', (await page.locator('[data-qa="log"]').innerText()).includes('f'));
      await page.locator('[data-qa="toggle-busy"]').click();
      await wait(200);
      record('Acción del menú ocupada: el disparador lleva aria-busy y sigue habilitado',
        (await trigger.getAttribute('aria-busy')) === 'true' && (await trigger.isEnabled()));
      await trigger.click();
      await menu.waitFor({ timeout: 5000 });
      const busyItem = menu.getByRole('menuitem').filter({ hasText: 'Descargando…' });
      record('Ítem ocupado: «Descargando…» y deshabilitado', (await busyItem.count()) === 1 && (await busyItem.getAttribute('data-disabled')) !== null);
      await page.keyboard.press('Escape');
      await wait(300);
      const rowIcons = page.locator('[data-qa="row-icons"]');
      const agregando = rowIcons.getByRole('button', { name: 'Agregando…' });
      record('Acción en línea ocupada: «Agregando…», deshabilitada y aria-busy',
        (await agregando.count()) === 1 && (await agregando.isDisabled()) && (await agregando.getAttribute('aria-busy')) === 'true');
      await page.locator('[data-qa="toggle-busy"]').click();
      await wait(200);
      record('placement inline: 4 acciones en línea + menú', (await rowIcons.locator('td').last().locator(':scope > div > button').count()) === 5,
        await rowIcons.locator('td').last().locator(':scope > div > button').count());
      const up = page.locator('#qa-up');
      record('Solo icono: aria-label y sin descripción', (await up.getAttribute('aria-label')) === 'Subir fase' && (await up.getAttribute('aria-describedby')) === null);
      await up.hover();
      await wait(900);
      record('Solo icono: el tooltip repite el nombre al pasar el puntero', (await page.getByRole('tooltip').filter({ hasText: 'Subir fase' }).count()) > 0);
      record('Solo icono: con el tooltip abierto sigue sin descripción (TooltipTarget)', (await up.getAttribute('aria-describedby')) === null, await up.getAttribute('aria-describedby'));
      await page.mouse.move(5, 5);
      await wait(300);
      const down = page.locator('#qa-down');
      record('Solo icono no disponible: aria-disabled y motivo como descripción',
        (await down.getAttribute('aria-disabled')) === 'true' && (await description(down)) === 'Fase inicial con tareas: no se mueve ni se elimina.', await description(down));
      await down.click({ force: true });
      await wait(400);
      const downTip = page.getByRole('tooltip').filter({ hasText: 'Fase inicial con tareas' });
      record('Pulsar el no disponible muestra el tooltip con nombre y motivo', (await downTip.count()) > 0 && (await downTip.first().innerText()).includes('Bajar fase'));
      record('Pulsar el no disponible no ejecuta la acción', !(await page.locator('[data-qa="log"]').innerText()).includes('down'));
      record('Con el tooltip abierto, la descripción sigue siendo solo el motivo', (await description(down)) === 'Fase inicial con tareas: no se mueve ni se elimina.', await description(down));
      await page.keyboard.press('Escape');
      await page.mouse.move(5, 5);
      await wait(300);

      // --- DisabledHint y formulario.
      const blocked = page.getByRole('button', { name: 'Acción bloqueada' });
      record('DisabledHint: aria-disabled="true" sin atributo disabled', (await blocked.getAttribute('aria-disabled')) === 'true' && (await blocked.evaluate((b) => b.disabled)) === false);
      record('DisabledHint: descripción = motivo', (await description(blocked)) === 'Motivo de prueba.', await description(blocked));
      await blocked.click({ force: true });
      await wait(400);
      record('DisabledHint: el clic no ejecuta onClick ni envía el formulario',
        (await page.locator('[data-qa="clicks"]').innerText()) === '0' && (await page.locator('[data-qa="submits"]').innerText()) === '0');
      record('DisabledHint: pulsar abre el tooltip con el motivo', (await page.getByRole('tooltip').filter({ hasText: 'Motivo de prueba.' }).count()) > 0);
      await page.keyboard.press('Escape');
      await page.locator('#qa-campo').fill('texto');
      await page.locator('#qa-campo').press('Enter');
      await wait(300);
      record('Enter en un campo no envía el formulario por el botón no disponible', (await page.locator('[data-qa="submits"]').innerText()) === '0', await page.locator('[data-qa="submits"]').innerText());
      await page.locator('#qa-campo').focus();
      await page.keyboard.press('Tab');
      await wait(700);
      record('DisabledHint: con Tab se enfoca y abre el tooltip', ((await activeInfo(page)) || {}).text === 'Acción bloqueada' && (await page.getByRole('tooltip').filter({ hasText: 'Motivo de prueba.' }).count()) > 0, await activeInfo(page));
      await page.keyboard.press('Escape');
      await page.locator('h1').click();
      await page.locator('[data-qa="move-focus"]').click();
      await wait(700);
      record('NIT 3: clic + foco por script llega a «Destino bloqueado»', ((await activeInfo(page)) || {}).id === 'qa-hint-target', await activeInfo(page));
      record('NIT 3: con foco no visible el tooltip de DisabledHint no se abre', (await page.getByRole('tooltip').filter({ hasText: 'Motivo del destino.' }).count()) === 0);
      await page.getByRole('button', { name: 'Sin motivo' }).click();
      record('DisabledHint sin motivo devuelve el botón tal cual (onClick normal)', (await page.locator('[data-qa="clicks"]').innerText()) === '10');

      // --- RequirementsPanel.
      const summary = page.locator('#plan-guide-summary');
      const summaryText = (await summary.innerText()).replace(/\s+/g, ' ');
      record('Panel: -summary con título y «2 pendientes»', summaryText.includes('Aún no puedes enviar el plan a autorización') && summaryText.includes('2 pendientes'), summaryText);
      record('Panel: liveUpdates en -summary (aria-live polite)', (await summary.getAttribute('aria-live')) === 'polite');
      const panel = page.locator('#plan-guide');
      record('Panel: «Pendiente:» ×2 y «Cumplido:» ×2 (sr-only)',
        (await panel.getByText('Pendiente:', { exact: false }).count()) === 2 && (await panel.getByText('Cumplido:', { exact: false }).count()) === 2);
      record('Panel: listas rotuladas por grupo',
        (await panel.getByRole('list', { name: 'Fases y fechas' }).count()) === 1 && (await panel.getByRole('list', { name: 'Tareas y responsables' }).count()) === 1);
      const addTask = panel.getByRole('button', { name: 'Agregar tarea' });
      record('Panel: acción no disponible con href se pinta como botón (no enlace)',
        (await addTask.count()) === 1 && (await addTask.getAttribute('aria-disabled')) === 'true' && (await panel.getByRole('link', { name: 'Agregar tarea' }).count()) === 0);
      record('Panel: acción disponible con href es un enlace', (await panel.getByRole('link', { name: 'Abrir tarea' }).count()) === 1);
      record('Panel: «Responsable: Beto Lider BI»', (await panel.getByText('Responsable: Beto Lider BI').count()) === 1);
      const send = panel.getByRole('button', { name: 'Enviar a autorización' });
      const sendDesc = await description(send);
      record('Panel: la acción bloqueada se describe con el resumen y el motivo',
        sendDesc.includes('Aún no puedes enviar el plan a autorización') && sendDesc.includes('2 pendientes') && sendDesc.includes('Resuelve los pendientes de la lista'), sendDesc);
      await page.locator('[data-qa="toggle-done"]').click();
      await wait(200);
      const doneText = (await summary.innerText()).replace(/\s+/g, ' ');
      record('Panel sin pendientes: doneTitle y «Todo listo»', doneText.includes('El plan está listo para enviar') && doneText.includes('Todo listo'), doneText);
      record('Panel sin pendientes: la acción se habilita', (await send.getAttribute('aria-disabled')) === null);
      const gc4 = page.locator('#GC4-block');
      record('Panel compacto sin borde propio', (await gc4.evaluate((el) => getComputedStyle(el).borderTopWidth)) === '0px');
      record('Contador en singular: «1 pendiente»', (await page.locator('#GC4-block-summary').innerText()).includes('1 pendiente'));

      // --- ConfirmDialog.
      const delB = page.locator('[data-qa="del-Fila B"]');
      await delB.click();
      const alertDialog = page.getByRole('alertdialog');
      await alertDialog.waitFor({ timeout: 5000 });
      await wait(200);
      record('ConfirmDialog: role=alertdialog con foco inicial en Cancelar', ((await activeInfo(page)) || {}).text === 'Cancelar', await activeInfo(page));
      record('ConfirmDialog: descripción enlazada', (await description(alertDialog)) === 'Esta acción no se puede deshacer.', await description(alertDialog));
      await page.mouse.click(5, 5);
      await wait(300);
      record('ConfirmDialog: el clic fuera no lo cierra', await alertDialog.isVisible());
      await page.keyboard.press('Escape');
      await alertDialog.waitFor({ state: 'hidden', timeout: 5000 });
      await wait(300);
      record('ConfirmDialog: Escape cierra y el foco vuelve al disparador', ((await activeInfo(page)) || {}).text === 'Eliminar Fila B', await activeInfo(page));
      await delB.click();
      await alertDialog.waitFor({ timeout: 5000 });
      const confirmBtn = alertDialog.getByRole('button', { name: 'Eliminar', exact: true });
      await confirmBtn.click();
      await wait(100);
      record('ConfirmDialog: ocupado mientras corre onConfirm (aria-busy)', (await confirmBtn.getAttribute('aria-busy')) === 'true');
      await page.keyboard.press('Escape');
      await wait(100);
      record('ConfirmDialog: Escape no cierra mientras está ocupado', await alertDialog.isVisible().catch(() => false));
      await alertDialog.waitFor({ state: 'hidden', timeout: 5000 });
      await wait(400);
      record('ConfirmDialog: se cierra al terminar y ejecutó la acción', (await page.locator('[data-qa="confirmed"]').innerText()) === 'eliminado Fila B');
      const afterDelete = await activeInfo(page);
      record('NIT 4: disparador retirado → foco al destino de returnFocusTo (encabezado de la Section)', afterDelete && afterDelete.tag === 'h2' && afterDelete.text === 'Diálogos', afterDelete);

      // --- ReasonDialog.
      const openReason = page.locator('[data-qa="open-reason"]');
      await openReason.click();
      const reasonDialog = page.getByRole('dialog', { name: 'Devolver solicitud' });
      await reasonDialog.waitFor({ timeout: 5000 });
      await wait(200);
      record('ReasonDialog: foco inicial en el Textarea', ((await activeInfo(page)) || {}).id === 'devolver-reason', await activeInfo(page));
      const textarea = page.locator('#devolver-reason');
      record('ReasonDialog: sin atributo required y con aria-required', (await textarea.getAttribute('required')) === null && (await textarea.getAttribute('aria-required')) === 'true');
      await reasonDialog.getByRole('button', { name: 'Devolver' }).click();
      await wait(200);
      record('ReasonDialog: motivo vacío → requiredMessage en el campo', (await reasonDialog.getByText('El motivo es obligatorio para devolver.').count()) === 1);
      record('ReasonDialog: aria-invalid y error enlazado', (await textarea.getAttribute('aria-invalid')) === 'true' && ((await textarea.getAttribute('aria-describedby')) || '').includes('devolver-reason-error'));
      record('ReasonDialog: el foco vuelve al campo', ((await activeInfo(page)) || {}).id === 'devolver-reason');
      await textarea.fill('   ');
      record('ReasonDialog: el error se limpia al editar', (await reasonDialog.getByText('El motivo es obligatorio para devolver.').count()) === 0);
      await reasonDialog.getByRole('button', { name: 'Devolver' }).click();
      await wait(200);
      record('ReasonDialog: solo espacios cuenta como vacío', (await reasonDialog.getByText('El motivo es obligatorio para devolver.').count()) === 1);
      await textarea.fill('error');
      await reasonDialog.getByRole('button', { name: 'Devolver' }).click();
      await wait(100);
      record('ReasonDialog: texto de progreso «Devolviendo…»', (await reasonDialog.getByRole('button', { name: 'Devolviendo…' }).count()) === 1);
      await wait(500);
      const formAlert = reasonDialog.getByRole('alert');
      record('ReasonDialog: error del backend en línea (role=alert) y texto conservado',
        (await formAlert.innerText()).includes('La solicitud cambió de estado.') && (await textarea.inputValue()) === 'error');
      await textarea.fill('  motivo de prueba  ');
      await reasonDialog.getByRole('button', { name: 'Devolver' }).click();
      await reasonDialog.waitFor({ state: 'hidden', timeout: 5000 });
      await wait(400);
      record('ReasonDialog: onConfirm recibe el motivo recortado', (await page.locator('[data-qa="reason-result"]').innerText()) === 'motivo=[motivo de prueba]', await page.locator('[data-qa="reason-result"]').innerText());
      record('ReasonDialog: al cerrar, el foco vuelve al disparador', ((await activeInfo(page)) || {}).text === 'Devolver solicitud', await activeInfo(page));
      await openReason.click();
      await reasonDialog.waitFor({ timeout: 5000 });
      await wait(200);
      record('ReasonDialog: cada apertura empieza vacía', (await textarea.inputValue()) === '' && (await reasonDialog.getByRole('alert').count()) === 0);
      await reasonDialog.getByRole('button', { name: 'Cancelar' }).click();
      await reasonDialog.waitFor({ state: 'hidden', timeout: 5000 });
      await wait(300);
      record('ReasonDialog: Cancelar cierra y devuelve el foco', ((await activeInfo(page)) || {}).text === 'Devolver solicitud', await activeInfo(page));

      // --- Field.
      const titulo = page.locator('#qa-titulo');
      record('Field: nombre accesible «Título» (asterisco aria-hidden)', (await page.getByRole('textbox', { name: 'Título', exact: true }).count()) === 1);
      record('Field: aria-required sin required y ayuda enlazada',
        (await titulo.getAttribute('aria-required')) === 'true' && (await titulo.getAttribute('required')) === null && (await titulo.getAttribute('aria-describedby')) === 'qa-titulo-help');
      await page.locator('[data-qa="field-form"]').getByRole('button', { name: 'Guardar' }).click();
      await wait(200);
      record('Field: con error, aria-invalid y describedby ayuda + error',
        (await titulo.getAttribute('aria-invalid')) === 'true' && (await titulo.getAttribute('aria-describedby')) === 'qa-titulo-help qa-titulo-error');
      await titulo.fill('x');
      await wait(100);
      record('Field: editar limpia el error', (await page.locator('#qa-titulo-error').count()) === 0);
      const combinado = page.locator('#qa-combinado');
      record('Field (función): la vista añade el FormError al describedby (regla combinada)',
        ((await combinado.getAttribute('aria-describedby')) || '').includes('qa-form-error') && (await combinado.getAttribute('aria-invalid')) === 'true');
      record('FormError: role=alert con id `${formId}-error`', (await page.locator('#qa-form-error[role="alert"]').count()) === 1);
      const radios = page.locator('#qa-decision');
      record('FieldSet radio: role=radiogroup, aria-required y legend como nombre',
        (await radios.getAttribute('role')) === 'radiogroup' && (await radios.getAttribute('aria-required')) === 'true' && (await page.getByRole('radiogroup', { name: 'Decisión' }).count()) === 1);
      record('FieldSet radio: error enlazado', (await radios.getAttribute('aria-invalid')) === 'true' && ((await radios.getAttribute('aria-describedby')) || '').includes('qa-decision-error'));
      const checks2 = page.locator('#qa-participantes');
      record('FieldSet checkbox: sin aria-required y «(obligatorio)» sr-only en la legend',
        (await checks2.getAttribute('aria-required')) === null && (await checks2.locator('legend .sr-only').innerText()).includes('(obligatorio)'));

      // --- RequestContextBar.
      const trig = page.locator('#qa-request');
      record('RequestContextBar: el selector se describe con el helper', (await description(trig)) === '1 pendiente de triage', await description(trig));
      await trig.click();
      const listbox = page.getByRole('listbox');
      await listbox.waitFor({ timeout: 5000 });
      const groupsText = (await listbox.innerText()).replace(/\s+/g, ' ');
      record('RequestContextBar: grupos y «Otras solicitudes», opciones «{título} · {estado}»',
        groupsText.includes('Pendientes de triage') && groupsText.includes('Solicitud QA 1 · Registrada') && groupsText.includes('En triage') &&
          groupsText.includes('Solicitud QA 2 · En triage') && groupsText.includes('Otras solicitudes') && groupsText.includes('Solicitud QA 3 · Cerrada'), groupsText);
      await page.getByRole('option', { name: 'Solicitud QA 1 · Registrada' }).click();
      await wait(300);
      const bar = trig.locator('xpath=ancestor::div[contains(@class,"bg-surface-subtle")]');
      const barText = (await bar.innerText()).replace(/\s+/g, ' ');
      record('RequestSummary: estado, «Sin triage», «84 P1» y registro', barText.includes('Registrada') && barText.includes('Sin triage') && barText.includes('84') && barText.includes('P1') && barText.includes('Registro: 1 ene 2026'), barText);
      const facts1 = page.locator('[data-qa="facts-1"]');
      const refLink = facts1.getByRole('link');
      record('RequestFacts: enlace http(s) con target _blank y rel noopener noreferrer',
        (await refLink.getAttribute('href')) === 'https://ejemplo.invalid/ficha' && (await refLink.getAttribute('target')) === '_blank' && (await refLink.getAttribute('rel')) === 'noopener noreferrer');
      record('RequestFacts: fecha objetivo en UTC («15 jul 2027») y vacíos con «—»', (await facts1.innerText()).includes('15 jul 2027') && (await facts1.innerText()).includes('—'));
      const facts2 = page.locator('[data-qa="facts-2"]');
      record('RequestFacts: una referencia que no es http(s) no es enlace', (await facts2.getByRole('link').count()) === 0 && (await facts2.innerText()).includes('javascript:alert(1)'));

      // --- StatStrip y UtilizationBar.
      const tiles3 = page.locator('[data-qa="strip-3"] section > div');
      const widths3 = await tiles3.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      record('StatStrip de 3 en lg: tres columnas iguales en una fila', widths3.length === 3 && Math.abs(widths3[0] - widths3[2]) <= 1 && Math.abs(widths3[0] - widths3[1]) <= 1, widths3);
      const tops4 = await page.locator('[data-qa="strip-4"] section > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      record('StatStrip de 4 en lg: una sola fila', new Set(tops4).size === 1, tops4);
      const util = page.locator('[data-qa="utilization"]');
      const srTexts = await util.locator('.sr-only').allInnerTexts();
      record('UtilizationBar: textos sr-only con etiqueta', srTexts.join('|') === 'Utilización: 45\u00a0%|Utilización plan: 130\u00a0%|Utilización: —', srTexts);
      const fillWidth = await util.locator('span[style]').nth(1).evaluate((el) => el.style.width);
      record('UtilizationBar: relleno acotado a 100 %', fillWidth === '100%', fillWidth);
      const sectionRegion = page.getByRole('region', { name: 'Tabla', exact: true });
      record('Section: aria-labelledby apunta al encabezado y muestra el contador',
        (await sectionRegion.count()) === 1 && (await sectionRegion.locator('.tabular-nums').first().innerText()) === '60');

      // --- MasterDetail en escritorio: no mueve el foco.
      const second = page.getByRole('button', { name: /Diario del 11 oct 2026/ });
      await second.click();
      await wait(300);
      record('MasterDetail ≥1024: elegir no mueve el foco al detalle', ((await activeInfo(page)) || {}).tag === 'button', await activeInfo(page));
      record('SelectableList: aria-current en el elegido', (await second.getAttribute('aria-current')) === 'true');
      record('SelectableList vacía: EmptyState compacto', (await page.locator('[data-qa="selectable-empty"]').getByText('Aún no hay diarios.').count()) === 1);
      record('Sin errores de consola en /qa-feat-004 (1440)', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await context.close();
    }

    // ---------------------------------------------------------------- 768
    {
      const { context, page } = await newPage({ width: 768, height: 1024 });
      await page.goto(`${BASE}/qa-feat-004`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.getByRole('heading', { level: 1, name: 'QA componentes' }).waitFor({ timeout: 120000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const widths = await page.locator('[data-qa="strip-3"] section > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      const stripWidth = await page.locator('[data-qa="strip-3"] section').evaluate((e) => Math.round(e.getBoundingClientRect().width));
      record('StatStrip de 3 en 2 columnas: el último ocupa la fila entera (NIT 8)', widths.length === 3 && Math.abs(widths[2] - (stripWidth - 2)) <= 1 && widths[0] < widths[2], { widths, stripWidth });
      const bg = await page.locator('[data-qa="strip-4"] section').evaluate((e) => getComputedStyle(e).columnGap);
      record('StatStrip: separadores de 1 px con gap-px (sin divide-*)', bg === '1px', bg);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      record('Sin desbordamiento horizontal en 768 (con main min-w-0)', overflow <= 1, overflow);
      await page.screenshot({ path: path.join(OUT, 'qa-componentes--768x1024.png'), fullPage: true });
      await context.close();
    }

    // ---------------------------------------------------------------- 390
    {
      const { context, page, consoleErrors } = await newPage({ width: 390, height: 844 });
      await page.goto(`${BASE}/qa-feat-004`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.getByRole('heading', { level: 1, name: 'QA componentes' }).waitFor({ timeout: 120000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({ path: path.join(OUT, 'qa-componentes--390x844.png'), fullPage: true });
      const third = page.getByRole('button', { name: /Diario del 12 oct 2026/ });
      await third.scrollIntoViewIfNeeded();
      await third.click();
      await wait(500);
      const focused = await activeInfo(page);
      const headingTop = await page.locator('[data-qa="detail-heading"]').evaluate((e) => Math.round(e.getBoundingClientRect().top));
      record('MasterDetail <1024: tras elegir, foco en el encabezado del detalle', focused && focused.tag === 'h2' && focused.text === 'Detalle m3', focused);
      record('MasterDetail <1024: el detalle queda a la vista', headingTop >= 0 && headingTop < 844, headingTop);
      const toolbarSearch = await page.locator('#qa-buscar').evaluate((e) => Math.round(e.getBoundingClientRect().width));
      record('Toolbar en móvil: la búsqueda ocupa el ancho', toolbarSearch >= 300, toolbarSearch);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      record('Sin desbordamiento horizontal en 390', overflow <= 1, overflow);
      record('Sin errores de consola en /qa-feat-004 (390)', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await context.close();
    }

    // ---------------------------------------------------------------- servidor
    {
      const { context, page, consoleErrors } = await newPage({ width: 1440, height: 900 });
      const res = await page.goto(`${BASE}/qa-feat-004/servidor`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.getByRole('heading', { level: 1, name: 'QA servidor' }).waitFor({ timeout: 120000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const html = await (await page.request.get(`${BASE}/qa-feat-004/servidor`)).text();
      record('Componentes seguros para servidor: la página de servidor responde 200', res && res.status() === 200, res && res.status());
      record('SSR: el HTML ya trae el h1, los badges y la leyenda', html.includes('QA servidor') && html.includes('Bandas de prioridad') && html.includes('Sin priorizar'));
      const crumbs = page.getByRole('navigation', { name: 'Ruta de navegación' });
      record('PageHeader: migas con enlace y separador oculto', (await crumbs.getByRole('link', { name: 'Inicio' }).count()) === 1 && (await crumbs.locator('svg[aria-hidden="true"]').count()) === 1);
      const pb = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      record('PriorityBadge compacto «84 P1» y full sin banda «Sin priorizar»', pb.includes('84 P1') && pb.includes('Sin priorizar'), pb.slice(0, 200));
      record('StatusBadge con srDescription: texto exacto + span hermano',
        (await page.getByText('Cumplido', { exact: true }).count()) === 1 && (await page.locator('span.sr-only', { hasText: ': explicación' }).count()) === 1);
      record('DescriptionList: vacío como «—»', (await page.locator('dd', { hasText: '—' }).count()) >= 1);
      record('Sin errores de consola en la página de servidor', consoleErrors.length === 0, consoleErrors.slice(0, 3));
      await page.screenshot({ path: path.join(OUT, 'qa-servidor--1440x900.png'), fullPage: true });
      await context.close();
    }
  } catch (err) {
    record('excepción', false, String(err && err.stack ? err.stack : err).slice(0, 800));
  } finally {
    await browser.close();
  }
  const failed = checks.filter((c) => !c.ok);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total: checks.length, failed: failed.length, checks }, null, 2), 'utf8');
  console.log(`total=${checks.length} failed=${failed.length}`);
  process.exit(failed.length > 0 ? 1 : 0);
})();
