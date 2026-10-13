// Comprobación del shell y del login de FEAT-005 en modo jwt (artefacto, no se
// commitea). Uso: node feat-005-jwt-check.cjs <carpeta>  (con E2E_JWT_PASSWORD)
// POST /auth/login no escribe en la base (el módulo auth no tiene escrituras):
// los intentos fallidos no modifican datos.
const path = require('node:path');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const IDENTIFIER = 'jefe@demo.local';
const PASSWORD = process.env.E2E_JWT_PASSWORD;
if (!PASSWORD) {
  console.error('Falta E2E_JWT_PASSWORD');
  process.exit(2);
}
const out = path.resolve(process.argv[2] || 'jwt-check');
fs.mkdirSync(out, { recursive: true });

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`ok   ${name}${detail ? ` -> ${JSON.stringify(detail)}` : ''}`);
  } catch (err) {
    const detail = String(err && err.message ? err.message : err).split('\n').slice(0, 10).join(' | ');
    results.push({ name, ok: false, detail });
    console.log(`FAIL ${name} -> ${detail}`);
  }
}

async function signIn(page) {
  await page.locator('#identifier').fill(IDENTIFIER);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
}

(async () => {
  const browser = await chromium.launch();
  const devActorRequests = [];
  try {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text().slice(0, 200)}`);
    });
    page.on('request', (r) => {
      if (r.url().includes('/dev/actors')) devActorRequests.push(r.url());
    });

    await page.goto(`${BASE}/login`);
    await page.locator('#password').waitFor({ timeout: 120000 });

    await check('J1 /login sin shell: un solo main#contenido con el h1 «Iniciar sesión»', async () => {
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('main#contenido')).toHaveCount(1);
      await expect(
        page.getByRole('main').getByRole('heading', { level: 1, name: 'Iniciar sesión', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Menú lateral', includeHidden: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Abrir menú', includeHidden: true })).toHaveCount(0);
      await expect(page.getByText('Accede con tu usuario o correo del portal.', { exact: true })).toBeVisible();
    });
    await page.screenshot({ path: path.join(out, 'J1-login-1440.png') });

    await check('J2 enviar vacío: los dos errores a la vez, con role=alert, aria-invalid, aria-describedby y foco al primero', async () => {
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      const idError = page.locator('#identifier-error');
      const pwError = page.locator('#password-error');
      await expect(idError).toHaveText('Ingresa tu usuario o correo.');
      await expect(pwError).toHaveText('Ingresa tu contraseña.');
      await expect(idError).toHaveAttribute('role', 'alert');
      await expect(pwError).toHaveAttribute('role', 'alert');
      await expect(page.locator('#identifier')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#identifier')).toHaveAttribute('aria-describedby', /identifier-error/);
      await expect(page.locator('#password')).toHaveAttribute('aria-describedby', /password-error/);
      await expect(page.locator('#identifier')).toBeFocused();
      await expect(page.getByRole('textbox', { name: 'Usuario o correo', exact: true })).toHaveCount(1);
      await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(1);
      await expect(page.locator('#identifier')).toHaveAttribute('autocomplete', 'username');
      await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
      if ((await page.locator('form').getAttribute('novalidate')) === null) throw new Error('sin noValidate');
    });
    await page.screenshot({ path: path.join(out, 'J2-login-errores-1440.png') });

    await check('J3 al escribir, el error de ese campo desaparece', async () => {
      await page.locator('#identifier').fill('x');
      await expect(page.locator('#identifier-error')).toHaveCount(0);
      await expect(page.locator('#identifier')).not.toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#password-error')).toBeVisible();
    });

    await check('J4 contraseña incorrecta: «Usuario o contraseña incorrectos.» en el FormError y valores conservados', async () => {
      await page.locator('#identifier').fill(IDENTIFIER);
      await page.locator('#password').fill('incorrecta-e2e');
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      const formError = page.locator('#login-error');
      await expect(formError).toHaveText('Usuario o contraseña incorrectos.');
      await expect(formError).toHaveAttribute('role', 'alert');
      await expect(page.locator('#identifier')).toHaveValue(IDENTIFIER);
      await expect(page.locator('#password')).toHaveValue('incorrecta-e2e');
      await expect(page).toHaveURL(`${BASE}/login`);
    });
    await page.screenshot({ path: path.join(out, 'J4-login-401-1440.png') });

    await check('J5 durante el envío: «Ingresando…», aria-busy, botón y campos deshabilitados; después /inicio', async () => {
      await page.route('**/auth/login', async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await page.locator('#password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      const busy = page.getByRole('button', { name: 'Ingresando…', exact: true });
      await expect(busy).toBeVisible();
      await expect(busy).toBeDisabled();
      await expect(busy).toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('#identifier')).toBeDisabled();
      await expect(page.locator('#password')).toBeDisabled();
      await page.screenshot({ path: path.join(out, 'J5-login-enviando-1440.png') });
      await page.waitForURL(`${BASE}/inicio`, { timeout: 60000 });
      await page.unroute('**/auth/login');
    });

    await check('J6 1440: bloque «Usuario autenticado» con nombre e identificador y un solo «Cerrar sesión»; sin selector dev', async () => {
      const group = page.getByRole('group', { name: 'Usuario autenticado', exact: true });
      await expect(group).toBeVisible({ timeout: 60000 });
      await expect(group).toContainText('Ana Jefa');
      await expect(group).toContainText(IDENTIFIER);
      await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toHaveCount(1);
      await expect(page.getByRole('combobox', { name: 'Usuario actual (dev)' })).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toBeVisible();
    });
    await page.screenshot({ path: path.join(out, 'J6-inicio-jwt-1440.png') });

    await check('J7 1100 (riel): nombre e identificador siguen en el árbol, un solo «Cerrar sesión» (icono) con tooltip', async () => {
      await page.setViewportSize({ width: 1100, height: 800 });
      const group = page.getByRole('group', { name: 'Usuario autenticado', exact: true });
      await expect(group).toContainText('Ana Jefa');
      await expect(group).toContainText(IDENTIFIER);
      const name = group.getByText('Ana Jefa', { exact: true });
      const box = await name.boundingBox();
      if (!box || box.width > 1) throw new Error(`el nombre no es sr-only en riel: ${JSON.stringify(box)}`);
      const logout = page.getByRole('button', { name: 'Cerrar sesión', exact: true });
      await expect(logout).toHaveCount(1);
      await logout.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tooltip', { name: 'Cerrar sesión', exact: true })).toBeVisible();
      if (await logout.getAttribute('aria-describedby')) throw new Error('el tooltip describe el botón');
      const title = await group.locator('[title]').first().getAttribute('title');
      return { avatarTitle: title };
    });
    await page.screenshot({ path: path.join(out, 'J7-inicio-jwt-riel-1100.png') });

    await check('J8 pantalla de carga del guard: marca, spinner y «Cargando tu sesión…» en role=status', async () => {
      await page.route('**/me/permissions', async (route) => {
        await new Promise((r) => setTimeout(r, 2500));
        await route.continue();
      });
      await page.reload();
      const status = page.getByRole('status').filter({ hasText: 'Cargando tu sesión…' });
      await expect(status).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(0);
      const spinner = await status.locator('svg').getAttribute('class');
      if (!spinner || !spinner.includes('motion-reduce:animate-none')) throw new Error(`spinner: ${spinner}`);
      await page.screenshot({ path: path.join(out, 'J8-guard-cargando-1100.png') });
      await page.unroute('**/me/permissions');
      await expect(page.getByRole('group', { name: 'Usuario autenticado', exact: true })).toBeVisible({ timeout: 60000 });
    });

    await check('J9 390: el cajón tiene el bloque de usuario y «Cerrar sesión»; sin ids duplicados', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Menú principal', exact: true });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('group', { name: 'Usuario autenticado', exact: true })).toContainText('Ana Jefa');
      await expect(drawer.getByRole('button', { name: 'Cerrar sesión', exact: true })).toHaveCount(1);
      const dups = await page.evaluate(() => {
        const seen = new Map();
        for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
        return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
      });
      if (dups.length) throw new Error(`ids duplicados: ${dups.join(', ')}`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, 'J9-cajon-jwt-390.png') });
      await page.keyboard.press('Escape');
    });

    await check('J10 «Cerrar sesión» desde el riel: /login sin next y sin token', async () => {
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.goto(`${BASE}/demanda/solicitudes`);
      await expect(page.getByRole('group', { name: 'Usuario autenticado', exact: true })).toBeVisible({ timeout: 60000 });
      await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page).toHaveURL(`${BASE}/login`);
      const token = await page.evaluate(() => window.localStorage.getItem('authToken'));
      if (token !== null) throw new Error('el token sigue guardado');
    });

    await check('J11 en jwt no se llama a /dev/actors y no hay errores ni avisos de consola', async () => {
      if (devActorRequests.length) throw new Error(`/dev/actors: ${devActorRequests.length} peticiones`);
      // Se excluye el 401 provocado a propósito en J4.
      const unexpected = consoleErrors.filter((e) => !/status of 401/.test(e));
      if (unexpected.length) throw new Error(unexpected.join(' || '));
      return { erroresProvocados: consoleErrors.length - unexpected.length };
    });
    await context.close();
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
