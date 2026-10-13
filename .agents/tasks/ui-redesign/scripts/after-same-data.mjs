// Capturas "DESPUÉS" de la UI renovada con los mismos datos, los mismos nombres
// de archivo y la misma sesión (jwt, jefe@demo.local) que before-same-data.mjs.
// Solo lectura: inicia sesión por /login y navega; no envía formularios de
// negocio ni modifica datos.
//
// Diferencias con before-same-data.mjs, impuestas por la UI renovada:
// - Las rutas protegidas se abren con page.goto dentro de la misma sesión: el
//   rediseño corrigió la recarga en jwt (design §8.7), y a 390 px el menú vive
//   en un cajón cerrado.
// - Incluye las parejas "-seleccion" (triage y priorización con una solicitud
//   elegida) y seguimiento-tareas-detalle, para igualar before-same-data (QA-4).
//
// Uso: node after-same-data.mjs
// Requiere la web en WEB_URL (3300) y la API en API_URL (3301), las dos en jwt.
// Salida: ../screenshots/after/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WEB_URL ?? 'http://localhost:3300';
const API = process.env.API_URL ?? 'http://localhost:3301';
// Contraseña de desarrollo documentada en apps/api/prisma/seed.ts (solo dev).
const PASSWORD = process.env.DEMO_PASSWORD ?? 'dev1234';
const OUT = path.resolve(HERE, '..', 'screenshots', 'after');
const CAPACITY_MONTH = '2026-10';
const JEFE = 'jefe@demo.local';
const INTEGRANTE = 'integrante.bi@demo.local';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
// Mismo orden de preferencia que before-same-data.mjs.
const APPROVED_WITH_PLAN = [
  /Tablero ejecutivo de ventas y margen por canal/i,
  /Integraci[oó]n de pedidos del ERP/i,
  /API de consulta de saldos/i,
  /asistente de consulta de pol[ií]ticas/i,
];
const GUARD_TEXT = /Cargando tu sesi[oó]n|Redirigiendo/;
const results = [];
const log = (...args) => console.log(...args);
const slug = (route) => route.replace(/^\//, '').replace(/\//g, '-') || 'root';
function track(page) {
  const state = { inflight: new Set(), lastActivity: Date.now(), consoleErrors: [], failedResponses: [] };
  const ignored = (url) => /webpack-hmr|__nextjs|_next\/static\/development|turbopack/.test(url);
  page.on('request', (req) => {
    if (ignored(req.url())) return;
    state.inflight.add(req);
    state.lastActivity = Date.now();
  });
  const done = (req) => {
    state.inflight.delete(req);
    state.lastActivity = Date.now();
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  page.on('console', (msg) => {
    if (msg.type() === 'error') state.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => state.consoleErrors.push(`pageerror: ${String(err?.message ?? err).slice(0, 300)}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith(API)) {
      state.failedResponses.push(`${res.status()} ${res.request().method()} ${res.url().slice(API.length)}`);
    }
  });
  state.reset = () => {
    state.consoleErrors = [];
    state.failedResponses = [];
  };
  return state;
}
async function waitForNetworkQuiet(page, tracker, { idleMs = 700, timeout = 60000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (tracker.inflight.size === 0 && Date.now() - tracker.lastActivity >= idleMs) return true;
    await page.waitForTimeout(100);
  }
  console.warn(`  ! red no quedó inactiva (${tracker.inflight.size} en vuelo) en ${page.url()}`);
  return false;
}
async function settle(page, tracker, { ready = 'main h1' } = {}) {
  await page.waitForTimeout(300);
  await page
    .waitForFunction((src) => !new RegExp(src).test(document.body?.innerText ?? ''), GUARD_TEXT.source, {
      timeout: 90000,
    })
    .catch(() => console.warn(`  ! el guard de sesión sigue cargando en ${page.url()}`));
  await page
    .locator(`${ready}, #identifier`)
    .first()
    .waitFor({ state: 'visible', timeout: 120000 })
    .catch(() => console.warn(`  ! sin ${ready} visible en ${page.url()}`));
  await waitForNetworkQuiet(page, tracker);
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, { timeout: 60000 })
    .catch(() => console.warn(`  ! skeletons aún visibles en ${page.url()}`));
  await waitForNetworkQuiet(page, tracker);
  await page.evaluate(() => document.fonts?.ready.then(() => true) ?? true).catch(() => {});
  await page.waitForTimeout(600);
}
async function inspect(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const text = main.innerText ?? '';
    return {
      url: location.pathname + location.search,
      h1: document.querySelector('main h1')?.innerText.trim() ?? null,
      skeletons: document.querySelectorAll('.animate-pulse').length,
      errorMessages: text.match(/No fue posible[^\n]*/g) ?? [],
      sessionGuardVisible: /Cargando tu sesi[oó]n|Redirigiendo/.test(document.body.innerText),
      tableRows: main.querySelectorAll('tbody tr').length,
      pageHeight: document.documentElement.scrollHeight,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  });
}
async function neutralize(page) {
  await page.evaluate(() => {
    if (!document.getElementById('capture-hide-next-dev')) {
      const style = document.createElement('style');
      style.id = 'capture-hide-next-dev';
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.appendChild(style);
    }
    window.scrollTo(0, 0);
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
}
async function chooseOption(page, triggerSelector, preferences) {
  const trigger = page.locator(triggerSelector);
  await trigger.waitFor({ state: 'visible', timeout: 60000 });
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await listbox.waitFor({ state: 'visible', timeout: 15000 });
  const options = listbox.getByRole('option');
  const texts = (await options.allInnerTexts()).map((t) => t.trim());
  let index = -1;
  for (const pref of preferences) {
    index = texts.findIndex((t) => pref.test(t));
    if (index >= 0) break;
  }
  if (index < 0) {
    await page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    return { options: texts, chosen: null };
  }
  await options.nth(index).click();
  await listbox.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  return { options: texts, chosen: texts[index] };
}
async function screenshot(page, tracker, { file, route, user, viewport, details = {} }) {
  const checks = await inspect(page);
  await neutralize(page);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  results.push({
    file,
    route,
    user: user ?? '(sin sesión)',
    viewport: `${viewport.width}x${viewport.height}`,
    ...details,
    checks,
    consoleErrors: [...tracker.consoleErrors],
    failedApiResponses: [...tracker.failedResponses],
  });
  const flags = [
    checks.skeletons ? `skeletons=${checks.skeletons}` : null,
    checks.errorMessages.length ? `errores="${checks.errorMessages.join(' | ')}"` : null,
    checks.sessionGuardVisible ? 'guard-visible' : null,
    checks.horizontalOverflowPx ? `desborde-x=${checks.horizontalOverflowPx}px` : null,
    tracker.consoleErrors.length ? `consoleErrors=${tracker.consoleErrors.length}` : null,
    tracker.failedResponses.length ? `api>=400=${tracker.failedResponses.join(', ')}` : null,
  ].filter(Boolean);
  log(`ok ${file} h1="${checks.h1}" filas=${checks.tableRows} alto=${checks.pageHeight}${flags.length ? ` [${flags.join(' ; ')}]` : ''}`);
  tracker.reset();
}
async function goto(page, tracker, route, { ready } = {}) {
  tracker.reset();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await settle(page, tracker, ready ? { ready } : {});
  const pathname = new URL(page.url()).pathname;
  if (pathname !== route.split('?')[0]) throw new Error(`Se esperaba ${route} pero la página quedó en ${pathname}`);
}
async function login(page, tracker, identifier) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.locator('#identifier').fill(identifier);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const reached = await page.waitForURL((url) => url.pathname === '/inicio', { timeout: 60000 }).then(
      () => true,
      () => false,
    );
    if (reached) {
      await settle(page, tracker);
      tracker.reset();
      return;
    }
    console.warn(`  ! intento de login ${attempt} como ${identifier} fallido (${page.url()})`);
    if (attempt === 3) throw new Error(`No se pudo iniciar sesión como ${identifier}`);
    await goto(page, tracker, '/login', { ready: '#identifier' });
  }
}
async function runStep(fn, label) {
  try {
    await fn();
  } catch (err) {
    const message = String(err?.message ?? err).split('\n')[0];
    results.push({ file: label, error: message });
    console.error(`FAIL ${label}: ${message}`);
  }
}
async function jefeSession(browser, viewport) {
  const w = viewport.width;
  const context = await browser.newContext({ viewport, locale: 'es-ES' });
  const page = await context.newPage();
  const tracker = track(page);
  const user = JEFE;
  try {
    await runStep(async () => {
      await goto(page, tracker, '/login', { ready: '#identifier' });
      await screenshot(page, tracker, { file: `login-${w}.png`, route: '/login', user: null, viewport });
    }, `login-${w}.png`);
    await login(page, tracker, user);
    const simple = (route) =>
      runStep(async () => {
        await goto(page, tracker, route);
        await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport });
      }, `${slug(route)}-${w}.png`);
    await simple('/inicio');
    await simple('/demanda/solicitudes');
    // Priorización: pantalla por defecto y, como extra, con una solicitud elegida
    // (misma pareja que before-same-data: *-seleccion).
    await runStep(async () => {
      const route = '/demanda/priorizacion';
      await goto(page, tracker, route);
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport });
      const { chosen, options } = await chooseOption(page, '#priority-request', [/Gobierno del dato maestro de clientes/i, /Backlog priorizado/i]);
      if (!chosen) throw new Error(`Sin solicitud para priorizar entre ${options.length}`);
      await settle(page, tracker);
      await screenshot(page, tracker, { file: `${slug(route)}-seleccion-${w}.png`, route, user, viewport, details: { extra: true, selection: chosen } });
    }, `demanda-priorizacion-${w}.png`);
    // Triage: pantalla por defecto y, como extra, con una solicitud por decidir.
    await runStep(async () => {
      const route = '/demanda/triage';
      await goto(page, tracker, route);
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport });
      const { chosen, options } = await chooseOption(page, '#triage-request', [/Cat[aá]logo corporativo de datos y glosario/i, /En triage/i, /Registrada/i]);
      if (!chosen) throw new Error(`Sin solicitud para triage entre ${options.length}`);
      await settle(page, tracker);
      await screenshot(page, tracker, { file: `${slug(route)}-seleccion-${w}.png`, route, user, viewport, details: { extra: true, selection: chosen } });
    }, `demanda-triage-${w}.png`);
    await simple('/seguimiento/tareas');
    await runStep(async () => {
      const route = '/seguimiento/plan';
      await goto(page, tracker, route);
      let chosen = null;
      const { options, chosen: c } = await chooseOption(page, '#plan-request', APPROVED_WITH_PLAN);
      chosen = c;
      if (!chosen) throw new Error(`Sin solicitud con plan entre ${options.length} opciones`);
      await settle(page, tracker);
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport, details: { selection: chosen } });
      // Extra: abrir la primera tarea del plan (detalle de tarea), pareja de
      // seguimiento-tareas-detalle de before-same-data.
      const tasksSection = page.locator('section', { has: page.getByRole('heading', { name: 'Tareas', exact: true }) });
      const firstRow = tasksSection.locator('tbody tr').first();
      const taskTitle = (await firstRow.locator('td').first().innerText()).trim();
      // En el rediseño el propio título de la tarea es el enlace al detalle
      // (CellTitle href=/seguimiento/tareas?taskId=…); ya no hay botón «Abrir».
      await firstRow.getByRole('link').first().click();
      await page.waitForURL((url) => url.pathname === '/seguimiento/tareas', { timeout: 60000 });
      await settle(page, tracker);
      await screenshot(page, tracker, { file: `seguimiento-tareas-detalle-${w}.png`, route: '/seguimiento/tareas?taskId=<primera tarea del plan>', user, viewport, details: { extra: true, openedFrom: chosen, task: taskTitle } });
    }, `seguimiento-plan-${w}.png`);
    await runStep(async () => {
      const route = '/activos/capacidad';
      await goto(page, tracker, route);
      const input = page.locator('#capacidad-month');
      await input.waitFor({ state: 'visible', timeout: 60000 });
      if ((await input.inputValue()) !== CAPACITY_MONTH) {
        await input.fill(CAPACITY_MONTH);
        await settle(page, tracker);
      }
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport, details: { month: await input.inputValue() } });
    }, `activos-capacidad-${w}.png`);
    await runStep(async () => {
      const route = '/administracion/frameworks';
      await goto(page, tracker, route);
      const { chosen } = await chooseOption(page, '#governance-request', APPROVED_WITH_PLAN);
      if (!chosen) throw new Error('Sin solicitud aprobada con plan en Controles');
      await settle(page, tracker);
      const gates = await page
        .locator('[aria-label="Controles de gobierno GC1 a GC5"] [role="listitem"], [aria-label="Controles de gobierno GC1 a GC5"] > li')
        .count();
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport, details: { selection: chosen, gates } });
    }, `administracion-frameworks-${w}.png`);
    await simple('/gobierno/equipo');
  } finally {
    await context.close();
  }
}
async function integranteSession(browser, viewport) {
  const w = viewport.width;
  const context = await browser.newContext({ viewport, locale: 'es-ES' });
  const page = await context.newPage();
  const tracker = track(page);
  try {
    await goto(page, tracker, '/login', { ready: '#identifier' });
    await login(page, tracker, INTEGRANTE);
    for (const route of ['/inicio', '/mi-trabajo']) {
      await runStep(async () => {
        await goto(page, tracker, route);
        await screenshot(page, tracker, { file: `integrante-${slug(route)}-${w}.png`, route, user: INTEGRANTE, viewport });
      }, `integrante-${slug(route)}-${w}.png`);
    }
  } finally {
    await context.close();
  }
}
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const viewport of [DESKTOP, MOBILE]) {
    await runStep(() => jefeSession(browser, viewport), `sesión jefe ${viewport.width}`);
  }
  await runStep(() => integranteSession(browser, DESKTOP), `sesión integrante ${DESKTOP.width}`);
} finally {
  await browser.close();
}
fs.writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      web: BASE,
      api: API,
      conditions: [
        'Misma sesión que before-same-data: jwt, jefe@demo.local (e integrante.bi@demo.local para sus dos capturas).',
        'Rutas protegidas con carga completa dentro de la sesión (la recarga en jwt quedó corregida, design §8.7).',
        'Indicador de desarrollo de Next oculto; scroll arriba y puntero en (0,0) antes de cada captura.',
        'Mismas selecciones: Planificación y Controles con la primera solicitud de APPROVED_WITH_PLAN; Capacidad en 2026-10.',
      ],
      results,
    },
    null,
    2,
  ),
  'utf8',
);
const failed = results.filter((r) => r.error).length;
log(`total=${results.length} fallidas=${failed} out=${OUT}`);
process.exit(failed > 0 ? 1 : 0);
