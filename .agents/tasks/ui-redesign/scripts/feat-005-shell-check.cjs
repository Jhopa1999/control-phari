// Comprobación del shell de FEAT-005 en dev-header (artefacto, no se commitea).
// Uso: node feat-005-shell-check.cjs <carpeta>
// Solo hace GET a la API (los cambios de actor son de localStorage): no crea ni
// modifica datos. Los estados de error, vacío y carga del menú se simulan
// interceptando GET /me/permissions o GET /dev/actors.
const path = require('node:path');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const JEFE = 'jefe@demo.local';
const INTEGRANTE = 'integrante.bi@demo.local';
const INTEGRANTE_NAME = 'Carla Integrante BI';
const out = path.resolve(process.argv[2] || 'shell-check');
fs.mkdirSync(out, { recursive: true });

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, String(err && err.message ? err.message : err).split('\n').slice(0, 14).join(' | '));
  }
}

async function newPage(browser, { viewport = { width: 1440, height: 900 }, actor = JEFE, storage = {} } = {}) {
  const context = await browser.newContext({ locale: 'es-ES', viewport });
  await context.addInitScript(
    ([a, extra]) => {
      if (a) window.localStorage.setItem('actorId', a);
      for (const [k, v] of Object.entries(extra)) window.localStorage.setItem(k, v);
    },
    [actor, storage],
  );
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  return { context, page, consoleErrors };
}

const mainNav = (scope) => scope.getByRole('navigation', { name: 'Navegación principal', exact: true });
const aside = (page) => page.getByRole('complementary', { name: 'Menú lateral', includeHidden: true });

