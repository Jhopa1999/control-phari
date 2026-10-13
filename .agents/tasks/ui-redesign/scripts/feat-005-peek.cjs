// Capturas exploratorias del shell (artefacto de FEAT-005, no se commitea).
// Uso: node feat-005-peek.cjs <carpeta>
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const out = path.resolve(process.argv[2] || 'peek');
fs.mkdirSync(out, { recursive: true });

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, { timeout: 20000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });

  for (const vp of [{ width: 1440, height: 900 }, { width: 1100, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    await page.goto(`${BASE}/inicio`);
    await settle(page);
    await page.screenshot({ path: path.join(out, `inicio--${vp.width}.png`) });
  }
  // Cajón abierto a 390.
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menú principal' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'drawer--390.png') });
  await page.keyboard.press('Escape');

  // Riel con tooltip por teclado a 1100.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${BASE}/demanda/solicitudes`);
  await settle(page);
  await page.keyboard.press('Tab'); // skip link
  await page.screenshot({ path: path.join(out, 'skip-link--1100.png') });
  const skip = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { text: el.textContent, position: cs.position, padding: cs.padding, top: cs.top, left: cs.left, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
  });
  console.log('skip-link', JSON.stringify(skip));
  await page.keyboard.press('Tab'); // brand
  await page.keyboard.press('Tab'); // first item
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'rail-tooltip--1100.png') });

  // 1440 expandido con la página de Solicitudes.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/demanda/solicitudes`);
  await settle(page);
  await page.screenshot({ path: path.join(out, 'solicitudes--1440.png') });

  // 404 y login (dev-header) a 1440 y 390.
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    for (const r of ['/ruta-inexistente', '/login']) {
      await page.goto(`${BASE}${r}`);
      await settle(page);
      await page.screenshot({ path: path.join(out, `${r.slice(1)}--${vp.width}.png`), fullPage: true });
    }
  }

  const names = await page.evaluate(() => null);
  void names;
  console.log('console:', JSON.stringify(errors.slice(0, 10)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
