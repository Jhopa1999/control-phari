// Sonda temporal (artefacto): qué recurso da el 404 que Chrome registra en /ruta-inexistente.
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
  const page = await context.newPage();
  const notFound = [];
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.request().resourceType()} ${r.url()}`); });
  const console404 = [];
  page.on('console', (m) => { if (m.type() === 'error') console404.push(`${m.text()} @ ${JSON.stringify(m.location())}`); });
  await page.goto('http://localhost:3300/ruta-inexistente');
  await page.waitForLoadState('networkidle');
  console.log('responses>=400:', JSON.stringify(notFound));
  console.log('console:', JSON.stringify(console404));
  // Control: una ruta existente no registra ningún error.
  notFound.length = 0; console404.length = 0;
  await page.goto('http://localhost:3300/inicio');
  await page.waitForLoadState('networkidle');
  console.log('control /inicio responses>=400:', JSON.stringify(notFound), 'console:', JSON.stringify(console404));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
