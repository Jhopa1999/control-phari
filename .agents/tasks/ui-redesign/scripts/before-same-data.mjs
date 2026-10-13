// Capturas "ANTES" de la UI actual con los datos de prueba ya cargados (modo jwt).
// Solo lectura: inicia sesion por /login y navega como un usuario (menu lateral,
// selectores y enlaces); no envia formularios de negocio ni modifica datos.
//
// Uso: node before-same-data.mjs
// Requiere la web en http://localhost:3000 y la API en http://localhost:3001
// (servidores del checkout principal). Salida: ../screenshots/before-same-data/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001';
// Password de desarrollo documentada en apps/api/prisma/seed.ts (solo dev).
const PASSWORD = process.env.DEMO_PASSWORD ?? 'dev1234';
const OUT = path.resolve(HERE, '..', 'screenshots', 'before-same-data');
const CAPACITY_MONTH = '2026-10';

const JEFE = 'jefe@demo.local';
const INTEGRANTE = 'integrante.bi@demo.local';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// Solicitudes aprobadas de demo que tienen plan con fases y tareas, en orden de
// preferencia (R01 -> plan PA, R07 -> PB, R08 -> PC, R13 -> PD). Tambien tienen
// gates GC1-GC5 con pendientes, asi que sirven para el tablero de gobierno.
const APPROVED_WITH_PLAN = [
  /Tablero ejecutivo de ventas y margen por canal/i,
  /Integraci[oó]n de pedidos del ERP/i,
  /API de consulta de saldos/i,
  /asistente de consulta de pol[ií]ticas/i,
];

const results = [];

function log(...args) {
  console.log(...args);
}

function slug(route) {
  return route.replace(/^\//, '').replace(/\//g, '-') || 'root';
}

/** Lleva la cuenta de peticiones en vuelo, errores de consola y respuestas >= 400. */
function track(page) {
  const state = {
    inflight: new Set(),
    lastActivity: Date.now(),
    consoleErrors: [],
    failedResponses: [],
  };
  const ignored = (url) => /webpack-hmr|__nextjs|_next\/static\/development/.test(url);
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
    if (/HMR|Fast Refresh|reload/i.test(msg.text())) log(`  console ${msg.text().slice(0, 160)}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith(API)) {
      state.failedResponses.push(`${res.status()} ${res.request().method()} ${res.url().slice(API.length)}`);
    }
  });
  // Diagnostico: navegaciones del frame principal (incluye recargas completas).
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) log(`  nav ${frame.url().slice(BASE.length)}`);
  });
  state.reset = () => {
    state.consoleErrors = [];
    state.failedResponses = [];
  };
  return state;
}

/** Espera a que no haya peticiones en vuelo durante `idleMs` (sirve tras interacciones). */
async function waitForNetworkQuiet(page, tracker, { idleMs = 700, timeout = 60000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (tracker.inflight.size === 0 && Date.now() - tracker.lastActivity >= idleMs) return true;
    await page.waitForTimeout(100);
  }
  console.warn(`  ! red no quedo inactiva (${tracker.inflight.size} en vuelo) en ${page.url()}`);
  return false;
}

/**
 * Espera carga completa: guard de sesion resuelto, elemento `ready` visible (h1
 * por defecto), sin skeletons y red inactiva. La pausa inicial deja arrancar los
 * fetch disparados por una interaccion previa (p. ej. elegir una opcion).
 */
async function settle(page, tracker, { ready = 'h1' } = {}) {
  await page.waitForTimeout(300);
  await page
    .waitForFunction(
      () => !/Cargando tu sesion|Redirigiendo al inicio de sesion/.test(document.body?.innerText ?? ''),
      null,
      { timeout: 90000 },
    )
    .catch(() => console.warn(`  ! el guard de sesion sigue cargando en ${page.url()}`));
  // Si la app redirige al login (sesion perdida) se deja de esperar el `ready`.
  await page
    .locator(`${ready}, #identifier`)
    .first()
    .waitFor({ state: 'visible', timeout: 120000 })
    .catch(() => console.warn(`  ! sin ${ready} visible en ${page.url()}`));
  await waitForNetworkQuiet(page, tracker);
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, {
      timeout: 60000,
    })
    .catch(() => console.warn(`  ! skeletons aun visibles en ${page.url()}`));
  await waitForNetworkQuiet(page, tracker);
  await page.evaluate(() => document.fonts?.ready.then(() => true) ?? true).catch(() => {});
  await page.waitForTimeout(600);
}

/** Datos observables de la pantalla al momento de capturar (para el manifest). */
async function inspect(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const text = main.innerText ?? '';
    return {
      url: location.pathname + location.search,
      h1: document.querySelector('h1')?.innerText.trim() ?? null,
      skeletons: document.querySelectorAll('.animate-pulse').length,
      errorMessages: text.match(/No fue posible[^\n]*/g) ?? [],
      sessionGuardVisible: /Cargando tu sesion|Redirigiendo al inicio de sesion/.test(
        document.body.innerText,
      ),
      tableRows: main.querySelectorAll('tbody tr').length,
      pageHeight: document.documentElement.scrollHeight,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      // Texto visible del indicador de desarrollo de Next (avisa si hay "Issues").
      nextDevOverlayText: (() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot;
        if (!root) return null;
        let text = '';
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement;
          if (parent && !['STYLE', 'SCRIPT'].includes(parent.tagName)) {
            text += ` ${walker.currentNode.textContent}`;
          }
        }
        return text.replace(/\s+/g, ' ').trim().slice(0, 200);
      })(),
    };
  });
}

