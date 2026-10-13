// Sonda temporal (artefacto, no se commitea): alto y clases de /login sin sesión.
const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:3300/login', { waitUntil: 'networkidle' });
    await p.locator('h1').waitFor();
    const r = await p.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      rootClass: document.querySelector('main#contenido > div').className,
      shell: !!document.querySelector('nav[aria-label="Navegación principal"]'),
    }));
    console.log(w, JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
