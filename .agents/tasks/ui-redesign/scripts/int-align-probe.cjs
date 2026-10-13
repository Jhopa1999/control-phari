// Sonda temporal (artefacto, no se commitea): alineación vertical de acciones (F-5).
// Uso: node int-align-probe.cjs <ruta> [actor]
// Mide, en la primera fila de tabla con RowActionsCell, el centro vertical del
// texto de la primera celda frente al del botón; y en cada pendiente de
// RequirementsPanel, la primera línea del texto frente al botón.
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3300';
(async () => {
  const [route, actor = 'jefe@demo.local'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 } });
  await context.addInitScript((id) => window.localStorage.setItem('actorId', id), actor);
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.locator('h1').first().waitFor({ timeout: 120000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => {
    const textBox = (el) => {
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.trim()) {
          range.selectNodeContents(node);
          const rects = range.getClientRects();
          if (rects.length) return rects[0];
        }
      }
      return null;
    };
    const rows = [];
    for (const tr of Array.from(document.querySelectorAll('tbody tr')).slice(0, 3)) {
      const cells = tr.querySelectorAll('td');
      const last = cells[cells.length - 1];
      const btn = last && last.querySelector('button, a');
      const t = cells[0] && textBox(cells[0]);
      if (!btn || !t) continue;
      const b = btn.getBoundingClientRect();
      rows.push({
        textCenter: +(t.top + t.height / 2).toFixed(1),
        buttonCenter: +(b.top + b.height / 2).toFixed(1),
        delta: +((b.top + b.height / 2) - (t.top + t.height / 2)).toFixed(1),
      });
    }
    const reqs = [];
    for (const li of document.querySelectorAll('li')) {
      const btn = li.querySelector(':scope > div:last-child button, :scope > div:last-child a');
      const label = li.querySelector(':scope > div:first-child .text-sm');
      if (!btn || !label) continue;
      const t = textBox(label);
      if (!t) continue;
      const b = btn.getBoundingClientRect();
      reqs.push({
        firstLineCenter: +(t.top + t.height / 2).toFixed(1),
        buttonCenter: +(b.top + b.height / 2).toFixed(1),
        delta: +((b.top + b.height / 2) - (t.top + t.height / 2)).toFixed(1),
      });
    }
    return { rows, reqs: reqs.slice(0, 5) };
  });
  console.log(JSON.stringify(result));
  await browser.close();
})();
