import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Client } from 'pg';

/**
 * Cambio de contraseña obligatorio (modo jwt): el jefe marca a una persona,
 * la persona entra, solo puede cambiar la contraseña y después usa el portal.
 *
 * Aislamiento (30-pruebas.md): el flujo cambia credenciales, así que usa un
 * usuario propio (`e2e.forzar.<ts>`) con grant INTEGRANTE, creado por SQL y
 * borrado al final con filtro estricto (incluye sus eventos de auditoría). El
 * jefe demo solo inicia sesión por API y marca por `userIds`; NUNCA `all: true`
 * (marcaría a los usuarios demo).
 *
 * Solo corre con E2E_AUTH_MODE=jwt, DATABASE_URL y E2E_JWT_PASSWORD.
 */
test.skip(process.env.E2E_AUTH_MODE !== 'jwt', 'Requiere la API y la web en modo jwt');
const DATABASE_URL = process.env.DATABASE_URL ?? '';
test.skip(DATABASE_URL === '', 'Requiere DATABASE_URL para crear el usuario de prueba');
const JEFE_PASSWORD = process.env.E2E_JWT_PASSWORD ?? '';
test.skip(JEFE_PASSWORD === '', 'Requiere E2E_JWT_PASSWORD (DEV_PASSWORD del seed)');

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const IDENTIFIER_PREFIX = 'e2e.forzar.';
const IDENTIFIER = `${IDENTIFIER_PREFIX}${Date.now()}@demo.local`;
const FIRST_PASSWORD = 'primera-contrasena-e2e';
const NEW_PASSWORD = 'segunda-contrasena-e2e';
const JEFE = 'jefe@demo.local';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

let userId = '';

/** Crea el usuario (sin contraseña) con grant INTEGRANTE y un token de activación. */
async function createTestUser(token: string): Promise<void> {
  await withDb(async (client) => {
    const now = new Date().toISOString();
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (id, identifier, name, active, is_admin, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, true, false, $3::timestamp, $3::timestamp)
       RETURNING id`,
      [IDENTIFIER, 'E2E Forzar contraseña', now],
    );
    userId = user.rows[0].id;
    const role = await client.query<{ id: string }>('SELECT id FROM roles WHERE code = $1', ['INTEGRANTE']);
    const process = await client.query<{ id: string }>('SELECT id FROM processes WHERE code = $1', ['FIBI']);
    await client.query(
      `INSERT INTO grants (id, user_id, role_id, process_id, active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, true, $4::timestamp, $4::timestamp)`,
      [userId, role.rows[0].id, process.rows[0].id, now],
    );
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
       VALUES (gen_random_uuid(), $1, 'USER_INVITATION', $2, $3::timestamp, NULL, (now() at time zone 'utc'))`,
      [userId, createHash('sha256').update(token).digest('hex'), expiresAt],
    );
  });
}

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
      [id, 'USER', id],
    );
    await client.query('DELETE FROM grants WHERE user_id = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
  });
}

async function bearerFor(request: APIRequestContext, identifier: string, password: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, { data: { identifier, password } });
  expect(res.status(), `login de ${identifier}`).toBe(200);
  return `Bearer ${((await res.json()) as { accessToken: string }).accessToken}`;
}

async function force(request: APIRequestContext, enabled: boolean): Promise<void> {
  const jefe = await bearerFor(request, JEFE, JEFE_PASSWORD);
  const res = await request.post(`${API_URL}/users/force-password-change`, {
    headers: { Authorization: jefe },
    data: { userIds: [userId], enabled },
  });
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { updated: number }).updated).toBe(1);
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#identifier').fill(IDENTIFIER);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

const changeHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Cambia tu contraseña' });

test.beforeAll(async ({ request }) => {
  const token = `e2e-forzar-${Date.now()}`;
  await createTestUser(token);
  // Contraseña inicial por el flujo real de activación.
  const res = await request.post(`${API_URL}/auth/reset-password`, {
    data: { token, newPassword: FIRST_PASSWORD },
  });
  expect(res.status()).toBe(200);
});
test.afterAll(deleteTestUser);

test('marcar → login → pantalla obligatoria → cambiar → acceso normal', async ({ page, request }) => {
  await force(request, true);

  // API: con el indicador, el Bearer solo ve su sesión.
  const bearer = await bearerFor(request, IDENTIFIER, FIRST_PASSWORD);
  const blocked = await request.get(`${API_URL}/requests`, { headers: { Authorization: bearer } });
  expect(blocked.status()).toBe(403);
  expect(((await blocked.json()) as { code?: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
  const me = await request.get(`${API_URL}/me/permissions`, { headers: { Authorization: bearer } });
  expect(me.status()).toBe(200);
  expect(((await me.json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(true);

  // UI: el login lleva a la pantalla de cambio, sin menú.
  await signIn(page, FIRST_PASSWORD);
  await expect(changeHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/cambiar-contrasena/);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/inicio');
  await expect(changeHeading(page)).toBeVisible();

  // Errores: actual incorrecta (servidor), igual a la actual y corta (cliente).
  await page.locator('#currentPassword').fill('no-es-la-actual');
  await page.locator('#newPassword').fill(NEW_PASSWORD);
  await page.locator('#confirmPassword').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('La contraseña actual no es correcta.')).toBeVisible();

  await page.locator('#currentPassword').fill(FIRST_PASSWORD);
  await page.locator('#newPassword').fill(FIRST_PASSWORD);
  await page.locator('#confirmPassword').fill(FIRST_PASSWORD);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('La contraseña nueva debe ser distinta de la actual.')).toBeVisible();

  await page.locator('#newPassword').fill('corta');
  await page.locator('#confirmPassword').fill('corta');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeVisible();

  // Cambio válido: sale al portal con el menú y la API vuelve a responder.
  await page.locator('#newPassword').fill(NEW_PASSWORD);
  await page.locator('#confirmPassword').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page).not.toHaveURL(/\/cambiar-contrasena/);
  await expect(page.getByRole('navigation').first()).toBeVisible();
  const ok = await request.get(`${API_URL}/requests`, { headers: { Authorization: bearer } });
  expect(ok.status()).toBe(200);

  // BD: indicador limpio y auditoría de la exigencia y del cambio.
  await withDb(async (client) => {
    const flag = await client.query<{ must_change_password: boolean }>(
      'SELECT must_change_password FROM users WHERE id = $1',
      [userId],
    );
    expect(flag.rows[0].must_change_password).toBe(false);
    const events = await client.query<{ action: string }>(
      'SELECT action FROM audit_events WHERE object_type = $1 AND object_id = $2',
      ['USER', userId],
    );
    const actions = events.rows.map((r) => r.action);
    expect(actions).toContain('PASSWORD_CHANGE_REQUIRED');
    expect(actions).toContain('PASSWORD_CHANGED');
  });
});

test('sesión abierta marcada después: la siguiente navegación lleva a la pantalla; retirar devuelve el acceso', async ({
  page,
  request,
}) => {
  await signIn(page, NEW_PASSWORD);
  await expect(page.getByRole('navigation').first()).toBeVisible();

  await force(request, true);
  await page.goto('/mi-trabajo');
  await expect(changeHeading(page)).toBeVisible();

  await force(request, false);
  await page.goto('/inicio');
  await expect(changeHeading(page)).toHaveCount(0);
  await expect(page.getByRole('navigation').first()).toBeVisible();
});
