import { expect, test } from '@playwright/test';

/**
 * Regresión: el selector de "Responsable" de los formularios de dominio
 * (tareas del plan, activos, documentos) debe poblarse desde el endpoint de
 * personas EN ALCANCE `GET /coordination/people` —disponible para los tres
 * roles— y NUNCA desde `GET /users`, que es administración de equipo y solo el
 * JEFE_AREA puede consultar (devuelve 403 a líder/integrante).
 *
 * El bug original: el selector usaba /users; abierto por un LÍDER (justo el rol
 * que gestiona el plan y asigna responsables) recibía 403 y quedaba vacío, de
 * modo que no se podía asignar a nadie. Este test lo ejercita como líder.
 *
 * Se usa el formulario de Novedades (/seguimiento/novedades) porque cualquier
 * rol puede abrirlo y monta ese selector sin precondiciones de flujo (no
 * requiere una solicitud comprometida ni un plan con fases). Activos ya no
 * sirve: por gobernanza solo el jefe de área crea activos.
 */

// Origen de la web: WEB_ORIGIN o, si falta, E2E_WEB_URL (el mismo de
// playwright.config.ts). Sin variables vale lo mismo que en la CI.
const WEB_ORIGIN =
  process.env.WEB_ORIGIN ?? process.env.E2E_WEB_URL ?? 'http://localhost:3000';
// Líder de proceso BI (seed): NO es jefe, por lo que /users le daría 403.
const LIDER_IDENTIFIER = 'lider@demo.local';

// Fija el actor de desarrollo (líder) en localStorage antes de cargar la app,
// igual que hace el selector del portal; el middleware del api-client lo
// convierte en la cabecera X-Actor-Id en cada petición.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ([origin, actor]) => {
      if (window.location.origin === origin) {
        window.localStorage.setItem('actorId', actor);
      }
    },
    [WEB_ORIGIN, LIDER_IDENTIFIER] as const,
  );
});

test('el selector de responsable se puebla vía /coordination/people para un líder (no /users)', async ({
  page,
}) => {
  // Capturamos las peticiones de personas que dispara el formulario.
  const peopleRequests: string[] = [];
  let usersForbidden = false;
  page.on('response', (r) => {
    const url = r.url();
    if (url.includes('/coordination/people')) {
      peopleRequests.push(`coordination:${r.status()}`);
    }
    if (/\/users(\?|$)/.test(url) && r.request().method() === 'GET') {
      peopleRequests.push(`users:${r.status()}`);
      if (r.status() === 403) usersForbidden = true;
    }
  });

  await page.goto('/seguimiento/novedades');

  // Abre el formulario de nueva novedad (monta el selector de responsable).
  await page
    .getByRole('button', { name: /Nueva novedad/i })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // La respuesta de /coordination/people llegó con 200 (personas en alcance).
  await expect
    .poll(() => peopleRequests.some((e) => e === 'coordination:200'))
    .toBe(true);

  // Y NO se consultó /users (o si se hiciera, sería el 403 que rompía el flujo):
  // el fix garantiza que el selector no depende de /users.
  expect(usersForbidden).toBe(false);
  expect(peopleRequests.some((e) => e.startsWith('users:'))).toBe(false);

  // El selector de Responsable ofrece opciones reales (no queda vacío):
  // al menos el propio líder debe aparecer entre las personas en alcance.
  await dialog.getByLabel('Responsable').click();
  const options = page.getByRole('option');
  await expect(options.filter({ hasText: 'Lider Generico' })).toBeVisible();
});
