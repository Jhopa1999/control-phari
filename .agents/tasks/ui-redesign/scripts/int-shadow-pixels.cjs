// Sonda temporal (artefacto, no se commitea): mide los píxeles del borde
// inferior y superior del menú lateral (F-3) arriba y al final del scroll.
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3300';
async function sample(page, png, points) {
  const b64 = png.toString('base64');
  return page.evaluate(
    async ({ b64, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)));
    },
    { b64, points },
  );
}
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [w, h] of [[1100, 800], [1440, 1400]]) {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: w, height: h } });
    await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
    const page = await context.newPage();
    await page.goto(`${BASE}/inicio`, { waitUntil: 'networkidle', timeout: 180000 });
    const nav = page.locator('nav[aria-label="Navegación principal"]').first();
    const box = await nav.boundingBox();
    // Columna sin iconos: 4 px desde el borde izquierdo del nav.
    const x = Math.round(box.x + 4);
    const pts = [
      [x, Math.round(box.y + 1)],
      [x, Math.round(box.y + box.height / 2)],
      [x, Math.round(box.y + box.height - 2)],
    ];
    const blank = await browser.newPage();
    const atTop = await sample(blank, await page.screenshot(), pts);
    await nav.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(200);
    const atBottom = await sample(blank, await page.screenshot(), pts);
    out[`${w}x${h}`] = { 'arriba [borde-sup, medio, borde-inf]': atTop, 'final [borde-sup, medio, borde-inf]': atBottom };
    await blank.close();
    await context.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
