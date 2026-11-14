import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

/**
 * Flujo de auto-login tras restablecer/activar contraseña (modo jwt).
 *
 * Regresión del reporte original: al restablecer la contraseña el usuario
 * quedaba en una pantalla con botón «Ir a iniciar sesión» y tenía que teclear
 * de nuevo usuario y contraseña. Ahora POST /auth/reset-password devuelve la
 * misma sesión que el login y el formulario inicia sesión y redirige al módulo
 * (/inicio), sin pasar por /login. Aplica igual a la activación de cuenta
 * (mismo endpoint, token con purpose USER_INVITATION).
 *
 * Aislamiento: el flujo cambia la contraseña, así que NO opera sobre los
 * usuarios demo del seed. La prueba crea su propio usuario (`e2e.reset.<ts>`)
 * con un grant INTEGRANTE, y lo elimina al final con filtro estricto por su
 * identificador (ver `30-pruebas.md`).
 *
 * Estrategia de token (design §Testabilidad): `auth_tokens` solo persiste el
 * sha256 del token en claro; el valor nunca se guarda, así que no se puede
 * «capturar» el emitido por forgot-password. En su lugar el test SIEMBRA la
 * fila: genera un valor en claro conocido, inserta en `auth_tokens` el
 * sha256(valor) para el usuario de prueba con el purpose y expiración
 * correspondientes, y abre la pantalla con ?token=<valor>. Reutiliza el mismo
 * sha256 que el backend (apps/api/.../auth-token.util.ts) y DATABASE_URL del
 * entorno, sin añadir mock SMTP ni hooks de test nuevos.
 *
 * Fechas: las columnas son `timestamp` sin zona. Se siembran como texto ISO en
 * UTC; un `Date` lo serializa `pg` en hora local (UTC-5 en Windows) y el token
 * caducaría antes de tiempo.
 *
 * Solo corre con E2E_AUTH_MODE=jwt y con la API (AUTH_MODE=jwt), la web
 * (NEXT_PUBLIC_AUTH_MODE=jwt) y PostgreSQL levantados y accesibles vía
 * DATABASE_URL. Fuera de ese entorno los casos quedan skipped por diseño.
 */
test.skip(
  process.env.E2E_AUTH_MODE !== 'jwt',
  'Requiere la API y la web en modo jwt',
);

const DATABASE_URL = process.env.DATABASE_URL ?? '';
test.skip(
  DATABASE_URL === '',
  'Requiere DATABASE_URL para sembrar auth_tokens',
);

/** Prefijo que identifica (y acota la limpieza de) los usuarios de este spec. */
const IDENTIFIER_PREFIX = 'e2e.reset.';
/** Usuario de prueba propio, con identificador único por ejecución. */
const IDENTIFIER = `${IDENTIFIER_PREFIX}${Date.now()}@demo.local`;
/** Proceso del seed sobre el que el usuario de prueba es INTEGRANTE. */
const GRANT_PROCESS_CODE = 'FIBI';
/** Contraseña nueva que define el formulario; cumple el mínimo del backend. */
const NEW_PASSWORD = 'nueva-contrasena-e2e';

// Cada test parte de un navegador sin sesión: ni token jwt ni actor de dev.
test.use({ storageState: { cookies: [], origins: [] } });

