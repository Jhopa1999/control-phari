// Sonda temporal (artefacto, no se commitea): F-2 (alto de /login dentro del
// shell) y F-3 (pista de scroll del menú lateral).
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3300';
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: w, height: h } });
    await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 180000 });
    out[`login-${w}`] = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    await context.close();
  }
  for (const [w, h] of [[1100, 800], [1440, 900], [1440, 1400]]) {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: w, height: h } });
    await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
    const page = await context.newPage();
    await page.goto(`${BASE}/inicio`, { waitUntil: 'networkidle', timeout: 180000 });
    const nav = page.locator('nav[aria-label="Navegación principal"]').first();
    const read = () =>
      nav.evaluate((el) => ({
        overflow: el.scrollHeight > el.clientHeight,
        scrollTop: el.scrollTop,
        bgImageLayers: (getComputedStyle(el).backgroundImage.match(/gradient\(/g) || []).length,
        bgAttachment: getComputedStyle(el).backgroundAttachment,
      }));
    const top = await read();
    await nav.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const bottom = await read();
    await page.screenshot({ path: `${__dirname}/../screenshots/INTEGRACION-1/sondas/nav-${w}x${h}-final.png` });
    out[`nav-${w}x${h}`] = { top, bottom };
    await context.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