async function duplicateIds(page) {
  return page.evaluate(() => {
    const seen = new Map();
    for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
    return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  });
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ── A. Escritorio 1440: nombres, selector dev, riel y preferencia ──────────
    {
      const { context, page, consoleErrors } = await newPage(browser);
      await page.goto(`${BASE}/inicio`);
      const nav = mainNav(page);
      await expect(nav.getByRole('link', { name: 'Panel del área', exact: true })).toBeVisible({ timeout: 60000 });

      await check('A1 marca: enlace a /inicio con nombre «Portal del área Analítica»', async () => {
        const brand = aside(page).getByRole('link', { name: 'Portal del área Analítica', exact: true });
        await expect(brand).toHaveCount(1);
        await expect(brand).toHaveAttribute('href', '/inicio');
      });
      await check('A2 Proyectos se llama «Proyectos Próximamente»', async () => {
        await expect(nav.getByRole('link', { name: 'Proyectos Próximamente', exact: true })).toHaveCount(1);
      });
      await check('A3 selector dev: nombre = etiqueta visible, id actor-select, sin aria-label', async () => {
        const combo = page.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true });
        await expect(combo).toHaveCount(1);
        await expect(combo).toHaveAttribute('id', 'actor-select');
        if ((await combo.getAttribute('aria-label')) !== null) throw new Error('lleva aria-label');
        await expect(combo).toHaveText('Ana Jefa');
      });
      await check('A4 el menú no tiene h2 y el aside es el landmark «Menú lateral»', async () => {
        await expect(nav.locator('h1, h2, h3')).toHaveCount(0);
        await expect(page.getByRole('complementary', { name: 'Menú lateral', exact: true })).toBeVisible();
        const w = await aside(page).evaluate((el) => el.getBoundingClientRect().width);
        if (w !== 240) throw new Error(`ancho ${w}`);
        return `ancho ${w}`;
      });
      await page.screenshot({ path: path.join(out, 'A-1440-expandido.png') });
      await check('A5 cambiar de actor desde el sidebar recarga permisos y menú', async () => {
        const req = page.waitForRequest((r) => r.url().endsWith('/me/permissions') && r.headers()['x-actor-id'] === INTEGRANTE);
        await page.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true }).click();
        await page.getByRole('option', { name: INTEGRANTE_NAME, exact: true }).click();
        await req;
        await expect(nav.getByRole('link', { name: 'Triage', exact: true })).toHaveCount(0);
        await expect(nav.getByRole('link', { name: 'Solicitudes', exact: true })).toBeVisible();
        const stored = await page.evaluate(() => window.localStorage.getItem('actorId'));
        if (stored !== INTEGRANTE) throw new Error(`localStorage.actorId=${stored}`);
        return 'X-Actor-Id integrante, sin Triage';
      });
      await check('A6 «Contraer menú» con teclado: riel de 56 px, foco en «Expandir menú», preferencia true', async () => {
        await page.getByRole('button', { name: 'Contraer menú', exact: true }).focus();
        await page.keyboard.press('Enter');
        const expand = page.getByRole('button', { name: 'Expandir menú', exact: true });
        await expect(expand).toBeFocused();
        await expect(aside(page)).toHaveCSS('width', '56px');
        const pref = await page.evaluate(() => window.localStorage.getItem('sidebarCollapsed'));
        if (pref !== 'true') throw new Error(`sidebarCollapsed=${pref}`);
      });
      await check('A7 en riel a 1440 un ítem con foco de teclado muestra su tooltip, sin describir el enlace', async () => {
        await page.keyboard.press('Shift+Tab'); // vuelve hacia el menú: el último enlace visible
        const focused = await page.evaluate(() => ({
          text: document.activeElement && document.activeElement.textContent,
          tag: document.activeElement && document.activeElement.tagName,
          describedby: document.activeElement && document.activeElement.getAttribute('aria-describedby'),
        }));
        const tooltip = page.getByRole('tooltip');
        await expect(tooltip).toHaveCount(1);
        const tipText = await tooltip.textContent();
        if (focused.describedby) throw new Error(`aria-describedby=${focused.describedby}`);
        return { focused: focused.text, tooltip: tipText };
      });
      await check('A8 tooltip de Proyectos en riel: «Proyectos · Próximamente»', async () => {
        const link = nav.getByRole('link', { name: 'Proyectos Próximamente', exact: true });
        // Con el integrante también está Proyectos.
        await link.focus();
        // El tooltip anterior sigue montado durante su salida (150 ms): se busca por nombre.
        await expect(page.getByRole('tooltip', { name: 'Proyectos · Próximamente', exact: true })).toBeVisible();
        await expect(page.getByRole('tooltip')).toHaveCount(1);
        if (await link.getAttribute('aria-describedby')) throw new Error('el tooltip describe el enlace');
      });
      await page.screenshot({ path: path.join(out, 'A-1440-riel-tooltip.png') });
      await check('A9 tras recargar, la preferencia de riel se conserva a 1440', async () => {
        await page.reload();
        await expect(page.getByRole('button', { name: 'Expandir menú', exact: true })).toBeVisible();
        await expect(aside(page)).toHaveCSS('width', '56px');
      });
      await check('A10 el avatar del riel expande el menú y enfoca el selector dev', async () => {
        const avatar = page.getByRole('button', { name: /^Usuario actual \(dev\): .+\. Expandir el menú para cambiarlo$/ });
        await expect(avatar).toHaveCount(1);
        const label = await avatar.getAttribute('aria-label');
        await avatar.click();
        const combo = page.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true });
        await expect(combo).toBeFocused();
        await expect(aside(page)).toHaveCSS('width', '240px');
        const pref = await page.evaluate(() => window.localStorage.getItem('sidebarCollapsed'));
        if (pref !== 'false') throw new Error(`sidebarCollapsed=${pref}`);
        return label;
      });
      await check('A11 sin ids duplicados ni errores/avisos de consola', async () => {
        const dups = await duplicateIds(page);
        if (dups.length) throw new Error(`ids duplicados: ${dups.join(', ')}`);
        if (consoleErrors.length) throw new Error(consoleErrors.join(' || '));
      });
      await context.close();
    }

    // ── B. Cajón a 390 ─────────────────────────────────────────────────────────
    {
      const { context, page, consoleErrors } = await newPage(browser, { viewport: { width: 390, height: 844 } });
      await page.goto(`${BASE}/inicio`);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60000 });
      const trigger = page.getByRole('button', { name: 'Abrir menú', exact: true });
      const drawer = page.getByRole('dialog', { name: 'Menú principal', exact: true });
      await check('B1 a 390 el h1 es lo primero del contenido y el aside no se ve', async () => {
        await expect(aside(page)).toBeHidden();
        const h1Top = await page.getByRole('main').getByRole('heading', { level: 1 }).evaluate((el) => el.getBoundingClientRect().top);
        if (h1Top > 120) throw new Error(`h1 a ${h1Top}px`);
        return `h1 a ${Math.round(h1Top)} px`;
      });
      await check('B2 el cajón: selector dev con id drawer-actor-select y nombre visible, sin ids duplicados', async () => {
        await trigger.click();
        await expect(drawer).toBeVisible();
        const combo = drawer.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true });
        await expect(combo).toHaveAttribute('id', 'drawer-actor-select');
        await expect(drawer.getByRole('button', { name: 'Contraer menú' })).toHaveCount(0);
        await expect(drawer.getByRole('button', { name: 'Cerrar menú', exact: true })).toHaveCount(1);
        const dups = await duplicateIds(page);
        if (dups.length) throw new Error(`ids duplicados: ${dups.join(', ')}`);
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, 'B-390-cajon.png') });
      await check('B3 cambiar de actor desde el cajón recarga permisos y menú', async () => {
        const req = page.waitForRequest((r) => r.url().endsWith('/me/permissions') && r.headers()['x-actor-id'] === INTEGRANTE);
        await drawer.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true }).click();
        await page.getByRole('option', { name: INTEGRANTE_NAME, exact: true }).click();
        await req;
        await expect(drawer.getByRole('link', { name: 'Triage', exact: true })).toHaveCount(0);
        await expect(drawer.getByRole('link', { name: 'Solicitudes', exact: true })).toBeVisible();
      });
      await check('B4 Escape cierra el cajón y devuelve el foco a «Abrir menú»', async () => {
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
      await check('B5 clic fuera cierra el cajón', async () => {
        await trigger.click();
        await expect(drawer).toBeVisible();
        await page.mouse.click(370, 400);
        await expect(drawer).toHaveCount(0);
      });
      await check('B6 al pasar a ≥1024 px el cajón se cierra', async () => {
        await trigger.click();
        await expect(drawer).toBeVisible();
        await page.setViewportSize({ width: 1100, height: 800 });
        await expect(drawer).toHaveCount(0);
        await expect(aside(page)).toBeVisible();
      });
      await check('B7 la marca del cajón navega a /inicio y lo cierra', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${BASE}/demanda/solicitudes`);
        await trigger.click();
        await drawer.getByRole('link', { name: 'Portal del área Analítica', exact: true }).click();
        await expect(page).toHaveURL(`${BASE}/inicio`);
        await expect(drawer).toHaveCount(0);
      });
      await check('B8 sin errores/avisos de consola', async () => {
        if (consoleErrors.length) throw new Error(consoleErrors.join(' || '));
      });
      await context.close();
    }

    // ── C. Estados del menú ───────────────────────────────────────────────────
    {
      const { context, page } = await newPage(browser, { actor: null });
      await check('C1 sin actor: «Elige un usuario en «Usuario actual (dev)»…»', async () => {
        await page.goto(`${BASE}/inicio`);
        await expect(
          mainNav(page).getByText('Elige un usuario en «Usuario actual (dev)», al final de este menú, para ver tus módulos.', { exact: true }),
        ).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true })).toHaveText('Elige un usuario');
      });
      await page.screenshot({ path: path.join(out, 'C1-sin-actor.png') });
      await context.close();
    }
    {
      const { context, page } = await newPage(browser);
      let fail = true;
      await page.route('**/me/permissions', async (route) => {
        if (fail) return route.fulfill({ status: 500, json: { message: 'error simulado' } });
        return route.continue();
      });
      await check('C2 error: «No fue posible cargar tus permisos.» (alert) y «Reintentar» recupera', async () => {
        await page.goto(`${BASE}/inicio`);
        const alert = mainNav(page).getByRole('alert');
        await expect(alert).toHaveText('No fue posible cargar tus permisos.', { timeout: 60000 });
        await page.screenshot({ path: path.join(out, 'C2-error-1440.png') });
        fail = false;
        await mainNav(page).getByRole('button', { name: 'Reintentar', exact: true }).click();
        await expect(mainNav(page).getByRole('link', { name: 'Panel del área', exact: true })).toBeVisible();
      });
      await check('C3 error en riel (1100): aviso en el árbol, botón Info que expande y enfoca el aviso', async () => {
        fail = true;
        await page.setViewportSize({ width: 1100, height: 800 });
        await page.reload();
        const alert = mainNav(page).getByRole('alert');
        await expect(alert).toHaveText('No fue posible cargar tus permisos.', { timeout: 60000 });
        const box = await alert.boundingBox();
        if (!box || box.width > 1) throw new Error(`el aviso no es sr-only en riel: ${JSON.stringify(box)}`);
        await expect(mainNav(page).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
        const info = page.getByRole('button', { name: 'Expandir el menú para ver el aviso', exact: true });
        await info.focus();
        await expect(page.getByRole('tooltip')).toHaveText('No fue posible cargar tus permisos.');
        await page.screenshot({ path: path.join(out, 'C3-error-riel-1100.png') });
        await page.keyboard.press('Enter');
        await expect(aside(page)).toHaveCSS('width', '240px');
        const focusedNotice = await page.evaluate(() => {
          const el = document.activeElement;
          return !!el && el.tagName === 'DIV' && el.getAttribute('tabindex') === '-1' && (el.textContent || '').includes('No fue posible cargar tus permisos.');
        });
        if (!focusedNotice) throw new Error('el foco no está en el aviso');
        await expect(mainNav(page).getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
      });
      await context.close();
    }
    {
      const { context, page } = await newPage(browser);
      await page.route('**/me/permissions', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({ response, json: { ...body, allowedModules: [] } });
      });
      await check('C4 sin módulos: «No tienes módulos habilitados. Pide acceso al jefe de área.»', async () => {
        await page.goto(`${BASE}/inicio`);
        await expect(
          mainNav(page).getByText('No tienes módulos habilitados. Pide acceso al jefe de área.', { exact: true }),
        ).toBeVisible({ timeout: 60000 });
      });
      await context.close();
    }
    {
      const { context, page } = await newPage(browser);
      await page.route('**/me/permissions', async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.continue();
      });
      await check('C5 cargando: 6 esqueletos y «Cargando menú…» en role=status', async () => {
        await page.goto(`${BASE}/inicio`);
        await expect(mainNav(page).getByRole('status')).toHaveText('Cargando menú…', { timeout: 60000 });
        const skeletons = await mainNav(page).locator('.animate-pulse').count();
        if (skeletons !== 6) throw new Error(`${skeletons} esqueletos`);
        await page.screenshot({ path: path.join(out, 'C5-cargando.png') });
      });
      await context.close();
    }
    {
      const { context, page } = await newPage(browser);
      await page.route('**/dev/actors', (route) => route.fulfill({ status: 500, json: { message: 'error simulado' } }));
      await check('C6 /dev/actors con error: «No fue posible cargar los usuarios.» (alert)', async () => {
        await page.goto(`${BASE}/inicio`);
        await expect(aside(page).getByRole('alert')).toHaveText('No fue posible cargar los usuarios.', { timeout: 60000 });
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2), 'utf8');
  console.log(`total=${results.length} failed=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
