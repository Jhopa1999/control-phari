// Capturas y comprobaciones por rol y tamaño (artefacto de la tarea ui-redesign,
// no se commitea). Basado en capture-baseline.cjs.
//
// Uso:
//   node capture-check.cjs --out <carpeta> --routes /a,/b?x=1
//     [--roles jefe,integrante,lider,lideria]          (por defecto: jefe)
//     [--viewports 1440x900,1280x800,768x1024,390x844] (por defecto: los cuatro)
//     [--base http://localhost:3300]                   (por defecto: 3300)
//     [--auth dev-header|jwt]                          (por defecto: dev-header)
//
// dev-header: fija localStorage.actorId con addInitScript antes de cargar la app.
// jwt: inicia sesión por /login con la contraseña de E2E_JWT_PASSWORD; las rutas
// /login se capturan en un contexto sin sesión.
//
// Por captura (fullPage en <out>\<rol>\<slug>--<W>x<H>.png) espera networkidle y
// a que no queden .animate-pulse, y registra en <out>\manifest.json:
//   overflowX     document.documentElement.scrollWidth > innerWidth + 1 = fallo
//   consoleErrors número y primeros textos (console.error y errores de página)
//   h1Count       h1 renderizados; debe ser 1
//   focusVisible  tras 1 a 3 pulsaciones de Tab, el activeElement tiene
//                 outline-style distinto de none y outline-width > 0, o
//                 box-shadow distinto de none
// Termina con código 1 si algún check falla. No crea ni modifica datos.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const ROLE_ACTORS = {
  jefe: 'jefe@demo.local',
  integrante: 'integrante.bi@demo.local',
  lider: 'lider.bi@demo.local',
  lideria: 'lider.ia@demo.local',
};
const DEFAULT_VIEWPORTS = '1440x900,1280x800,768x1024,390x844';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`Argumento inesperado: ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Falta el valor de ${key}`);
    }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function list(value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function slug(route) {
  return route.replace(/^\//, '').replace(/[/?=&#]+/g, '-').replace(/-+$/, '') || 'root';
}

async function settle(page) {
  const notes = [];
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch {
    notes.push('networkidle no se alcanzó en 30 s');
  }
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.animate-pulse').length === 0,
      null,
      { timeout: 20000 },
    );
  } catch {
    notes.push('quedan .animate-pulse tras 20 s');
  }
  await page.waitForTimeout(400);
  return notes;
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const visible = (el) =>
      typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.getClientRects().length > 0;
    const h1s = Array.from(document.querySelectorAll('h1')).filter(visible);
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      h1Count: h1s.length,
      h1Texts: h1s.map((h) => (h.textContent || '').trim().slice(0, 120)),
    };
  });
}

