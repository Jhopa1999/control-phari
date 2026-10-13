// Estado de ERROR por ruta, reescrito sobre el harness de qa-flows (L.open), que
// conserva la sesión dev-header (QA-2). En vez de detener toda la API —lo que
// rompe la autenticación y rebota a /login—, se cortan SOLO los GET de datos de
// cada vista (como si el backend no respondiera para esa consulta); se verifica
// el mensaje «No fue posible cargar…» + «Reintentar», y luego se restablecen los
// datos y se reintenta para comprobar la recuperación. El aviso del selector de
// usuario de desarrollo (app-sidebar) NO cuenta: la medición es solo del `main`.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = require('./qa-flows-lib.cjs');

const OUT = path.resolve(__dirname, '..', 'screenshots', 'QA-FINAL', 'estados-error');
const API = L.API;

// Endpoint(s) de datos de cada vista; se cortan solo esos GET.
const CASES = [
  { route: '/inicio', patterns: [/\/area-control\/indicators/, /\/area-control\/demand-summary/] },
  { route: '/demanda/solicitudes', patterns: [/\/requests(\?|$)/] },
  { route: `/seguimiento/tareas?taskId=${process.env.ERROR_TASK_ID || 'e9c32143-3ec8-4023-8544-d62fbc7e9f1c'}`, patterns: [/\/tasks\//] },
  { route: '/gobierno/auditoria', patterns: [/\/audit-events/] },
  { route: '/mi-trabajo', patterns: [/\/my-work/] },
  { route: '/activos/capacidad', patterns: [/\/capacity\//] },
];

const slug = (route) => route.replace(/^\//, '').replace(/\?.*$/, (q) => `--${q.slice(1).replace(/[=&]/g, '-')}`).replace(/\//g, '-');

async function mainAlerts(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const vis = (el) => el.checkVisibility();
    return main
      ? Array.from(main.querySelectorAll('[role="alert"]')).filter(vis).map((a) => a.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [];
  });
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const results = [];
  for (const { route, patterns } of CASES) {
    const s = await L.open('jefe', 'estado-error');
    const { page } = s;
    let cut = true;
    // Corta solo los GET de datos de esta vista; deja pasar auth y el resto.
    await page.route(`${API}/**`, async (r) => {
      const u = new URL(r.request().url());
      if (cut && r.request().method() === 'GET' && patterns.some((re) => re.test(u.pathname + u.search))) {
        return r.abort('failed');
      }
      return r.fallback();
    });
    try {
      await page.goto(`${L.BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const alert = page.getByRole('main').getByRole('alert').filter({ hasText: /No fue posible/ }).first();
      const ok = await alert.waitFor({ timeout: 45000 }).then(() => true, () => false);
      const text = ok ? (await alert.innerText()).replace(/\s+/g, ' ') : null;
      const retry = ok ? await alert.getByRole('button', { name: 'Reintentar' }).count() : 0;
      await page.screenshot({ path: path.join(OUT, `${slug(route)}--caida.png`), fullPage: true });
      L.check(`caída ${route}: «No fue posible…» + «Reintentar»`, ok && retry > 0, text);
      results.push({ route, phase: 'datos caídos', errorVisible: ok, message: text, retryButtons: retry });

      // Recuperación: se restablecen los datos y se reintenta.
      cut = false;
      const buttons = page.getByRole('button', { name: 'Reintentar' });
      const n = await buttons.count();
      for (let i = n - 1; i >= 0; i -= 1) await buttons.nth(i).click().catch(() => undefined);
      await page.waitForFunction(() => !/No fue posible/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 45000 }).catch(() => undefined);
      await L.settle(page);
      const alerts = await mainAlerts(page);
      const h1 = await page.locator('main h1').allInnerTexts();
      const recovered = !alerts.some((a) => /No fue posible/.test(a)) && h1.length === 1;
      await page.screenshot({ path: path.join(OUT, `${slug(route)}--reintento.png`), fullPage: true });
      L.check(`recuperación ${route}: el contenido vuelve tras «Reintentar»`, recovered, h1.join(','));
      results.push({ route, phase: 'tras Reintentar', recovered, h1 });
    } catch (err) {
      L.check(`error ${route}`, false, String(err && err.message ? err.message : err).split('\n')[0]);
    } finally {
      await s.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ mode: 'error', at: new Date().toISOString(), results }, null, 2), 'utf8');
  await L.closeBrowser();
  const failed = L.summary();
  process.exitCode = failed ? 1 : 0;
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
