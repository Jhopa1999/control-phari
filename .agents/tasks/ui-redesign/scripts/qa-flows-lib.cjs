// Utilidades de los recorridos con escritura de la QA final (qa-flows.cjs).
// Navegador real (Chromium) contra los servidores del worktree en dev-header.
// - Toda alta que la UI hace con POST (2xx con `id` nuevo) se registra en
//   .agents/tasks/demo-data/manifest.json como entidad `qa.ui.*`.
// - Las transiciones y ediciones (POST de acción, PATCH, PUT) se registran en
//   `actions` del manifest.
// - Los DELETE NO llegan a la API: se interceptan y se responden con 204 para
//   comprobar el cableado de la UI (petición correcta y manejo del éxito) sin
//   borrar datos (instrucción del usuario: no borrar nada).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const BASE = process.env.WEB_URL || 'http://localhost:3300';
const API = (process.env.API_URL || 'http://localhost:3301').replace(/\/+$/, '');
const MANIFEST = path.resolve(__dirname, '..', '..', 'demo-data', 'manifest.json');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'QA-FINAL', 'flujos');
const MARKER = 'Dato de prueba (demo-ui)';
const TZ = 'America/Bogota';
const ACTORS = {
  jefe: 'jefe@demo.local',
  beto: 'lider.bi@demo.local',
  carla: 'integrante.bi@demo.local',
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  const d = detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${d}`);
  return Boolean(ok);
}

// ---------------------------------------------------------------- manifest
function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}
function writeManifest(m) {
  m.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
}
function manifestIds() {
  return new Set(readManifest().entities.map((e) => e.id));
}
function byKey(key) {
  return readManifest().entities.find((e) => e.key === key) || null;
}
function actionsByPrefix(prefix) {
  return (readManifest().actions || []).filter((a) => a.key.startsWith(prefix));
}

const UUID = '[0-9a-f-]{36}';
const CREATE_RULES = [
  [new RegExp(`^/users$`), 'User'],
  [new RegExp(`^/grants$`), 'Grant'],
  [new RegExp(`^/requests$`), 'Request'],
  [new RegExp(`^/requests/(${UUID})/approval$`), 'Approval', ['requestId']],
  [new RegExp(`^/requests/(${UUID})/triage$`), 'Triage', ['requestId']],
  [new RegExp(`^/requests/(${UUID})/priority$`), 'PriorityEvaluation', ['requestId']],
  [new RegExp(`^/requests/(${UUID})/plan$`), 'Plan', ['requestId']],
  [new RegExp(`^/plans/(${UUID})/phases$`), 'PlanPhase', ['planId']],
  [new RegExp(`^/phases/(${UUID})/tasks$`), 'Task', ['phaseId']],
  [new RegExp(`^/tasks/(${UUID})/dependencies$`), 'TaskDependency', ['taskId']],
  [new RegExp(`^/capacity/availability$`), 'MonthlyAvailability'],
  [new RegExp(`^/capacity/assignments$`), 'Assignment'],
  [new RegExp(`^/worklog/daily$`), 'DailyLog'],
  [new RegExp(`^/worklog/daily/(${UUID})/activities$`), 'DailyLogActivity', ['dailyLogId']],
  [new RegExp(`^/weekly-reports$`), 'WeeklyReport'],
  [new RegExp(`^/issues$`), 'Issue'],
  [new RegExp(`^/meetings$`), 'Meeting'],
  [new RegExp(`^/commitments$`), 'Commitment'],
  [new RegExp(`^/assets$`), 'Asset'],
  [new RegExp(`^/documents$`), 'Document'],
  [new RegExp(`^/documents/(${UUID})/versions$`), 'DocumentVersion', ['documentId']],
  [new RegExp(`^/requests/(${UUID})/validations$`), 'ValidationRecord', ['requestId']],
  [new RegExp(`^/requests/(${UUID})/gates/(GC\\d)/pending-items$`), 'GatePendingItem', ['requestId', 'gateCode']],
];

/** Registra en el manifest lo que la UI crea o transiciona. */
function attachRecorder(page, actor, flow) {
  const pending = [];
  page.on('response', (res) => {
    const req = res.request();
    const method = req.method();
    if (!['POST', 'PATCH', 'PUT'].includes(method)) return;
    let url;
    try {
      url = new URL(res.url());
    } catch {
      return;
    }
    if (url.origin !== new URL(API).origin) return;
    if (res.status() < 200 || res.status() >= 300) return;
    pending.push(
      (async () => {
        let body = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        const route = url.pathname;
        const m = readManifest();
        const known = new Set(m.entities.map((e) => e.id));
        const rule = method === 'POST' ? CREATE_RULES.find(([re]) => re.test(route)) : null;
        if (rule && body && typeof body.id === 'string' && !known.has(body.id)) {
          const [re, entity, names = []] = rule;
          const match = route.match(re);
          const parentIds = {};
          names.forEach((n, i) => {
            parentIds[n] = match[i + 1];
          });
          const label = body.title || body.name || body.identifier || body.decision || body.status || undefined;
          m.entities.push({
            key: `qa.ui.${entity}.${body.id.slice(0, 8)}`,
            entity,
            id: body.id,
            parentIds,
            createdVia: `${method} ${route} (desde la UI, QA final: ${flow})`,
            actor: ACTORS[actor],
            createdAt: body.createdAt || new Date().toISOString(),
            ...(label ? { label: String(label).slice(0, 120) } : {}),
          });
          for (const p of entity === 'Request' && Array.isArray(body.participants) ? body.participants : []) {
            if (known.has(p.id)) continue;
            m.entities.push({
              key: `qa.ui.RequestParticipant.${p.id.slice(0, 8)}`,
              entity: 'RequestParticipant',
              id: p.id,
              parentIds: { requestId: body.id, processId: p.processId },
              createdVia: 'POST /requests (participante materializado con la solicitud, desde la UI)',
              actor: ACTORS[actor],
              createdAt: body.createdAt || new Date().toISOString(),
            });
          }
          writeManifest(m);
          return;
        }
        m.actions = m.actions || [];
        const sig = `${method} ${route} ${flow}`;
        if (m.actions.some((a) => a.key.startsWith('qa.ui.action.') && `${a.action} ${a.detail && a.detail.flow}` === sig)) {
          return;
        }
        const n = m.actions.filter((a) => a.key.startsWith('qa.ui.action.')).length + 1;
        m.actions.push({
          key: `qa.ui.action.${String(n).padStart(3, '0')}`,
          action: `${method} ${route}`,
          target: { id: body && typeof body.id === 'string' ? body.id : null },
          actor: ACTORS[actor],
          at: new Date().toISOString(),
          detail: { flow, status: res.status() },
        });
        writeManifest(m);
      })(),
    );
  });
  return () => Promise.all(pending.splice(0));
}

// ---------------------------------------------------------------- navegador
let browser = null;
async function getBrowser() {
  if (!browser) browser = await chromium.launch();
  return browser;
}
async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
}

/** Contexto con el actor de dev-header y registro de errores y escrituras. */
async function open(actor, flow, extra = {}) {
  const b = await getBrowser();
  const context = await b.newContext({
    locale: 'es-ES',
    timezoneId: TZ,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    ...extra,
  });
  await context.addInitScript((id) => window.localStorage.setItem('actorId', id), ACTORS[actor]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  const failed = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Las respuestas 4xx esperadas (409 de prueba) se reportan aparte.
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    errors.push(text.slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && new URL(res.url()).origin === new URL(API).origin) {
      failed.push(`${res.request().method()} ${new URL(res.url()).pathname} -> ${res.status()}`);
    }
  });
  const deletes = [];
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() !== 'DELETE') return route.fallback();
    deletes.push(new URL(req.url()).pathname);
    // Sin borrar: la API no recibe la petición.
    return route.fulfill({ status: 204, body: '' });
  });
  const flush = attachRecorder(page, actor, flow);
  return {
    context,
    page,
    errors,
    failed,
    deletes,
    async close() {
      await flush();
      await context.close();
    },
    flush,
  };
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, { timeout: 20000 })
    .catch(() => undefined);
}

async function goto(page, route) {
  await page.goto(`${BASE}${route}`);
  await page.locator('main h1').first().waitFor();
  await settle(page);
}

/** Abre un Select de Radix por el id del trigger y elige la opción. */
async function choose(scope, page, triggerId, optionName) {
  await scope.locator(`#${triggerId}`).click();
  const option = page.getByRole('listbox').getByRole('option', { name: optionName }).first();
  await pick(page, option);
}

