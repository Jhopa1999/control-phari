import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

/**
 * Flujo de auto-login tras restablecer/activar contraseÃ±a (modo jwt).
 *
 * RegresiÃ³n del reporte original: al restablecer la contraseÃ±a el usuario
 * quedaba en una pantalla con botÃ³n Â«Ir a iniciar sesiÃ³nÂ» y tenÃ­a que teclear
 * de nuevo usuario y contraseÃ±a. Ahora POST /auth/reset-password devuelve la
 * misma sesiÃ³n que el login y el formulario inicia sesiÃ³n y redirige al mÃ³dulo
 * (/inicio), sin pasar por /login. Aplica igual a la activaciÃ³n de cuenta
 * (mismo endpoint, token con purpose USER_INVITATION).
 *
 * Estrategia de token (design Â§Testabilidad): `auth_tokens` solo persiste el
 * sha256 del token en claro; el valor nunca se guarda, asÃ­ que no se puede
 * Â«capturarÂ» el emitido por forgot-password. En su lugar el test SIEMBRA la
 * fila: genera un valor en claro conocido, inserta en `auth_tokens` el
 * sha256(valor) para el usuario del seed con el purpose y expiraciÃ³n
 * correspondientes, y abre la pantalla con ?token=<valor>. Reutiliza el mismo
 * sha256 que el backend (apps/api/.../auth-token.util.ts) y DATABASE_URL del
 * entorno, sin aÃ±adir mock SMTP ni hooks de test nuevos.
 *
 * Solo corre con E2E_AUTH_MODE=jwt y con la API (AUTH_MODE=jwt), la web
 * (NEXT_PUBLIC_AUTH_MODE=jwt) y PostgreSQL levantados y accesibles vÃ­a
 * DATABASE_URL. Fuera de ese entorno los casos quedan skipped por diseÃ±o.
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

/** Usuario del seed (apps/api/prisma/seed.ts) sobre el que se opera. */
const IDENTIFIER = process.env.E2E_JWT_IDENTIFIER ?? 'jefe@demo.local';
/** ContraseÃ±a nueva que define el formulario; cumple el mÃ­nimo del backend. */
const NEW_PASSWORD = 'nueva-contrasena-e2e';

// Cada test parte de un navegador sin sesiÃ³n: ni token jwt ni actor de dev.
test.use({ storageState: { cookies: [], origins: [] } });

/** sha256 (hex) de un token en claro, idÃ©ntico al backend (hashToken). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** ConexiÃ³n puntual a PostgreSQL para sembrar/limpiar filas de prueba. */
async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Resuelve el id del usuario del seed por su identifier. */
async function userIdByIdentifier(client: Client): Promise<string> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE identifier = $1 LIMIT 1',
    [IDENTIFIER],
  );
  const id = result.rows[0]?.id;
  expect(id, `El seed debe tener el usuario ${IDENTIFIER}`).toBeTruthy();
  return id as string;
}

interface SeedTokenOptions {
  readonly purpose: 'PASSWORD_RESET' | 'USER_INVITATION';
  /** Minutos hasta la expiraciÃ³n; negativo = ya caducado. */
  readonly expiresInMinutes: number;
  /** Si true, marca usedAt (token ya consumido). */
  readonly used?: boolean;
}

/**
 * Siembra una fila en `auth_tokens` para el usuario del seed y devuelve el
 * token en claro para usarlo en la URL. Limpia tokens previos del mismo
 * usuario+purpose para que la fila sembrada sea la Ãºnica vigente.
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
    );
    const usedAt = options.used ? new Date() : null;
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
      [userId, options.purpose, hashToken(token), expiresAt, usedAt],
    );
  });
}

const SESSION_COOKIE = 'portal_session';

/** La sesiÃ³n es una cookie HttpOnly Lax emitida por la API. */
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
    .getByRole('heading', { level: 1, name: 'Panel del Ã¡rea', exact: true });

/** Define la contraseÃ±a en el formulario compartido y envÃ­a. */
async function fillPasswordAndSubmit(page: Page): Promise<void> {
  await page.locator('#newPassword').fill(NEW_PASSWORD);
  await page.locator('#confirmPassword').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /Guardar contraseÃ±a|Activar cuenta/ }).click();
}

test('restablecer contraseÃ±a inicia sesiÃ³n y aterriza en /inicio sin pasar por /login', async ({
  page,
  context,
}) => {
  const token = `e2e-reset-${Date.now()}`;
  await seedToken(token, { purpose: 'PASSWORD_RESET', expiresInMinutes: 30 });

  await page.goto(`/restablecer-contrasena?token=${encodeURIComponent(token)}`);
  await fillPasswordAndSubmit(page);

  await expect(panelHeading(page)).toBeVisible();
  await expect(page).toHaveURL('/inicio');
  // Auto-login real: la API dejÃ³ la cookie HttpOnly y el token no estÃ¡ en JS.
  await expectSessionCookie(context);
  await expectNoTokenInStorage(page);
});

test('activar cuenta inicia sesiÃ³n y aterriza en /inicio sin pasar por /login', async ({
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

test('token caducado muestra el error y NO redirige ni inicia sesiÃ³n', async ({
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
