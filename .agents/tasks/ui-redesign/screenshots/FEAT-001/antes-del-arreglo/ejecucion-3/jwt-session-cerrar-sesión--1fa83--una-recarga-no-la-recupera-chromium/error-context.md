# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: jwt-session.spec.ts >> cerrar sesión lleva a /login sin next y una recarga no la recupera
- Location: e2e\jwt-session.spec.ts:145:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('main').getByRole('heading', { level: 1 })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('main').getByRole('heading', { level: 1 }) with timeout 5000ms
  - waiting for getByRole('main').getByRole('heading', { level: 1 })

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
  54  | }
  55  | const mainHeading = (page: Page) =>
  56  |   page.getByRole('main').getByRole('heading', { level: 1 });
  57  | const loginForm = (page: Page) => page.locator('#password');
  58  | const expiredNotice = (page: Page) =>
  59  |   page.getByRole('status').filter({ hasText: /expir/i });
  60  | const logoutButton = (page: Page) =>
  61  |   page.getByRole('button', { name: /Cerrar sesi[oó]n/ });
  62  | 
  63  | /** Espera a que terminen las peticiones (y una posible redirección en curso). */
  64  | async function settled(page: Page): Promise<void> {
  65  |   await page.waitForLoadState('networkidle');
  66  | }
  67  | 
  68  | test('recargar una ruta protegida conserva la sesión y la ruta', async ({
  69  |   page,
  70  | }) => {
  71  |   await page.goto('/login');
  72  |   await signIn(page);
  73  |   await expect(mainHeading(page)).toBeVisible();
  74  |   await expect(page).toHaveURL('/inicio');
  75  | 
  76  |   await page.reload();
  77  |   await settled(page);
  78  |   await expect(mainHeading(page)).toBeVisible();
  79  |   await expect(page).toHaveURL('/inicio');
  80  | 
  81  |   await page.goto('/seguimiento/portafolio');
  82  |   await page.reload();
  83  |   await settled(page);
  84  |   await expect(
  85  |     page.getByRole('heading', { level: 1, name: 'Portafolio' }),
  86  |   ).toBeVisible();
  87  |   await expect(page).toHaveURL('/seguimiento/portafolio');
  88  | });
  89  | 
  90  | test('un enlace directo sin sesión vuelve a su ruta tras iniciar sesión', async ({
  91  |   page,
  92  | }) => {
  93  |   await page.goto('/demanda/solicitudes');
  94  |   await expect(loginForm(page)).toBeVisible();
  95  |   await expect(page).toHaveURL('/login?next=%2Fdemanda%2Fsolicitudes');
  96  | 
  97  |   await signIn(page);
  98  |   await expect(mainHeading(page)).toBeVisible();
  99  |   await expect(page).toHaveURL('/demanda/solicitudes');
  100 | });
  101 | 
  102 | test('/login con sesión válida lleva a /inicio', async ({ page }) => {
  103 |   await page.goto('/login');
  104 |   await signIn(page);
  105 |   await expect(mainHeading(page)).toBeVisible();
  106 |   await expect(page).toHaveURL('/inicio');
  107 | 
  108 |   await page.goto('/login');
  109 |   await expect(mainHeading(page)).toBeVisible();
  110 |   await expect(page).toHaveURL('/inicio');
  111 |   await expect(loginForm(page)).toHaveCount(0);
  112 | });
  113 | 
  114 | test('una sesión rechazada lleva a /login?expired=1 con el aviso de sesión expirada', async ({
  115 |   page,
  116 | }) => {
  117 |   await page.goto('/login');
  118 |   await page.evaluate(
  119 |     ([token, user]) => {
  120 |       window.localStorage.setItem('authToken', token);
  121 |       window.localStorage.setItem('authUser', user);
  122 |     },
  123 |     ['token-invalido', JSON.stringify(STORED_USER)] as const,
  124 |   );
  125 | 
  126 |   await page.goto('/inicio');
  127 |   await expect(expiredNotice(page)).toBeVisible();
  128 |   await expect(page).toHaveURL('/login?expired=1');
  129 | });
  130 | 
  131 | test('un next externo se ignora y lleva a /inicio del mismo origen', async ({
  132 |   page,
  133 |   baseURL,
  134 | }) => {
  135 |   for (const next of ['https%3A%2F%2Fejemplo.invalid', '%2F%2Fejemplo.invalid']) {
  136 |     await page.goto(`/login?next=${next}`);
  137 |     await signIn(page);
  138 |     await expect(mainHeading(page)).toBeVisible();
  139 |     await expect(page).toHaveURL(`${baseURL}/inicio`);
  140 |     // El siguiente valor se prueba de nuevo sin sesión.
  141 |     await page.evaluate(() => window.localStorage.clear());
  142 |   }
  143 | });
  144 | 
  145 | test('cerrar sesión lleva a /login sin next y una recarga no la recupera', async ({
  146 |   page,
  147 | }) => {
  148 |   await page.goto('/login');
  149 |   await signIn(page);
  150 |   await expect(mainHeading(page)).toBeVisible();
  151 |   // Desde una ruta distinta de /inicio, que sin cierre explícito llevaría `next`.
  152 |   await page.goto('/demanda/solicitudes');
  153 |   await settled(page);
> 154 |   await expect(mainHeading(page)).toBeVisible();
      |                                   ^ Error: expect(locator).toBeVisible() failed
  155 | 
  156 |   await logoutButton(page).click();
  157 |   await expect(loginForm(page)).toBeVisible();
  158 |   await expect(page).toHaveURL('/login');
  159 |   expect(
  160 |     await page.evaluate(() => window.localStorage.getItem('authToken')),
  161 |   ).toBeNull();
  162 | 
  163 |   await page.goto('/inicio');
  164 |   await expect(loginForm(page)).toBeVisible();
  165 |   await expect(page).toHaveURL('/login');
  166 | });
  167 | 
```