/** sha256 (hex) de un token en claro, idéntico al backend (hashToken). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Conexión puntual a PostgreSQL para sembrar/limpiar filas de prueba. */
async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Crea el usuario de prueba (sin contraseña) con un grant INTEGRANTE. */
async function createTestUser(): Promise<void> {
  await withDb(async (client) => {
    const now = new Date().toISOString();
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (id, identifier, name, active, is_admin, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, true, false, $3::timestamp, $3::timestamp)
       RETURNING id`,
      [IDENTIFIER, 'E2E Restablecer contraseña', now],
    );
    const role = await client.query<{ id: string }>(
      'SELECT id FROM roles WHERE code = $1 LIMIT 1',
      ['INTEGRANTE'],
    );
    const process = await client.query<{ id: string }>(
      'SELECT id FROM processes WHERE code = $1 LIMIT 1',
      [GRANT_PROCESS_CODE],
    );
    expect(role.rows[0], 'El seed debe tener el rol INTEGRANTE').toBeTruthy();
    expect(
      process.rows[0],
      `El seed debe tener el proceso ${GRANT_PROCESS_CODE}`,
    ).toBeTruthy();
    await client.query(
      `INSERT INTO grants (id, user_id, role_id, process_id, active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, true, $4::timestamp, $4::timestamp)`,
      [user.rows[0].id, role.rows[0].id, process.rows[0].id, now],
    );
  });
}

/** Elimina el usuario de prueba y lo que colgaba de él (filtro estricto). */
async function deleteTestUser(): Promise<void> {
  await withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE identifier = $1 AND identifier LIKE $2',
      [IDENTIFIER, `${IDENTIFIER_PREFIX}%`],
    );
    const id = result.rows[0]?.id;
    if (!id) return;
    await client.query('DELETE FROM auth_tokens WHERE user_id = $1', [id]);
    await client.query('DELETE FROM notifications WHERE user_id = $1', [id]);
    await client.query(
      'DELETE FROM audit_events WHERE actor_user_id = $1 OR (object_type = $2 AND object_id = $3)',
      [id, 'User', id],
    );
    await client.query('DELETE FROM grants WHERE user_id = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
  });
}

test.beforeAll(createTestUser);
test.afterAll(deleteTestUser);

/** Resuelve el id del usuario de prueba por su identifier. */
async function userIdByIdentifier(client: Client): Promise<string> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE identifier = $1 LIMIT 1',
    [IDENTIFIER],
  );
  const id = result.rows[0]?.id;
  expect(id, `Debe existir el usuario de prueba ${IDENTIFIER}`).toBeTruthy();
  return id as string;
}

interface SeedTokenOptions {
  readonly purpose: 'PASSWORD_RESET' | 'USER_INVITATION';
  /** Minutos hasta la expiración; negativo = ya caducado. */
  readonly expiresInMinutes: number;
  /** Si true, marca usedAt (token ya consumido). */
  readonly used?: boolean;
}

/**
 * Siembra una fila en `auth_tokens` para el usuario de prueba. Limpia tokens
 * previos del mismo usuario+purpose para que la fila sembrada sea la única
 * vigente. Las fechas van como texto ISO (UTC) casteado a `timestamp`.
 */
async function seedToken(
  token: string,
  options: SeedTokenOptions,
): Promise<void> {
  await withDb(async (client) => {
    const userId = await userIdByIdentifier(client);
    await client.query(
      'DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2',
      [userId, options.purpose],
    );
    const expiresAt = new Date(
      Date.now() + options.expiresInMinutes * 60 * 1000,
    ).toISOString();
    const usedAt = options.used ? new Date().toISOString() : null;
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamp, $5::timestamp, (now() at time zone 'utc'))`,
      [userId, options.purpose, hashToken(token), expiresAt, usedAt],
    );
  });
}

const SESSION_COOKIE = 'portal_session';

/** La sesión es una cookie HttpOnly Lax emitida por la API. */
async function expectSessionCookie(context: BrowserContext): Promise<void> {
  const cookie = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
}

/** Ni el token ni el usuario se guardan en el almacenamiento del navegador. */
async function expectNoTokenInStorage(page: Page): Promise<void> {
  const stored = await page.evaluate(() => ({
    token: window.localStorage.getItem('authToken'),
    user: window.localStorage.getItem('authUser'),
    session: Object.keys(window.sessionStorage),
  }));
  expect(stored.token).toBeNull();
  expect(stored.user).toBeNull();
  expect(stored.session).toEqual([]);
}

const panelHeading = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('heading', { level: 1, name: 'Panel del área', exact: true });

/** Define la contraseña en el formulario compartido y envía. */
async function fillPasswordAndSubmit(page: Page): Promise<void> {
  await page.locator('#newPassword').fill(NEW_PASSWORD);
  await page.locator('#confirmPassword').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /Guardar contraseña|Activar cuenta/ }).click();
}

test('restablecer contraseña inicia sesión y aterriza en /inicio sin pasar por /login', async ({
  page,
  context,
}) => {
  const token = `e2e-reset-${Date.now()}`;
  await seedToken(token, { purpose: 'PASSWORD_RESET', expiresInMinutes: 30 });

  await page.goto(`/restablecer-contrasena?token=${encodeURIComponent(token)}`);
  await fillPasswordAndSubmit(page);

  await expect(panelHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');
  // Auto-login real: la API dejó la cookie HttpOnly y el token no está en JS.
  await expectSessionCookie(context);
  await expectNoTokenInStorage(page);
});

test('activar cuenta inicia sesión y aterriza en /inicio sin pasar por /login', async ({
  page,
  context,
}) => {
  const token = `e2e-activate-${Date.now()}`;
  await seedToken(token, { purpose: 'USER_INVITATION', expiresInMinutes: 30 });

  await page.goto(`/activar-cuenta?token=${encodeURIComponent(token)}`);
  await fillPasswordAndSubmit(page);

  await expect(panelHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');
  await expectSessionCookie(context);
  await expectNoTokenInStorage(page);
});

test('token caducado muestra el error y NO redirige ni inicia sesión', async ({
  page,
  context,
}) => {
  const token = `e2e-expired-${Date.now()}`;
  await seedToken(token, { purpose: 'PASSWORD_RESET', expiresInMinutes: -5 });

  await page.goto(`/restablecer-contrasena?token=${encodeURIComponent(token)}`);
  await fillPasswordAndSubmit(page);

  await expect(
    page.getByText('El enlace ha caducado o ya fue utilizado. Solicita uno nuevo.'),
  ).toBeVisible();
  await expect(page).toHaveURL(
    `/restablecer-contrasena?token=${encodeURIComponent(token)}`,
  );
  expect((await context.cookies()).find((c) => c.name === 'portal_session')).toBeUndefined();
  await expectNoTokenInStorage(page);
});
