// Sonda temporal (artefacto, no se commitea): elementos que sobresalen del viewport.
// Uso: node feat-004-overflow-probe.cjs <ruta> <ancho>x<alto> [actor]
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3300';
(async () => {
  const [route, size, actor = 'jefe@demo.local'] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'es-ES', viewport: { width, height } });
  await context.addInitScript((id) => window.localStorage.setItem('actorId', id), actor);
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.locator('h1').first().waitFor({ timeout: 120000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1) {
        // Solo los más profundos que no están dentro de un contenedor con scroll.
        let p = el.parentElement;
        let clipped = false;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
            const pr = p.getBoundingClientRect();
            if (pr.right <= vw + 1) { clipped = true; break; }
          }
          p = p.parentElement;
        }
        if (clipped) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').slice(0, 120),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, out: out.slice(-25) };
  });
  console.log(JSON.stringify(result, null, 1));
  await browser.close();
})();
