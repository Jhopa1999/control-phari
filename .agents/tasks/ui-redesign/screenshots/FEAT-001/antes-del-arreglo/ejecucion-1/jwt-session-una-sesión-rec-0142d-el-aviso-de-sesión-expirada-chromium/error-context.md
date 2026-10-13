# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: jwt-session.spec.ts >> una sesión rechazada lleva a /login?expired=1 con el aviso de sesión expirada
- Location: e2e\jwt-session.spec.ts:104:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('status').filter({ hasText: /expir/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('status').filter({ hasText: /expir/i }) with timeout 5000ms
  - waiting for getByRole('status').filter({ hasText: /expir/i })

```

```yaml
- text: Iniciar sesion Accede con tu usuario o correo del portal. Usuario o correo
- textbox "Usuario o correo"
- text: Contrasena
- textbox "Contrasena"
- button "Ingresar"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  17  |  * se copia aquí.
  18  |  *
  19  |  * Regla de orden: primero el contenido y después la URL. Tras page.reload() la
  20  |  * URL sigue siendo la de origen hasta que el cliente redirige, así que
  21  |  * comprobarla primero pasaría en falso.
  22  |  */
  23  | test.skip(
  24  |   process.env.E2E_AUTH_MODE !== 'jwt',
  25  |   'Requiere la API y la web en modo jwt',
  26  | );
  27  | 
  28  | const PASSWORD = process.env.E2E_JWT_PASSWORD ?? '';
  29  | test.skip(
  30  |   PASSWORD === '',
  31  |   'Requiere E2E_JWT_PASSWORD (DEV_PASSWORD de apps/api/prisma/seed.ts)',
  32  | );
  33  | 
  34  | const IDENTIFIER = process.env.E2E_JWT_IDENTIFIER ?? 'jefe@demo.local';
  35  | 
  36  | /** Usuario bien formado que acompaña a un token inválido (caso 4). */
  37  | const STORED_USER: AuthUser = {
  38  |   id: '00000000-0000-4000-8000-000000000001',
  39  |   name: 'Usuario e2e',
  40  |   identifier: IDENTIFIER,
  41  | };
  42  | 
  43  | // Cada test parte de un navegador sin sesión: ni token jwt ni actor de dev.
  44  | test.use({ storageState: { cookies: [], origins: [] } });
  45  | 
  46  | // Selectores estables del baseline: no cambian con el rediseño.
  47  | async function signIn(page: Page): Promise<void> {
  48  |   await page.locator('#identifier').fill(IDENTIFIER);
  49  |   await page.locator('#password').fill(PASSWORD);
  50  |   await page.getByRole('button', { name: 'Ingresar' }).click();
  51  | }
  52  | const mainHeading = (page: Page) =>
  53  |   page.getByRole('main').getByRole('heading', { level: 1 });
  54  | const loginForm = (page: Page) => page.locator('#password');
  55  | const expiredNotice = (page: Page) =>
  56  |   page.getByRole('status').filter({ hasText: /expir/i });
  57  | const logoutButton = (page: Page) =>
  58  |   page.getByRole('button', { name: /Cerrar sesi[oó]n/ });
  59  | 
  60  | test('recargar una ruta protegida conserva la sesión y la ruta', async ({
  61  |   page,
  62  | }) => {
  63  |   await page.goto('/login');
  64  |   await signIn(page);
  65  |   await expect(mainHeading(page)).toBeVisible();
  66  |   await expect(page).toHaveURL('/inicio');
  67  | 
  68  |   await page.reload();
  69  |   await expect(mainHeading(page)).toBeVisible();
  70  |   await expect(page).toHaveURL('/inicio');
  71  | 
  72  |   await page.goto('/seguimiento/portafolio');
  73  |   await page.reload();
  74  |   await expect(
  75  |     page.getByRole('heading', { level: 1, name: 'Portafolio' }),
  76  |   ).toBeVisible();
  77  |   await expect(page).toHaveURL('/seguimiento/portafolio');
  78  | });
  79  | 
  80  | test('un enlace directo sin sesión vuelve a su ruta tras iniciar sesión', async ({
  81  |   page,
  82  | }) => {
  83  |   await page.goto('/demanda/solicitudes');
  84  |   await expect(loginForm(page)).toBeVisible();
  85  |   await expect(page).toHaveURL('/login?next=%2Fdemanda%2Fsolicitudes');
  86  | 
  87  |   await signIn(page);
  88  |   await expect(mainHeading(page)).toBeVisible();
  89  |   await expect(page).toHaveURL('/demanda/solicitudes');
  90  | });
  91  | 
  92  | test('/login con sesión válida lleva a /inicio', async ({ page }) => {
  93  |   await page.goto('/login');
  94  |   await signIn(page);
  95  |   await expect(mainHeading(page)).toBeVisible();
  96  |   await expect(page).toHaveURL('/inicio');
  97  | 
  98  |   await page.goto('/login');
  99  |   await expect(mainHeading(page)).toBeVisible();
  100 |   await expect(page).toHaveURL('/inicio');
  101 |   await expect(loginForm(page)).toHaveCount(0);
  102 | });
  103 | 
  104 | test('una sesión rechazada lleva a /login?expired=1 con el aviso de sesión expirada', async ({
  105 |   page,
  106 | }) => {
  107 |   await page.goto('/login');
  108 |   await page.evaluate(
  109 |     ([token, user]) => {
  110 |       window.localStorage.setItem('authToken', token);
  111 |       window.localStorage.setItem('authUser', user);
  112 |     },
  113 |     ['token-invalido', JSON.stringify(STORED_USER)] as const,
  114 |   );
  115 | 
  116 |   await page.goto('/inicio');
> 117 |   await expect(expiredNotice(page)).toBeVisible();
      |                                     ^ Error: expect(locator).toBeVisible() failed
  118 |   await expect(page).toHaveURL('/login?expired=1');
  119 | });
  120 | 
  121 | test('un next externo se ignora y lleva a /inicio del mismo origen', async ({
  122 |   page,
  123 |   baseURL,
  124 | }) => {
  125 |   for (const next of ['https%3A%2F%2Fejemplo.invalid', '%2F%2Fejemplo.invalid']) {
  126 |     await page.goto(`/login?next=${next}`);
  127 |     await signIn(page);
  128 |     await expect(mainHeading(page)).toBeVisible();
  129 |     await expect(page).toHaveURL(`${baseURL}/inicio`);
  130 |     // El siguiente valor se prueba de nuevo sin sesión.
  131 |     await page.evaluate(() => window.localStorage.clear());
  132 |   }
  133 | });
  134 | 
  135 | test('cerrar sesión lleva a /login sin next y una recarga no la recupera', async ({
  136 |   page,
  137 | }) => {
  138 |   await page.goto('/login');
  139 |   await signIn(page);
  140 |   await expect(mainHeading(page)).toBeVisible();
  141 |   // Desde una ruta distinta de /inicio, que sin cierre explícito llevaría `next`.
  142 |   await page.goto('/demanda/solicitudes');
  143 |   await expect(mainHeading(page)).toBeVisible();
  144 | 
  145 |   await logoutButton(page).click();
  146 |   await expect(loginForm(page)).toBeVisible();
  147 |   await expect(page).toHaveURL('/login');
  148 |   expect(
  149 |     await page.evaluate(() => window.localStorage.getItem('authToken')),
  150 |   ).toBeNull();
  151 | 
  152 |   await page.goto('/inicio');
  153 |   await expect(loginForm(page)).toBeVisible();
  154 |   await expect(page).toHaveURL('/login');
  155 | });
  156 | 
```