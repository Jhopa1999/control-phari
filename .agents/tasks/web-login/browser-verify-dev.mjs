// Verificacion de regresion dev-header con navegador real (Playwright).
// Servidores de esta corrida: web :3200 y API :3100 en modo dev-header.
// Confirma que el worktree NO rompe el comportamiento historico:
// sin login, sin guard; el selector de usuario (dev) sigue presente.
import { chromium } from 'playwright';

const WEB = 'http://localhost:3200';
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
try {
  // 1. /inicio NO redirige a /login en dev-header
  await page.goto(`${WEB}/inicio`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('dev-header: /inicio NO redirige a /login', !page.url().includes('/login'), page.url());

  // 2. El selector de usuario (dev) sigue presente
  const selector = page.getByLabel(/usuario actual/i).first();
  await selector.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  check('dev-header: selector de usuario presente', await selector.isVisible().catch(() => false));

  // 3. NO aparece el boton de cerrar sesion (propio de jwt)
  const logout = page.getByRole('button', { name: /cerrar sesi/i });
  check('dev-header: NO hay boton "Cerrar sesion"', (await logout.count()) === 0);

  // 4. /login existe pero no es parte del flujo dev-header (accesible, sin forzar)
  //    No se verifica redireccion aqui; solo que la app no empuja a login.
  const body = await page.locator('body').innerText();
  check('dev-header: no muestra pantalla de login en rutas protegidas', !/accede con tu usuario o correo del portal/i.test(body));
} catch (err) {
  check('ejecucion sin excepciones', false, String(err && err.message ? err.message : err));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\nRESUMEN: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length === 0 ? 0 : 1);
