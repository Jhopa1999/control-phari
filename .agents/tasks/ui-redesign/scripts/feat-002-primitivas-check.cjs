// Comprobación de las primitivas de FEAT-002 (artefacto, no se commitea).
// Usa la página temporal /qa-feat-002 del worktree (se borra antes del commit).
// Uso: node feat-002-primitivas-check.cjs <outDir>
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
    checks.push({ name, ok, detail: detail === undefined ? null : detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
  };
  try {
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const tag = `${vp.width}x${vp.height}`;
      const context = await browser.newContext({ viewport: vp, locale: 'es-ES' });
      await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
      });
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
      await page.goto(`${BASE}/qa-feat-002`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.locator('#qa-icono').waitFor({ timeout: 120000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({ path: path.join(OUT, `qa-primitivas--${tag}.png`), fullPage: true });

      const icon = page.locator('#qa-icono');
      const activeId = () => page.evaluate(() => document.activeElement && document.activeElement.id);

      // NIT 3: foco movido por script tras un clic de ratón -> sin tooltip.
      await page.locator('#qa-mover').click();
      await page.waitForTimeout(700);
      record(`${tag} clic + foco por script llega a #qa-icono`, (await activeId()) === 'qa-icono', await activeId());
      record(
        `${tag} NIT 3: con foco no visible el tooltip no se abre`,
        (await icon.getAttribute('data-state')) === 'closed' && (await page.getByRole('tooltip').count()) === 0,
        await icon.getAttribute('data-state'),
      );

      // Teclado: Tab desde «Mover foco» hasta el icono -> se abre y no describe.
      await page.locator('#qa-mover').focus();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(700);
      const openState = await icon.getAttribute('data-state');
      record(`${tag} con foco de teclado el tooltip se abre`, /open/.test(openState || ''), openState);
      record(
        `${tag} el tooltip abierto muestra la etiqueta`,
        (await page.getByRole('tooltip').filter({ hasText: 'Expandir menú' }).count()) > 0,
      );
      record(
        `${tag} TooltipTarget: sin aria-describedby añadido por Radix`,
        (await icon.getAttribute('aria-describedby')) === null,
        await icon.getAttribute('aria-describedby'),
      );
      await page.keyboard.press('Escape');

      // Teclado + foco por script: Tab hasta el icono, Escape, Shift+Tab hasta
      // «Mover foco» y Enter. Chromium marca focus-visible en el destino y el
      // tooltip se abre. Antes se aparta el puntero (quedó sobre «Mover foco»).
      await page.locator('h1').click();
      await page.locator('#qa-mover').focus();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(700);
      const fvAfterEnter = await page.evaluate(() => document.activeElement && document.activeElement.matches(':focus-visible'));
      record(
        `${tag} Tab + Enter + foco por script: foco visible y tooltip abierto`,
        (await activeId()) === 'qa-icono' && fvAfterEnter === true && /open/.test((await icon.getAttribute('data-state')) || ''),
        { activo: await activeId(), focusVisible: fvAfterEnter, estado: await icon.getAttribute('data-state') },
      );
      await page.keyboard.press('Escape');

      // Descripción propia conservada con el tooltip abierto (hover).
      if (vp.width >= 1024) {
        await page.locator('#qa-desc').hover();
        await page.waitForTimeout(700);
        record(
          `${tag} hover abre el tooltip y conserva la descripción propia`,
          /open/.test((await page.locator('#qa-desc').getAttribute('data-state')) || '') &&
            (await page.locator('#qa-desc').getAttribute('aria-describedby')) === 'qa-desc-texto',
          await page.locator('#qa-desc').getAttribute('aria-describedby'),
        );
        await page.mouse.move(0, 0);
      }

      // Button unavailable.
      const send = page.locator('#qa-enviar');
      record(
        `${tag} unavailable: aria-disabled="true" y sin disabled`,
        (await send.getAttribute('aria-disabled')) === 'true' && (await send.getAttribute('disabled')) === null,
      );
      await page.locator('#qa-campo').focus();
      await page.keyboard.press('Tab');
      record(`${tag} unavailable: sigue en el orden de tabulación`, (await activeId()) === 'qa-enviar', await activeId());
      // Playwright trata aria-disabled como «no habilitado»: force salta esa espera.
      record(`${tag} unavailable: Playwright lo ve como deshabilitado (toBeDisabled)`, await send.isDisabled());
      await send.click({ force: true });
      await page.waitForTimeout(150);
      record(`${tag} unavailable: el clic no envía ni llama a onClick`, (await page.locator('#qa-contadores').innerText()) === '0|0|1', await page.locator('#qa-contadores').innerText());
      await page.locator('#qa-campo').fill('texto');
      await page.locator('#qa-campo').press('Enter');
      await page.waitForTimeout(150);
      record(`${tag} unavailable: Enter en el campo no envía el formulario`, (await page.locator('#qa-contadores').innerText()) === '0|0|2', await page.locator('#qa-contadores').innerText());

      // Button loading.
      const loading = page.locator('#qa-cargando');
      record(
        `${tag} loading: disabled, aria-busy y spinner`,
        (await loading.getAttribute('disabled')) !== null &&
          (await loading.getAttribute('aria-busy')) === 'true' &&
          (await loading.locator('svg.animate-spin').count()) === 1,
      );

      // DropdownMenu: ítem no disponible alcanzable por teclado y sin ejecutar; ítem ocupado deshabilitado.
      await page.locator('#qa-menu').click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      await page.screenshot({ path: path.join(OUT, `qa-menu-abierto--${tag}.png`), fullPage: false });
      const unavailableItem = menu.getByRole('menuitem', { name: /Eliminar/ });
      record(`${tag} menú: el ítem no disponible lleva aria-disabled y muestra el motivo`, (await unavailableItem.getAttribute('aria-disabled')) === 'true' && (await unavailableItem.innerText()).includes('Tiene tareas asociadas.'));
      // Radix lleva el foco al contenido al abrir: se espera antes de usar flechas.
      await page.waitForFunction(() => document.activeElement && document.activeElement.getAttribute('role') === 'menu');
      const pressAndRead = async (key) => {
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
        return page.evaluate(() => (document.activeElement && document.activeElement.textContent) || '');
      };
      await pressAndRead('ArrowDown');
      const focusedText = await pressAndRead('ArrowDown');
      record(`${tag} menú: el teclado llega al ítem no disponible`, focusedText.includes('Eliminar'), focusedText);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      record(`${tag} menú: seleccionar el ítem no disponible no ejecuta y deja el menú abierto`, (await menu.isVisible()) && (await page.locator('#qa-menu-accion').innerText()) === 'ninguna');
      const afterText = await pressAndRead('ArrowDown');
      record(`${tag} menú: el ítem ocupado (disabled) se salta con el teclado`, afterText.includes('Eliminar') && !afterText.includes('Descarg'), afterText);
      const busyItem = menu.getByRole('menuitem', { name: /Descargando/ });
      record(`${tag} menú: el ítem ocupado muestra busyLabel y data-disabled`, (await busyItem.count()) === 1 && (await busyItem.getAttribute('data-disabled')) !== null);
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      record(`${tag} menú: Escape cierra y devuelve el foco al disparador`, (await activeId()) === 'qa-menu', await activeId());
      // Tras cerrar, Radix retira el aria-hidden del resto de la página.
      await page.waitForFunction(() => !document.querySelector('[data-aria-hidden="true"]'));

      // Tabs con flechas (Radix mueve el foco en un setTimeout: se sondea).
      await page.getByRole('tab', { name: 'Controles' }).focus();
      await page.keyboard.press('ArrowRight');
      const tabSelected = await page
        .waitForFunction(
          () => {
            const t = Array.from(document.querySelectorAll('[role=tab]')).find((e) => e.textContent === 'Validaciones');
            return t && t.getAttribute('aria-selected') === 'true';
          },
          null,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
      record(
        `${tag} tabs: ArrowRight activa «Validaciones»`,
        tabSelected && (await page.getByRole('tabpanel').innerText()).includes('validaciones'),
      );

      // Sheet.
      await page.locator('#qa-abrir-menu').click();
      const sheet = page.getByRole('dialog', { name: 'Menú' });
      await sheet.waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `qa-sheet--${tag}.png`), fullPage: false });
      record(`${tag} sheet: tiene «Cerrar menú»`, (await sheet.getByRole('button', { name: 'Cerrar menú' }).count()) === 1);
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'hidden' });
      record(`${tag} sheet: Escape cierra y devuelve el foco`, (await activeId()) === 'qa-abrir-menu', await activeId());

      // RadioCards.
      const devolver = page.getByRole('radio', { name: 'Devolver', exact: true });
      record(`${tag} radio-cards: nombre = etiqueta y descripción aparte`, (await devolver.count()) === 1 && (await devolver.getAttribute('aria-describedby')) === 'qa-decision-DEVOLVER-description');
      await page.getByText('Devolver', { exact: true }).click();
      await page.keyboard.press('ArrowDown');
      record(`${tag} radio-cards: clic y flechas cambian la opción`, (await page.getByRole('radio', { name: 'Rechazar', exact: true }).isChecked()));

      // SegmentedRadio.
      const group = page.getByRole('radiogroup', { name: 'Impacto' });
      record(`${tag} segmented-radio: radiogroup con nombre de labelledBy`, (await group.count()) === 1);
      await group.getByText('3', { exact: true }).click();
      await page.keyboard.press('ArrowRight');
      record(`${tag} segmented-radio: clic y flechas cambian el valor`, await page.locator('#qa-impacto-4').isChecked());

      // Checkbox dentro de label.
      await page.getByText('Defecto bloqueante').click();
      record(`${tag} checkbox: el label lo marca`, await page.locator('#qa-check').isChecked());

      // Select con opción larga en dos líneas.
      await page.locator('#qa-select').click();
      const listbox = page.getByRole('listbox');
      await listbox.waitFor();
      await page.waitForTimeout(250);
      const lb = await listbox.boundingBox();
      await page.screenshot({ path: path.join(OUT, `qa-select--${tag}.png`), fullPage: false });
      record(`${tag} select: el desplegable no sale del viewport`, lb !== null && lb.x >= 0 && lb.x + lb.width <= vp.width + 1, lb);
      await page.keyboard.press('Escape');
      await listbox.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.querySelector('[data-aria-hidden="true"]'));

      // Tabla con región desplazable enfocable.
      const region = page.getByRole('region', { name: 'Tabla de prueba' });
      record(`${tag} table: región con nombre y tabIndex 0`, (await region.count()) === 1 && (await region.getAttribute('tabindex')) === '0');
      const rowHeights = await page.evaluate(() => Array.from(document.querySelectorAll('[data-density=compact] tr')).map((tr) => Math.round(tr.getBoundingClientRect().height)));
      record(`${tag} table compacta: encabezado 36 px y filas 32 px`, rowHeights[0] === 36 && rowHeights.slice(1).every((h) => h === 32), rowHeights);
      const defaultRow = await page.evaluate(() => {
        const t = document.querySelector('table[data-density=compact]');
        if (!t) return null;
        t.setAttribute('data-density', 'default');
        const hs = Array.from(t.querySelectorAll('tr')).map((tr) => Math.round(tr.getBoundingClientRect().height));
        t.setAttribute('data-density', 'compact');
        return hs;
      });
      record(`${tag} table por defecto: encabezado 36 px y filas 40 px`, defaultRow !== null && defaultRow[0] === 36 && defaultRow.slice(1).every((h) => h === 40), defaultRow);

      // Dialog sm con cuerpo y pie.
      await page.locator('#qa-dialogo').click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `qa-dialogo--${tag}.png`), fullPage: false });
      const box = await dialog.boundingBox();
      record(`${tag} dialog sm: ancho ≤ 440 px y dentro del viewport`, box !== null && box.width <= 440 && box.x >= 0 && box.x + box.width <= vp.width, box);
      record(`${tag} dialog: botón «Cerrar»`, (await dialog.getByRole('button', { name: 'Cerrar', exact: true }).count()) === 1);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });

      // Toaster en español.
      await page.locator('#qa-toast').click();
      await page.getByText('Cambios guardados.').waitFor();
      const regionLabel = await page.locator('section[aria-label^="Notificaciones"]').getAttribute('aria-label');
      record(`${tag} toaster: región «Notificaciones»`, (regionLabel || '').startsWith('Notificaciones'), regionLabel);
      record(`${tag} toaster: botón «Cerrar notificación»`, (await page.getByRole('button', { name: 'Cerrar notificación' }).count()) >= 1);
      await page.screenshot({ path: path.join(OUT, `qa-toast--${tag}.png`), fullPage: false });

      record(`${tag} sin errores de consola`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
      await context.close();
    }
  } catch (err) {
    record('ejecución', false, String(err && err.message ? err.message : err));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ checks }, null, 2), 'utf8');
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`checks=${checks.length} failed=${failed} out=${OUT}`);
  process.exit(failed ? 1 : 0);
})();
