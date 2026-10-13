// Sonda temporal (artefacto, no se commitea): texto completo de los errores de
// hidratación por ruta, con y sin timezoneId.
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3300';
(async () => {
  const browser = await chromium.launch();
  const routes = process.argv.slice(2);
  for (const tz of [undefined, 'America/Bogota']) {
    for (const route of routes) {
      const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 }, ...(tz ? { timezoneId: tz } : {}) });
      await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.locator('h1').first().waitFor({ timeout: 120000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(800);
      console.log(`=== tz=${tz || 'sistema'} ${route}: ${errors.length} errores`);
      for (const e of errors) console.log(e.slice(0, 3000));
      await context.close();
    }
  }
  await browser.close();
})();
