// Verificacion funcional con navegador real (Playwright) contra los servidores
// jwt levantados para esta corrida: web en :3200, API en :3100.
// NO forma parte de la suite e2e del repo; es evidencia de la iteracion de review.
// Cubre finding BAJA #1: redireccion del guard de cliente y logout observados en
// un navegador real (no por razonamiento).
import { chromium } from 'playwright';

const WEB = 'http://localhost:3200';
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  // 1. Ruta protegida sin sesion -> redirige a /login
  await page.goto(`${WEB}/inicio`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
  check('ruta protegida sin sesion redirige a /login', page.url().includes('/login'), page.url());

  // 2. El formulario de login se renderiza con labels accesibles
  const idField = page.getByLabel(/correo|identifier|usuario/i).first();
  const pwField = page.getByLabel(/contrase/i).first();
  await idField.waitFor({ state: 'visible', timeout: 10000 });
  await pwField.waitFor({ state: 'visible', timeout: 10000 });
  const submit = page.getByRole('button', { name: /iniciar|ingresar|entrar/i }).first();
  check('formulario de login visible (labels + boton)', (await idField.isVisible()) && (await pwField.isVisible()) && (await submit.isVisible()));

  // 3. Credenciales malas -> error generico, SIN filtrar existencia, sigue en /login
  await idField.fill('jefe@demo.local');
  await pwField.fill('clave-incorrecta');
  await submit.click();
  // Espera explicita al texto del error de formulario (role=alert dentro del form).
  const formError = page.getByText(/usuario o contrase.*incorrect/i).first();
  await formError.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const errText = (await formError.textContent().catch(() => '')) || '';
  const leaks = /no existe|usuario no|no encontrado|not found|does not exist/i.test(errText);
  check('credenciales malas muestran error generico', /incorrect/i.test(errText), JSON.stringify(errText.trim()));
  check('error NO filtra existencia del usuario', errText.trim().length > 0 && !leaks, JSON.stringify(errText.trim()));
  check('tras error sigue en /login', page.url().includes('/login'), page.url());

  // 4. Login valido -> entra y carga permisos (sale de /login hacia /inicio)
  await pwField.fill('dev1234');
  await submit.click();
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }).catch(() => {});
  check('login valido abandona /login', !page.url().includes('/login'), page.url());
  // El token queda guardado en localStorage con la clave authToken
  const token = await page.evaluate(() => window.localStorage.getItem('authToken'));
  check('token guardado en localStorage[authToken]', Boolean(token) && token.split('.').length === 3);
  // El usuario autenticado se refleja en el shell (sidebar) via aria-label dedicado.
  const userLabel = page.getByLabel('Usuario autenticado').first();
  await userLabel.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const userText = (await userLabel.textContent().catch(() => '')) || '';
  check('shell muestra usuario autenticado', /ana jefa/i.test(userText), JSON.stringify(userText.trim()));
  // Confirma que carga permisos: aparece navegacion con modulos (no el estado "Cargando").
  await page.getByRole('navigation', { name: /navegacion principal/i }).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const navText = await page.getByRole('navigation', { name: /navegacion principal/i }).first().innerText().catch(() => '');
  check('permisos cargados (nav con modulos, no "Cargando tu sesion")', navText.length > 0 && !/cargando tu sesion/i.test(navText), `navLen=${navText.length}`);

  // 5. Logout -> limpia sesion y vuelve a /login
  const logoutBtn = page.getByRole('button', { name: /cerrar sesi|salir|logout/i }).first();
  await logoutBtn.waitFor({ state: 'visible', timeout: 10000 });
  await logoutBtn.click();
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
  check('logout redirige a /login', page.url().includes('/login'), page.url());
  const tokenAfter = await page.evaluate(() => window.localStorage.getItem('authToken'));
  check('logout limpia el token de localStorage', !tokenAfter);
} catch (err) {
  check('ejecucion sin excepciones', false, String(err && err.message ? err.message : err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\nRESUMEN: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length === 0 ? 0 : 1);
