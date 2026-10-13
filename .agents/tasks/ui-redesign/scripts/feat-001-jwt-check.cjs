// Comprobación adicional de FEAT-001 en modo jwt (artefacto, no se commitea).
// Repite a mano las regresiones de §8.7 con F5 real en rutas con y sin query,
// enlace directo con query, aviso de sesión expirada, error no-401 en /login y
// localStorage bloqueado, y guarda capturas en 1440x900 y 390x844.
// Uso: set E2E_JWT_PASSWORD=<DEV_PASSWORD del seed> && node feat-001-jwt-check.cjs <outDir>
// Requiere web en http://localhost:3300 (NEXT_PUBLIC_AUTH_MODE=jwt) y API en
// http://localhost:3301 (AUTH_MODE=jwt). No crea ni modifica datos.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const API = 'http://localhost:3301';
const IDENTIFIER = 'jefe@demo.local';
const PASSWORD = process.env.E2E_JWT_PASSWORD;
const OUT = path.resolve(process.argv[2] || '.');
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

if (!PASSWORD) {
  console.error('Falta E2E_JWT_PASSWORD');
  process.exit(2);
}

async function pickRequestId() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`POST /auth/login -> ${login.status}`);
  const { accessToken } = await login.json();
  const res = await fetch(`${API}/requests`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GET /requests -> ${res.status}`);
  const list = await res.json();
  const planned = list.find((r) =>
    ['EN_EJECUCION', 'EN_PLANIFICACION', 'COMPROMETIDA'].includes(r.operationalState),
  );
  return (planned || list[0]).id;
}

async function signIn(page) {
  await page.locator('#identifier').fill(IDENTIFIER);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

const mainHeading = (page) =>
  page.getByRole('main').getByRole('heading', { level: 1 });

function slug(route) {
  return route.replace(/^\//, '').replace(/[/?=&]+/g, '-') || 'root';
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const requestId = await pickRequestId();
  const planRoute = `/seguimiento/plan?requestId=${requestId}`;
  const browser = await chromium.launch();
  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  };
  try {
    for (const vp of VIEWPORTS) {
      const tag = `${vp.width}x${vp.height}`;
      const context = await browser.newContext({ viewport: vp, locale: 'es-ES' });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });

      // Enlace directo con query y sin sesión -> /login?next=<ruta con query>.
      await page.goto(`${BASE}${planRoute}`);
      await page.locator('#password').waitFor();
      const expectedNext = `${BASE}/login?next=${encodeURIComponent(planRoute)}`;
      record(`${tag} enlace directo con query lleva a /login?next`, page.url() === expectedNext, page.url());
      await page.screenshot({ path: path.join(OUT, `login-con-next--${tag}.png`), fullPage: true });
      await signIn(page);
      await mainHeading(page).waitFor();
      await page.waitForLoadState('networkidle');
      record(`${tag} tras iniciar sesión vuelve a la ruta con query`, page.url() === `${BASE}${planRoute}`, page.url());

      // F5 real en tres rutas protegidas (con y sin query).
      for (const route of ['/inicio', planRoute, '/gobierno/auditoria']) {
        await page.goto(`${BASE}${route}`);
        await mainHeading(page).waitFor();
        await page.reload();
        await page.waitForLoadState('networkidle');
        const visible = await mainHeading(page).isVisible();
        const sameUrl = page.url() === `${BASE}${route}`;
        record(`${tag} F5 en ${route} conserva sesión y ruta`, visible && sameUrl, page.url());
        await page.screenshot({ path: path.join(OUT, `${slug(route)}--tras-F5--${tag}.png`), fullPage: true });
      }

      // /login con sesión -> /inicio.
      await page.goto(`${BASE}/login`);
      await mainHeading(page).waitFor();
      await page.waitForLoadState('networkidle');
      record(`${tag} /login con sesión lleva a /inicio`, page.url() === `${BASE}/inicio`, page.url());

      // Error no-401 al comprobar la sesión en /login: se deja ver el formulario.
      await page.route('**/me/permissions', (r) =>
        r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
      );
      await page.goto(`${BASE}/login`);
      await page.locator('#password').waitFor();
      await page.waitForLoadState('networkidle');
      record(`${tag} /login con error 500 de permisos muestra el formulario`, page.url() === `${BASE}/login`, page.url());
      await page.unroute('**/me/permissions');

      // Cierre de sesión desde una ruta con query: /login sin next.
      await page.goto(`${BASE}${planRoute}`);
      await mainHeading(page).waitFor();
      await page.getByRole('button', { name: /Cerrar sesi[oó]n/ }).click();
      await page.locator('#password').waitFor();
      await page.waitForLoadState('networkidle');
      record(`${tag} cerrar sesión lleva a /login sin next`, page.url() === `${BASE}/login`, page.url());

      // Token rechazado -> /login?expired=1 con aviso.
      await page.evaluate((user) => {
        window.localStorage.setItem('authToken', 'token-invalido');
        window.localStorage.setItem('authUser', JSON.stringify(user));
      }, { id: '00000000-0000-4000-8000-000000000001', name: 'Usuario e2e', identifier: IDENTIFIER });
      await page.goto(`${BASE}/inicio`);
      await page.getByRole('status').filter({ hasText: /expir/i }).waitFor();
      await page.waitForLoadState('networkidle');
      record(`${tag} token rechazado lleva a /login?expired=1`, page.url() === `${BASE}/login?expired=1`, page.url());
      await page.screenshot({ path: path.join(OUT, `login-expirada--${tag}.png`), fullPage: true });

      record(`${tag} sin errores de consola salvo los 401/500 provocados`, consoleErrors.every((t) => /401|500|Failed to load resource/.test(t)), consoleErrors.slice(0, 3).join(' | '));
      await context.close();

      // localStorage bloqueado: se trata como sin sesión y no se queda cargando.
      const blocked = await browser.newContext({ viewport: vp, locale: 'es-ES' });
      // Como un navegador que bloquea el almacenamiento: acceder a
      // window.localStorage lanza SecurityError.
      await blocked.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('localStorage bloqueado', 'SecurityError');
          },
        });
      });
      const bpage = await blocked.newPage();
      await bpage.goto(`${BASE}/demanda/solicitudes`);
      await bpage.locator('#password').waitFor({ timeout: 15000 });
      record(`${tag} localStorage bloqueado lleva a /login?next`, bpage.url() === `${BASE}/login?next=%2Fdemanda%2Fsolicitudes`, bpage.url());
      await blocked.close();
    }
  } catch (err) {
    record('ejecución', false, String(err && err.message ? err.message : err));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ requestId, checks }, null, 2), 'utf8');
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`checks=${checks.length} failed=${failed} out=${OUT}`);
  process.exit(failed ? 1 : 0);
})();
