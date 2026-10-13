// Captura baseline de las 26 rutas del portal (modo dev-header, actor jefe).
// Uso: node capture-baseline.cjs [outDir]
// Requiere web en http://localhost:3300 y API en http://localhost:3301.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.WEB_URL || 'http://localhost:3300';
const ACTOR = process.env.ACTOR_ID || 'jefe@demo.local';
const OUT = path.resolve(
  process.argv[2] || path.join(__dirname, '..', 'screenshots', 'baseline'),
);

const ROUTES = [
  '/activos/capacidad',
  '/activos/catalogo',
  '/activos/documentos',
  '/administracion/frameworks',
  '/administracion/maestras',
  '/administracion/revision',
  '/catalogs',
  '/demanda/priorizacion',
  '/demanda/resumen',
  '/demanda/solicitudes',
  '/demanda/triage',
  '/gobierno/auditoria',
  '/gobierno/equipo',
  '/gobierno/mis-permisos',
  '/inicio',
  '/login',
  '/mi-trabajo',
  '/seguimiento/bitacora',
  '/seguimiento/compromisos',
  '/seguimiento/novedades',
  '/seguimiento/plan',
  '/seguimiento/portafolio',
  '/seguimiento/proyectos',
  '/seguimiento/reuniones',
  '/seguimiento/semanal',
  '/seguimiento/tareas',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

function slug(route) {
  return route.replace(/^\//, '').replace(/\//g, '-') || 'root';
}

async function settle(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch {
    // Continua aunque haya polling o conexiones abiertas (HMR).
  }
  // Espera a que desaparezcan los skeletons (animate-pulse) de la carga.
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.animate-pulse').length === 0,
      null,
      { timeout: 20000 },
    );
  } catch {
    // Se captura igual; queda registrado en el log.
    console.warn(`  ! skeletons aun visibles en ${page.url()}`);
  }
  await page.waitForTimeout(400);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'es-ES',
      });
      // Selecciona el actor dev antes de que cargue la app.
      await context.addInitScript((actor) => {
        window.localStorage.setItem('actorId', actor);
      }, ACTOR);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      for (const route of ROUTES) {
        consoleErrors.length = 0;
        const file = path.join(OUT, `${slug(route)}--${vp.name}.png`);
        try {
          await page.goto(`${BASE}${route}`, {
            waitUntil: 'domcontentloaded',
            timeout: 180000,
          });
          await settle(page);
          // Verifica que el selector dev muestre al actor esperado.
          const actorTrigger = page.getByLabel('Usuario actual');
          const actorText = (await actorTrigger.count())
            ? (await actorTrigger.first().innerText()).trim()
            : '(sin selector)';
          await page.screenshot({ path: file, fullPage: true });
          results.push({
            route,
            viewport: vp.name,
            file: path.basename(file),
            actor: actorText,
            consoleErrors: consoleErrors.length,
          });
          console.log(
            `ok ${vp.name} ${route} actor="${actorText}" consoleErrors=${consoleErrors.length}`,
          );
        } catch (err) {
          results.push({
            route,
            viewport: vp.name,
            error: String(err && err.message ? err.message : err),
          });
          console.error(`FAIL ${vp.name} ${route}: ${err && err.message}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(results, null, 2),
  );
  const failed = results.filter((r) => r.error).length;
  console.log(`total=${results.length} failed=${failed} out=${OUT}`);
  process.exit(failed > 0 ? 1 : 0);
})();