/**
 * Deja la pagina neutra para la captura: oculta el indicador de desarrollo de
 * Next (no es parte de la UI del producto), vuelve arriba y aparta el puntero
 * para que no quede ningun elemento en estado hover.
 */
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

/**
 * Abre un Select (Radix) y elige la primera opcion que cumpla alguna preferencia.
 * Si ninguna coincide y `fallbackFirst` es true elige la primera opcion; si no,
 * cierra el desplegable y devuelve chosen=null.
 */
async function chooseOption(page, triggerSelector, preferences, { fallbackFirst = false } = {}) {
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
  if (index < 0 && fallbackFirst && texts.length > 0) index = 0;
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
  const entry = {
    file,
    route,
    user: user ?? '(sin sesion)',
    viewport: `${viewport.width}x${viewport.height}`,
    ...details,
    checks,
    consoleErrors: [...tracker.consoleErrors],
    failedApiResponses: [...tracker.failedResponses],
  };
  results.push(entry);
  const flags = [
    checks.skeletons ? `skeletons=${checks.skeletons}` : null,
    checks.errorMessages.length ? `errores="${checks.errorMessages.join(' | ')}"` : null,
    checks.sessionGuardVisible ? 'guard-visible' : null,
    checks.horizontalOverflowPx ? `desborde-x=${checks.horizontalOverflowPx}px` : null,
    /issue|error/i.test(checks.nextDevOverlayText ?? '') ? `next="${checks.nextDevOverlayText}"` : null,
    tracker.consoleErrors.length ? `consoleErrors=${tracker.consoleErrors.length}` : null,
    tracker.failedResponses.length ? `api>=400=${tracker.failedResponses.join(', ')}` : null,
  ].filter(Boolean);
  log(
    `ok ${file} h1="${checks.h1}" filas=${checks.tableRows} alto=${checks.pageHeight}` +
      (flags.length ? ` [${flags.join(' ; ')}]` : ''),
  );
  tracker.reset();
}

async function login(page, tracker, identifier) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.locator('#identifier').fill(identifier);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const reached = await page
      .waitForURL((url) => url.pathname === '/inicio', { timeout: 60000 })
      .then(
        () => true,
        () => false,
      );
    let reason;
    if (reached) {
      await settle(page, tracker);
      if (new URL(page.url()).pathname === '/inicio') {
        tracker.reset();
        return;
      }
      reason = `tras el login la pagina volvio a ${page.url()}; api>=400: ${tracker.failedResponses.join(', ')}`;
    } else {
      const alerts = await page.getByRole('alert').allInnerTexts().catch(() => []);
      reason = `sin redireccion a /inicio (${page.url()}): ${alerts.join(' | ')}`;
    }
    console.warn(`  ! intento de login ${attempt} como ${identifier} fallido: ${reason}`);
    if (attempt === 3) throw new Error(`No se pudo iniciar sesion como ${identifier}: ${reason}`);
    await page.waitForTimeout(1500);
    await goto(page, tracker, '/login', { ready: '#identifier' });
  }
}

/** Carga completa de una ruta. Solo se usa para /login (ver `navigate`). */
async function goto(page, tracker, route, { ready = 'h1' } = {}) {
  tracker.reset();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await settle(page, tracker, { ready });
  const pathname = new URL(page.url()).pathname;
  if (pathname !== route.split('?')[0]) {
    throw new Error(`Se esperaba ${route} pero la pagina quedo en ${pathname}`);
  }
}

