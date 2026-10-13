// Estados vacío, contenido extenso y error en el navegador (dev-header, jefe).
// Solo lectura: «vacío» y «extenso» sustituyen el CUERPO de algunos GET de la
// API real (la petición llega al backend, como en e2e/date-display.spec.ts);
// «error» necesita la API DETENIDA de verdad y espera a que vuelva para pulsar
// «Reintentar».
//
// Uso: node qa-states.cjs empty|long|error --out <carpeta>
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const args = process.argv.slice(2);
const mode = args[0];
const outIdx = args.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 ? args[outIdx + 1] : `screenshots/QA-FINAL/estados-${mode}`);
const BASE = process.env.WEB_URL || 'http://localhost:3300';
const API = process.env.API_URL || 'http://localhost:3301';
const ACTOR = process.env.ACTOR || 'jefe@demo.local';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const apiPath = (p) => (url) => url.origin === API && url.pathname === p;
// Nombre de archivo seguro en Windows: sin «/», «?» ni «=» (los query se marcan).
const slug = (route) => route.replace(/^\//, '').replace(/\?.*$/, (q) => `--${q.slice(1).replace(/[=&]/g, '-')}`).replace(/\//g, '-');
const EMPTY_CASES = [
  { route: '/demanda/solicitudes', paths: ['/requests'] },
  { route: '/gobierno/auditoria', paths: ['/audit-events'] },
  { route: '/mi-trabajo', paths: ['/my-work'] },
  { route: '/seguimiento/novedades', paths: ['/issues'] },
  { route: '/seguimiento/compromisos', paths: ['/commitments'] },
  { route: '/activos/catalogo', paths: ['/assets'] },
];
const LONG_WORD = `https://intranet.example.com/${'segmento-sin-espacios-'.repeat(12)}fin`;
const LONG_TITLE =
  'Título extenso de prueba (QA): consolidación del modelo semántico corporativo de clientes, productos, canales, regionales y periodos para unificar todos los indicadores comerciales de la compañía ' +
  LONG_WORD;
function lengthen(item) {
  const copy = { ...item };
  for (const key of ['title', 'name', 'description', 'expectedResult', 'requesterArea', 'functionalOwner', 'requestTitle', 'phaseName']) {
    if (typeof copy[key] === 'string') copy[key] = `${LONG_TITLE} · ${key}`;
  }
  if (typeof copy.referenceUrl === 'string') copy.referenceUrl = LONG_WORD;
  return copy;
}
const LONG_CASES = [
  { route: '/demanda/solicitudes', paths: ['/requests'] },
  { route: '/mi-trabajo', paths: ['/my-work'] },
  { route: '/seguimiento/novedades', paths: ['/issues'] },
  { route: '/activos/catalogo', paths: ['/assets'] },
  { route: '/inicio', paths: ['/requests'] },
];
// `/seguimiento/tareas` sin `taskId` muestra «Elige una tarea…» y NO pide datos,
// así que no puede entrar en estado de error (QA-2): se usa con un `taskId` real
// (tarea de la QA, plan de la solicitud A) para ejercitar «No fue posible cargar
// la tarea.» + «Reintentar».
const ERROR_TASK_ID = process.env.ERROR_TASK_ID || 'e9c32143-3ec8-4023-8544-d62fbc7e9f1c';
const ERROR_ROUTES = ['/inicio', '/demanda/solicitudes', `/seguimiento/tareas?taskId=${ERROR_TASK_ID}`, '/gobierno/auditoria', '/mi-trabajo', '/activos/capacidad'];
async function newPage(browser, vp) {
  const context = await browser.newContext({ locale: 'es-ES', viewport: vp });
  await context.addInitScript((id) => window.localStorage.setItem('actorId', id), ACTOR);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  return { context, page, errors };
}
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, { timeout: 20000 })
    .catch(() => undefined);
}
async function observe(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const visible = (el) => el.checkVisibility();
    return {
      h1: Array.from(document.querySelectorAll('main h1')).filter(visible).map((h) => h.textContent.trim()),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      alerts: Array.from(document.querySelectorAll('[role="alert"]')).filter(visible).map((a) => a.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
      // Alertas SOLO del contenido principal: el selector de usuario de desarrollo
      // (app-sidebar) tiene su propio «No fue posible cargar los usuarios.», que no
      // es parte de la vista y no debe contar como fallo de recuperación (QA-2).
      mainAlerts: main ? Array.from(main.querySelectorAll('[role="alert"]')).filter(visible).map((a) => a.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean) : [],
      rows: main ? main.querySelectorAll('tbody tr').length : 0,
      mainText: main ? main.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : '',
      // Elementos que desbordan su contenedor con texto recortado sin forma de leerlo.
      clipped: Array.from((main || document.body).querySelectorAll('*'))
        .filter((el) => {
          if (!visible(el) || el.children.length > 0) return false;
          const cs = getComputedStyle(el);
          return el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && el.getBoundingClientRect().right > window.innerWidth + 1;
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()} «${el.textContent.trim().slice(0, 60)}»`),
    };
  });
}
async function bodyCases(cases, transform) {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      for (const c of cases) {
        const { context, page, errors } = await newPage(browser, vp);
        for (const p of c.paths) {
          await page.route(apiPath(p), async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            const response = await route.fetch();
            const data = await response.json();
            await route.fulfill({ response, json: transform(Array.isArray(data) ? data : []) });
          });
        }
        await page.goto(`${BASE}${c.route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.locator('main h1').first().waitFor({ timeout: 120000 }).catch(() => undefined);
        await settle(page);
        const tag = `${vp.width}x${vp.height}`;
        const file = path.join(OUT, `${c.route.replace(/^\//, '').replace(/\//g, '-')}--${tag}.png`);
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: file, fullPage: true });
        const o = await observe(page);
        const failures = [];
        if (o.h1.length !== 1) failures.push('h1');
        if (o.overflowX > 1) failures.push('overflowX');
        if (o.alerts.some((a) => /No fue posible/.test(a))) failures.push('error-visible');
        if (errors.length) failures.push('consoleErrors');
        if (o.clipped.length) failures.push('clipped');
        results.push({ route: c.route, viewport: tag, file: path.relative(OUT, file), ...o, consoleErrors: errors, failures, ok: failures.length === 0 });
        console.log(`${failures.length ? 'FAIL' : 'ok  '} ${tag} ${c.route} ${failures.join(',')} | ${o.mainText.slice(0, 160)}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}
async function healthy() {
  try {
    const r = await fetch(`${API}/health`);
    return r.ok;
  } catch {
    return false;
  }
}
// Endpoint de datos de cada vista: se corta SOLO ese GET para forzar el estado
// de error. La autenticación (/dev/actors, /me/permissions) sigue viva, así el
// guard no rebota a /login y el error que se mide es el de la propia vista.
const ERROR_DATA = {
  '/inicio': [/\/area-control\/indicators/, /\/area-control\/demand-summary/],
  '/demanda/solicitudes': [/\/requests(\?|$)/],
  '/seguimiento/tareas': [/\/tasks\//],
  '/gobierno/auditoria': [/\/audit-events/],
  '/mi-trabajo': [/\/my-work/],
  '/activos/capacidad': [/\/capacity\//],
};

function routeKey(route) {
  return route.split('?')[0];
}

/** Instala el corte de los GET de datos de la ruta; devuelve un «desinstalar». */
async function cutData(page, route) {
  const patterns = ERROR_DATA[routeKey(route)] || [];
  const handler = async (r) => {
    const u = new URL(r.request().url());
    if (u.origin === API && r.request().method() === 'GET' && patterns.some((re) => re.test(u.pathname + u.search))) {
      return r.abort('failed');
    }
    return r.fallback();
  };
  await page.route(`${API}/**`, handler);
  return () => page.unroute(`${API}/**`, handler);
}

async function errorCase() {
  if (!(await healthy())) throw new Error('La API no responde: este modo necesita la API viva para la sesión; corta los datos por ruta.');
  const browser = await chromium.launch();
  const results = [];
  try {
    const vp = VIEWPORTS[0];
    const tabs = [];
    for (const route of ERROR_ROUTES) {
      const t = await newPage(browser, vp);
      // Datos de esa vista inalcanzables (como si el backend no respondiera).
      const restore = await cutData(t.page, route);
      await t.page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      const alert = t.page.getByRole('main').getByRole('alert').filter({ hasText: /No fue posible/ }).first();
      const ok = await alert.waitFor({ timeout: 60000 }).then(() => true, () => false);
      const text = ok ? (await alert.innerText()).replace(/\s+/g, ' ') : null;
      const retry = ok ? await alert.getByRole('button', { name: 'Reintentar' }).count() : 0;
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `${slug(route)}--caida.png`);
      await t.page.screenshot({ path: file, fullPage: true });
      const sidebarAlert = await t.page.locator('nav[aria-label="Navegación principal"] [role="alert"], aside [role="alert"]').allInnerTexts().catch(() => []);
      tabs.push({ route, ...t, alert, restore });
      results.push({ route, phase: 'datos caídos', errorVisible: ok, message: text, retryButtons: retry, sidebar: sidebarAlert.map((s) => s.replace(/\s+/g, ' ')), h1: (await observe(t.page)).h1 });
      console.log(`${ok && retry ? 'ok  ' : 'FAIL'} caída ${route}: ${text}`);
    }
    console.log('ESPERANDO_API');
    console.log('API_DISPONIBLE');
    for (const t of tabs) {
      // Se restablecen los datos (como si el backend volviera) y se reintenta.
      await t.restore();
      const buttons = t.page.getByRole('button', { name: 'Reintentar' });
      const n = await buttons.count();
      for (let i = n - 1; i >= 0; i -= 1) await buttons.nth(i).click().catch(() => undefined);
      await t.page.waitForFunction(() => !/No fue posible/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 60000 }).catch(() => undefined);
      await settle(t.page);
      const o = await observe(t.page);
      // Recuperación medida SOLO en el contenido principal (QA-2): el aviso del
      // selector de usuario de desarrollo del app-sidebar no cuenta.
      const recovered = !o.mainAlerts.some((a) => /No fue posible/.test(a)) && o.h1.length === 1;
      const file = path.join(OUT, `${slug(t.route)}--reintento.png`);
      await t.page.screenshot({ path: file, fullPage: true });
      results.push({ route: t.route, phase: 'tras Reintentar', recovered, retryClicked: n, h1: o.h1, rows: o.rows, mainText: o.mainText.slice(0, 200) });
      console.log(`${recovered ? 'ok  ' : 'FAIL'} reintento ${t.route} (${n} botón/es): ${o.mainText.slice(0, 120)}`);
      await t.context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}
(async () => {
  let results;
  if (mode === 'empty') results = await bodyCases(EMPTY_CASES, () => []);
  else if (mode === 'long') results = await bodyCases(LONG_CASES, (rows) => [...rows.slice(0, 3).map(lengthen), ...rows.slice(3)]);
  else if (mode === 'error') results = await errorCase();
  else throw new Error('Modo: empty | long | error');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ mode, at: new Date().toISOString(), results }, null, 2), 'utf8');
  const failed = results.filter((r) => r.ok === false || r.errorVisible === false || r.recovered === false || r.retryButtons === 0).length;
  console.log(`modo=${mode} total=${results.length} fallidos=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
