// Pantallas de error de FEAT-005 (artefacto, no se commitea). Requiere la página
// temporal /qa-feat-005 y el QaGlobalThrower temporal del layout.
// Uso: node feat-005-errors-check.cjs <carpeta>
const path = require('node:path');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const out = path.resolve(process.argv[2] || 'errors-check');
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

async function newPage(browser, viewport, flag) {
  const context = await browser.newContext({ locale: 'es-ES', viewport });
  // El indicador se fija una sola vez por pestaña: así «Reintentar» puede recuperar.
  await context.addInitScript((key) => {
    window.localStorage.setItem('actorId', 'jefe@demo.local');
    if (key && !window.sessionStorage.getItem(`${key}-armado`)) {
      window.sessionStorage.setItem(`${key}-armado`, '1');
      window.sessionStorage.setItem(key, '1');
    }
  }, flag);
  const page = await context.newPage();
  return { context, page };
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const tag = `${viewport.width}x${viewport.height}`;
      const { context, page } = await newPage(browser, viewport, 'qaBoom');
      await check(`error.tsx ${tag}: pantalla dentro del shell, en español, y «Reintentar» recupera`, async () => {
        await page.goto(`${BASE}/qa-feat-005`);
        const main = page.getByRole('main');
        await expect(main.getByRole('heading', { level: 1, name: 'No fue posible mostrar esta pantalla', exact: true })).toBeVisible({ timeout: 60000 });
        const alert = main.getByRole('alert');
        await expect(alert).toContainText('Ocurrió un error inesperado.');
        await expect(alert).toContainText('Inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.');
        await expect(alert).not.toContainText('Error simulado');
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        if (viewport.width >= 1024) await expect(page.getByRole('complementary', { name: 'Menú lateral', exact: true })).toBeVisible();
        else await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(out, `error-tsx--${tag}.png`), fullPage: true });
        await page.evaluate(() => window.sessionStorage.removeItem('qaBoom'));
        await alert.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await expect(main.getByRole('heading', { level: 1, name: 'QA FEAT-005', exact: true })).toBeVisible();
        return 'recuperado';
      });
      await context.close();
    }
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const tag = `${viewport.width}x${viewport.height}`;
      const { context, page } = await newPage(browser, viewport, 'qaGlobalBoom');
      await check(`global-error.tsx ${tag}: documento propio en español y «Reintentar» recupera`, async () => {
        await page.goto(`${BASE}/inicio`);
        await expect(page.getByRole('heading', { level: 1, name: 'No fue posible cargar el portal.', exact: true })).toBeVisible({ timeout: 60000 });
        await expect(page.getByText('Recarga la página. Si el problema continúa, contacta al administrador del portal.', { exact: true })).toBeVisible();
        await expect(page).toHaveTitle('Error · Portal del área');
        const lang = await page.evaluate(() => document.documentElement.lang);
        if (lang !== 'es') throw new Error(`lang=${lang}`);
        // innerText no incluye el shadow DOM del indicador de errores de next dev.
        const leaks = await page.evaluate(() => document.body.innerText.includes('Error simulado'));
        if (leaks) throw new Error('la pantalla muestra error.message');
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        // Cierra el overlay de next dev (solo existe en desarrollo) para ver la pantalla real.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(out, `global-error--${tag}.png`), fullPage: true });
        await page.evaluate(() => window.sessionStorage.removeItem('qaGlobalBoom'));
        // En next dev, el overlay de errores (<nextjs-portal>) tapa la página y
        // absorbe el puntero; en producción no existe. Se activa con teclado.
        const retryButton = page.getByRole('button', { name: 'Reintentar', exact: true });
        await retryButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('main').getByRole('heading', { level: 1 })).not.toHaveText('No fue posible cargar el portal.', { timeout: 30000 });
        // El shell vuelve: menú lateral en escritorio, «Abrir menú» en móvil.
        if (viewport.width >= 1024) {
          await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toBeVisible();
        } else {
          await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeVisible();
        }
        return { lang, bodyBackground: bg };
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