/** Espera a que el h1 del <main> deje de ser `previous` (navegacion de cliente). */
async function waitForNewHeading(page, previous) {
  await page
    .waitForFunction(
      (prev) => {
        const h1 = document.querySelector('main h1');
        return Boolean(h1) && h1.innerText.trim() !== prev;
      },
      previous,
      { timeout: 120000 },
    )
    .catch(() => console.warn(`  ! el h1 no cambio tras navegar a ${page.url()}`));
}

/**
 * Navega a una ruta protegida haciendo clic en el menu lateral, como un usuario.
 * En la UI actual una carga completa (page.goto/F5) de una ruta protegida
 * redirige a /login aunque haya token: el efecto del RouteGuard corre antes de
 * que ActorProvider restaure la sesion desde localStorage. Por eso no se usa
 * page.goto para estas rutas.
 */
async function navigate(page, tracker, route) {
  tracker.reset();
  const here = new URL(page.url());
  if (here.pathname + here.search !== route) {
    const link = page.locator(`nav[aria-label="Navegacion principal"] a[href="${route}"]`);
    if ((await link.count()) === 0) {
      throw new Error(`El menu lateral no ofrece ${route} a este usuario`);
    }
    const previous = (await page.locator('main h1').first().innerText().catch(() => '')).trim();
    await link.first().click();
    await page.waitForURL((url) => url.pathname + url.search === route, { timeout: 120000 });
    if (here.pathname !== route) await waitForNewHeading(page, previous);
  }
  await settle(page, tracker);
  const now = new URL(page.url());
  if (now.pathname + now.search !== route) {
    throw new Error(`Se esperaba ${route} pero la pagina quedo en ${now.pathname}${now.search}`);
  }
}

// --- Preparaciones por pantalla (interacciones de usuario, sin escribir datos) ---

async function preparePlan(page, tracker) {
  const tried = [];
  for (const pref of APPROVED_WITH_PLAN) {
    const { options, chosen } = await chooseOption(page, '#plan-request', [pref]);
    if (!chosen) continue;
    await settle(page, tracker);
    const phasesSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Fases', exact: true }),
    });
    const tasksSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Tareas', exact: true }),
    });
    const phases = await phasesSection.locator('li').count();
    const tasks = await tasksSection.locator('tbody tr').count();
    tried.push({ chosen, phases, tasks });
    if (phases > 0 && tasks > 0) {
      return { selection: chosen, phases, tasks, availableOptions: options, tried };
    }
  }
  throw new Error(`Ninguna solicitud con plan, fases y tareas: ${JSON.stringify(tried)}`);
}

async function prepareCapacity(page, tracker) {
  const input = page.locator('#capacidad-month');
  await input.waitFor({ state: 'visible', timeout: 60000 });
  if ((await input.inputValue()) !== CAPACITY_MONTH) {
    await input.fill(CAPACITY_MONTH);
    await settle(page, tracker);
  }
  return { month: await input.inputValue() };
}

async function prepareGovernance(page, tracker) {
  const tried = [];
  for (const pref of APPROVED_WITH_PLAN) {
    const { options, chosen } = await chooseOption(page, '#governance-request', [pref]);
    if (!chosen) continue;
    await settle(page, tracker);
    const gates = await page
      .locator('[role="list"][aria-label="Controles de gobierno GC1 a GC5"] [role="listitem"]')
      .count();
    tried.push({ chosen, gates });
    if (gates === 5) return { selection: chosen, gates, availableOptions: options, tried };
  }
  throw new Error(`Ninguna solicitud mostro los 5 gates: ${JSON.stringify(tried)}`);
}

async function selectForExtra(page, tracker, trigger, preferences) {
  const { options, chosen } = await chooseOption(page, trigger, preferences, {
    fallbackFirst: true,
  });
  if (!chosen) throw new Error(`Sin opciones en ${trigger}`);
  await settle(page, tracker);
  return { selection: chosen, availableOptions: options };
}

