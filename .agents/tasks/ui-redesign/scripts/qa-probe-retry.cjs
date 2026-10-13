// Sonda: qué alertas quedan tras «Reintentar» cuando la API vuelve. Simula la
// caída abortando las peticiones a la API (solo lectura).
'use strict';
const { chromium } = require('@playwright/test');
const API = 'http://localhost:3301';
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  await context.addInitScript(() => localStorage.setItem('actorId', 'jefe@demo.local'));
  const page = await context.newPage();
  const down = (url) => url.origin === API;
  await page.route(down, (r) => r.abort('connectionrefused'));
  await page.goto('http://localhost:3300/inicio');
  await page.getByRole('main').getByRole('alert').first().waitFor();
  const alerts = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="alert"]'))
        .filter((a) => a.checkVisibility() && a.innerText.trim())
        .map((a) => `${a.closest('main') ? 'main' : a.closest('aside,nav,header') ? a.closest('aside,nav,header').tagName : 'otro'}: ${a.innerText.replace(/\s+/g, ' ')}`),
    );
  console.log('caída:', JSON.stringify(await alerts()));
  const buttons = await page.getByRole('button', { name: 'Reintentar' }).evaluateAll((els) =>
    els.map((e) => (e.closest('main') ? 'main' : e.closest('aside,nav,header')?.tagName ?? 'otro')),
  );
  console.log('botones Reintentar:', JSON.stringify(buttons));
  await page.unroute(down);
  const n = await page.getByRole('button', { name: 'Reintentar' }).count();
  for (let i = n - 1; i >= 0; i -= 1) await page.getByRole('button', { name: 'Reintentar' }).nth(i).click().catch(() => undefined);
  await page.waitForLoadState('networkidle');
  console.log('tras reintentar:', JSON.stringify(await alerts()));
  await browser.close();
})();
