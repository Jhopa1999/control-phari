import { expect, test } from '@playwright/test';

/**
 * Cabeceras de seguridad de la web (Next) y de la API (BL-017). Corre en
 * cualquier modo de autenticación: solo hace peticiones HTTP sin sesión.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

test.use({ storageState: { cookies: [], origins: [] } });

test('la web envía CSP, anti-iframe, nosniff, Referrer-Policy y Permissions-Policy', async ({
  request,
}) => {
  const response = await request.get('/login');
  const headers = response.headers();

  const csp = headers['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("connect-src 'self'");
  // 'unsafe-eval' solo existe en `next dev`; el build de producción no lo lleva.
  // `ws:` en connect-src (HMR) marca el servidor de desarrollo.
  const isDev = /\bws:/.test(csp);
  if (isDev) expect(csp).toContain("'unsafe-eval'");
  else expect(csp).not.toContain("'unsafe-eval'");

  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('la web solo envía HSTS cuando la petición llega por https', async ({ request }) => {
  const plain = await request.get('/login');
  expect(plain.headers()['strict-transport-security']).toBeUndefined();

  const secure = await request.get('/login', {
    headers: { 'x-forwarded-proto': 'https' },
  });
  expect(secure.headers()['strict-transport-security']).toContain('max-age=');
  expect(secure.headers()['strict-transport-security']).not.toContain('includeSubDomains');
});

test('la API envía nosniff, anti-iframe, Referrer-Policy y CSP, sin x-powered-by', async ({
  request,
}) => {
  const response = await request.get(`${API_URL}/health`);
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['content-security-policy']).toContain("default-src 'none'");
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['strict-transport-security']).toBeUndefined();
});