// --- Sesiones ---

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
    // /login sin sesion (contexto nuevo, localStorage vacio).
    await runStep(async () => {
      await goto(page, tracker, '/login', { ready: '#identifier' });
      await screenshot(page, tracker, { file: `login-${w}.png`, route: '/login', user: null, viewport });
    }, `login-${w}.png`);

    await login(page, tracker, user);

    const simple = async (route) =>
      runStep(async () => {
        await navigate(page, tracker, route);
        await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport });
      }, `${slug(route)}-${w}.png`);

    // Tras el login la app ya esta en /inicio (router.replace del formulario).
    await simple('/inicio');
    await simple('/demanda/solicitudes');

    // Priorizacion: pantalla por defecto y, como extra, con una solicitud elegida.
    await runStep(async () => {
      const route = '/demanda/priorizacion';
      await navigate(page, tracker, route);
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport });
      const details = await selectForExtra(page, tracker, '#priority-request', [
        / - Backlog priorizado$/i,
      ]);
      await screenshot(page, tracker, {
        file: `${slug(route)}-seleccion-${w}.png`,
        route,
        user,
        viewport,
        details: { extra: true, ...details },
      });
    }, `demanda-priorizacion-${w}.png`);

    // Triage: pantalla por defecto y, como extra, con una solicitud por decidir.
    await runStep(async () => {
      const route = '/demanda/triage';
      await navigate(page, tracker, route);
      await screenshot(page, tracker, { file: `${slug(route)}-${w}.png`, route, user, viewport });
      const details = await selectForExtra(page, tracker, '#triage-request', [
        / - En triage$/i,
        / - Registrada$/i,
      ]);
      await screenshot(page, tracker, {
        file: `${slug(route)}-seleccion-${w}.png`,
        route,
        user,
        viewport,
        details: { extra: true, ...details },
      });
    }, `demanda-triage-${w}.png`);

    // Tareas sin tarea elegida (estado por defecto desde el menu).
    await simple('/seguimiento/tareas');

    // Plan: la pantalla exige elegir solicitud; se elige una aprobada con fases y
    // tareas. Extra: abrir la primera tarea desde el plan (detalle de tarea).
    await runStep(async () => {
      const route = '/seguimiento/plan';
      await navigate(page, tracker, route);
      const details = await preparePlan(page, tracker);
      await screenshot(page, tracker, {
        file: `${slug(route)}-${w}.png`,
        route,
        user,
        viewport,
        details,
      });
      const tasksSection = page.locator('section', {
        has: page.getByRole('heading', { name: 'Tareas', exact: true }),
      });
      const firstRow = tasksSection.locator('tbody tr').first();
      const taskTitle = (await firstRow.locator('td').first().innerText()).trim();
      const previous = (await page.locator('main h1').first().innerText()).trim();
      await firstRow.getByRole('link', { name: 'Abrir' }).click();
      await page.waitForURL((url) => url.pathname === '/seguimiento/tareas', { timeout: 60000 });
      await waitForNewHeading(page, previous);
      await settle(page, tracker);
      await screenshot(page, tracker, {
        file: `seguimiento-tareas-detalle-${w}.png`,
        route: '/seguimiento/tareas?taskId=<primera tarea del plan>',
        user,
        viewport,
        details: { extra: true, openedFrom: details.selection, task: taskTitle },
      });
    }, `seguimiento-plan-${w}.png`);

    await runStep(async () => {
      const route = '/activos/capacidad';
      await navigate(page, tracker, route);
      const details = await prepareCapacity(page, tracker);
      await screenshot(page, tracker, {
        file: `${slug(route)}-${w}.png`,
        route,
        user,
        viewport,
        details,
      });
    }, `activos-capacidad-${w}.png`);

    await runStep(async () => {
      const route = '/administracion/frameworks';
      await navigate(page, tracker, route);
      const details = await prepareGovernance(page, tracker);
      await screenshot(page, tracker, {
        file: `${slug(route)}-${w}.png`,
        route,
        user,
        viewport,
        details,
      });
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
  const user = INTEGRANTE;
  try {
    await goto(page, tracker, '/login', { ready: '#identifier' });
    await login(page, tracker, user);
    for (const route of ['/inicio', '/mi-trabajo']) {
      await runStep(async () => {
        await navigate(page, tracker, route);
        await screenshot(page, tracker, {
          file: `integrante-${slug(route)}-${w}.png`,
          route,
          user,
          viewport,
        });
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
    await runStep(() => jefeSession(browser, viewport), `sesion jefe ${viewport.width}`);
  }
  await runStep(() => integranteSession(browser, DESKTOP), `sesion integrante ${DESKTOP.width}`);
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
        'Navegacion por el menu lateral tras el login (una carga completa de una ruta protegida redirige a /login en la UI actual).',
        'Indicador de desarrollo de Next (nextjs-portal) oculto; scroll arriba y puntero en (0,0) antes de cada captura.',
        'Capturas fullPage; si la pagina desborda en horizontal, el PNG es mas ancho que el viewport (ver checks.horizontalOverflowPx).',
        'Archivos con "-seleccion" y "seguimiento-tareas-detalle" son extras: misma pantalla tras elegir solicitud o abrir una tarea.',
      ],
      results,
    },
    null,
    2,
  ),
);
const failed = results.filter((r) => r.error).length;
log(`total=${results.length} fallidas=${failed} out=${OUT}`);
process.exit(failed > 0 ? 1 : 0);
