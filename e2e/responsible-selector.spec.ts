import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Regresión: el selector de "Responsable" de los formularios de dominio
 * (tareas del plan, activos, documentos) debe poblarse desde el endpoint de
 * personas EN ALCANCE `GET /coordination/people` —disponible para los tres
 * roles— y NUNCA desde `GET /users`, que es administración de equipo y solo el
 * JEFE puede consultar (devuelve 403 a líder/integrante).
 *
 * El bug original: el selector usaba /users; abierto por un LÍDER (justo el rol
 * que gestiona el plan y asigna responsables) recibía 403 y quedaba vacío, de
 * modo que no se podía asignar a nadie. Este test lo ejercita como líder.
 *
 * Se usa el diálogo «Nueva tarea» del Plan (/seguimiento/plan): monta ese
 * selector y es el flujo real donde el líder asigna responsables. El
 * prerrequisito (solicitud comprometida con plan y una fase) lo crea la API
 * real con el actor jefe. Activos no sirve: por gobernanza solo el jefe de
 * área crea activos. El módulo Novedades, que se usaba antes, se retiró.
 */

// Origen de la web: WEB_ORIGIN o, si falta, E2E_WEB_URL (el mismo de
// playwright.config.ts). Sin variables vale lo mismo que en la CI.
const WEB_ORIGIN =
  process.env.WEB_ORIGIN ?? process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
// Líder de proceso BI (seed): NO es jefe, por lo que /users le daría 403.
const LIDER_IDENTIFIER = 'lider@demo.local';
const JEFE_HEADERS = { 'X-Actor-Id': 'jefe@demo.local' } as const;

async function send(
  api: APIRequestContext,
  method: 'post' | 'get',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await api[method](`${API_URL}${path}`, { headers: JEFE_HEADERS, data: body });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

const ts = Date.now();
let requestId = '';

test.beforeAll(async ({ request }) => {
  const processes = (await send(request, 'get', '/processes')) as unknown as Array<{ id: string }>;
  const mainProcessId = processes[0].id;
  const req = await send(request, 'post', '/requests', { title: `E2E selector responsable ${ts}`, mainProcessId });
  requestId = req.id as string;
  await send(request, 'post', `/requests/${requestId}/triage`, { decision: 'CONTINUAR' });
  const asset = await send(request, 'post', '/assets', { processId: mainProcessId, name: `Activo selector ${ts}` });
  await send(request, 'post', `/requests/${requestId}/asset`, { assetId: asset.id as string });
  await send(request, 'post', `/requests/${requestId}/priority`, {
    impact: 3, alignment: 3, riskControl: 3, urgency: 3, scope: 3, dataAvailability: 3, feasibility: 3, reuse: 3,
  });
  await send(request, 'post', `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  const plan = await send(request, 'post', `/requests/${requestId}/plan`, {});
  await send(request, 'post', `/plans/${plan.id as string}/phases`, { name: 'Fase selector' });
});

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

  await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);
  // Abre el diálogo de nueva tarea (monta el selector de responsable).
  await page
    .getByRole('button', { name: /Nueva tarea/i })
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