/**
 * Radix Select ignora el clic que llega justo tras abrirse (mismo gesto del
 * puntero): se enfoca la opción con hover y se confirma con Enter, como un
 * usuario de teclado.
 */
async function pick(page, option) {
  await option.hover();
  await option.press('Enter');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
}

/** Espera la respuesta de la API para method + pathname (string o RegExp). */
function waitApi(page, method, pathRe) {
  return page.waitForResponse((r) => {
    if (r.request().method() !== method) return false;
    let p;
    try {
      p = new URL(r.url()).pathname;
    } catch {
      return false;
    }
    return typeof pathRe === 'string' ? p === pathRe : pathRe.test(p);
  });
}

/**
 * Pide a Sonner que descarte sus toasts sin tocar el DOM que gestiona React
 * (quitar nodos a mano provoca «insertBefore»). Dispara el gesto de salir del
 * puntero y espera a que el stack se vacíe por sí mismo; si no, sigue igual.
 */
async function clearToasts(page) {
  await page.mouse.move(5, 5).catch(() => undefined);
  await page
    .locator('[data-sonner-toaster]')
    .first()
    .dispatchEvent('pointerleave')
    .catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelectorAll('[data-sonner-toast]').length === 0, null, { timeout: 6000 })
    .catch(() => undefined);
}

async function toast(page, text, timeout = 15000) {
  const loc = page.locator('[data-sonner-toast]').filter({ hasText: text });
  return loc
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false,
    );
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function apiGet(actor, route) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(`${API}${route}`, { headers: { 'X-Actor-Id': ACTORS[actor], Accept: 'application/json' } });
      if (res.status >= 500 && attempt < 3) continue;
      if (!res.ok) throw new Error(`GET ${route} -> ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt < 3 && /fetch failed|ECONNRESET/.test(String(err))) continue;
      throw err;
    }
  }
}

/** Marca un paso que no debe tumbar el resto del flujo. */
async function step(name, fn) {
  try {
    return await fn();
  } catch (err) {
    check(name, false, String(err && err.message ? err.message : err).split('\n')[0].slice(0, 300));
    return undefined;
  }
}

function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\nflujos: total=${results.length} ok=${results.length - failed.length} fallidos=${failed.length}`);
  for (const f of failed) console.log(`  FAIL ${f.name}`);
  return failed.length;
}

module.exports = {
  BASE,
  API,
  MARKER,
  ACTORS,
  check,
  results,
  readManifest,
  writeManifest,
  manifestIds,
  byKey,
  actionsByPrefix,
  open,
  closeBrowser,
  settle,
  goto,
  choose,
  pick,
  clearToasts,
  waitApi,
  toast,
  shot,
  apiGet,
  step,
  summary,
};