async function focusState(page) {
  return page.evaluate(() => {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body || el === document.documentElement) {
      return { ok: false, element: el ? el.tagName.toLowerCase() : null };
    }
    const cs = getComputedStyle(el);
    const outlineWidth = parseFloat(cs.outlineWidth) || 0;
    const outline = cs.outlineStyle !== 'none' && outlineWidth > 0;
    const shadow = cs.boxShadow !== 'none';
    const label =
      el.getAttribute('aria-label') || (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    return {
      ok: outline || shadow,
      element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${label ? ` «${label}»` : ''}`,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow,
    };
  });
}

async function checkFocus(page) {
  // Punto de partida estable: sin foco previo, el primer Tab va al principio.
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  });
  let last = null;
  for (let tabs = 1; tabs <= 3; tabs += 1) {
    await page.keyboard.press('Tab');
    last = { ...(await focusState(page)), tabs };
    if (last.ok) return last;
  }
  return last;
}

async function signInJwt(page, base, identifier, password) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  // En jwt el SSR solo trae «Cargando tu sesión…»: esperar al formulario.
  await page.locator('#password').waitFor({ timeout: 120000 });
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  // Desde FEAT-005, /login tiene su propio main + h1: primero hay que salir de
  // /login (el inicio de sesión terminó) y después esperar el h1 de destino.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120000 });
  await page.getByRole('main').getByRole('heading', { level: 1 }).first().waitFor({ timeout: 120000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function captureRoute({ page, base, route, file, auth, consoleErrors }) {
  consoleErrors.length = 0;
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  if (auth === 'jwt') {
    // Igual que en jwt-session.spec.ts: primero el contenido (h1 o formulario).
    await page
      .locator('h1, #password')
      .first()
      .waitFor({ timeout: 120000 })
      .catch(() => undefined);
  }
  const notes = await settle(page);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  const m = await measure(page);
  const focus = await checkFocus(page);
  const overflowFail = m.scrollWidth > m.innerWidth + 1;
  const failures = [];
  if (overflowFail) failures.push('overflowX');
  if (consoleErrors.length > 0) failures.push('consoleErrors');
  if (m.h1Count !== 1) failures.push('h1Count');
  if (!focus || !focus.ok) failures.push('focusVisible');
  return {
    url: page.url(),
    overflowX: { scrollWidth: m.scrollWidth, innerWidth: m.innerWidth, fail: overflowFail },
    consoleErrors: { count: consoleErrors.length, first: consoleErrors.slice(0, 3) },
    h1Count: m.h1Count,
    h1Texts: m.h1Texts,
    focusVisible: focus,
    notes,
    failures,
    ok: failures.length === 0,
  };
}

function watchConsole(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => sink.push(`pageerror: ${String(err && err.message ? err.message : err).slice(0, 300)}`));
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out || !args.routes) {
    console.error('Uso: node capture-check.cjs --out <carpeta> --routes /a,/b [--roles ...] [--viewports ...] [--base ...] [--auth dev-header|jwt]');
    process.exit(2);
  }
  const out = path.resolve(args.out);
  const routes = list(args.routes);
  const roles = list(args.roles || 'jefe');
  const viewports = list(args.viewports || DEFAULT_VIEWPORTS).map((v) => {
    const match = /^(\d+)x(\d+)$/.exec(v);
    if (!match) throw new Error(`Viewport inválido: ${v}`);
    return { width: Number(match[1]), height: Number(match[2]) };
  });
  const base = (args.base || 'http://localhost:3300').replace(/\/$/, '');
  const auth = args.auth || 'dev-header';
  if (auth !== 'dev-header' && auth !== 'jwt') throw new Error(`--auth inválido: ${auth}`);
  for (const role of roles) {
    if (!ROLE_ACTORS[role]) throw new Error(`Rol desconocido: ${role}`);
  }
  const password = process.env.E2E_JWT_PASSWORD;
  if (auth === 'jwt' && !password) {
    console.error('Falta E2E_JWT_PASSWORD para --auth jwt');
    process.exit(2);
  }

  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const role of roles) {
      const actor = ROLE_ACTORS[role];
      const context = await browser.newContext({ locale: 'es-ES', viewport: viewports[0] });
      if (auth === 'dev-header') {
        await context.addInitScript((id) => {
          window.localStorage.setItem('actorId', id);
        }, actor);
      }
      const page = await context.newPage();
      const consoleErrors = [];
      watchConsole(page, consoleErrors);
      if (auth === 'jwt') await signInJwt(page, base, actor, password);

      for (const vp of viewports) {
        await page.setViewportSize(vp);
        for (const route of routes) {
          const tag = `${vp.width}x${vp.height}`;
          const file = path.join(out, role, `${slug(route)}--${tag}.png`);
          const entry = { role, actor, viewport: tag, route, file: path.relative(out, file) };
          let anon = null;
          try {
            if (auth === 'jwt' && route.startsWith('/login')) {
              // /login se ve sin sesión: con sesión, el guard lleva a /inicio.
              anon = await browser.newContext({ locale: 'es-ES', viewport: vp });
              const anonPage = await anon.newPage();
              const anonErrors = [];
              watchConsole(anonPage, anonErrors);
              Object.assign(entry, await captureRoute({ page: anonPage, base, route, file, auth, consoleErrors: anonErrors }));
              entry.session = 'sin sesión';
            } else {
              Object.assign(entry, await captureRoute({ page, base, route, file, auth, consoleErrors }));
            }
          } catch (err) {
            entry.error = String(err && err.message ? err.message : err);
            entry.failures = ['error'];
            entry.ok = false;
          } finally {
            if (anon) await anon.close();
          }
          results.push(entry);
          console.log(
            `${entry.ok ? 'ok  ' : 'FAIL'} ${role} ${tag} ${route}` +
              (entry.ok ? '' : ` -> ${entry.failures.join(', ')}${entry.error ? `: ${entry.error}` : ''}`),
          );
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  const byCheck = {};
  for (const r of failed) for (const f of r.failures) byCheck[f] = (byCheck[f] || 0) + 1;
  const manifest = {
    generatedAt: new Date().toISOString(),
    base,
    auth,
    roles,
    viewports: viewports.map((v) => `${v.width}x${v.height}`),
    routes,
    total: results.length,
    failed: failed.length,
    failuresByCheck: byCheck,
    results,
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`total=${results.length} failed=${failed.length} ${JSON.stringify(byCheck)} out=${out}`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
