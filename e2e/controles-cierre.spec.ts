import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

/**
 * Oleada 2, PR-D (BL-073: D10 y D11).
 *
 * 1. D10: el cierre tiene un solo camino. «Aprobar GC5» a mano responde 409; el
 *    cierre formal (solicitud del líder, aprobación del jefe) deja GC5 CUMPLIDO.
 * 2. D11: el integrante no registra una validación a nombre de otra persona
 *    (403), el ejecutor debe existir y la fecha no puede ser futura (400), «No
 *    aplica» solo sobre un control pendiente, y una solicitud cerrada congela
 *    sus controles (409).
 *
 * Crea su propia persona y solicitud por la API real (prefijo «E2E»). No toca a
 * los usuarios demo. Con E2E_CAPTURAS_DIR guarda capturas a 1440 y 390 en claro y
 * oscuro.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
const ts = Date.now();
const CLOSED_MESSAGE = 'El proyecto está cerrado; reabre el proyecto para modificar sus controles.';
const GC5_MESSAGE = 'El cierre se solicita y se aprueba desde el cierre del proyecto.';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

async function call(api: APIRequestContext, method: Method, path: string, actor: string, body?: Record<string, unknown>) {
  return api[method](`${API_URL}${path}`, {
    headers: { 'X-Actor-Id': actor },
    ...(body ? { data: body } : {}),
  });
}

async function ok<T = Record<string, unknown>>(
  api: APIRequestContext,
  method: Method,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await call(api, method, path, JEFE, body);
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (res.status() === 204 ? {} : await res.json()) as T;
}

async function expectMessage(res: Awaited<ReturnType<typeof call>>, status: number, text: string): Promise<void> {
  const body = await res.text();
  expect(res.status(), body).toBe(status);
  expect(body).toContain(text);
}

let processId = '';
let requestId = '';
let requestCode = '';
let taskId = '';
let assetId = '';
let userId = '';
const memberIdentifier = `e2e.controles.miembro.${ts}@demo.local`;
const MEMBER_NAME = `E2E Controles ${ts}`;

async function useActor(page: Page, identifier: string): Promise<void> {
  await page.addInitScript((id) => window.localStorage.setItem('actorId', id), identifier);
}

/** Abre Controles con la solicitud y espera el tablero (la primera carga en dev compila la pantalla). */
async function openControls(page: Page): Promise<void> {
  await page.goto(`/administracion/frameworks?requestId=${encodeURIComponent(requestId)}`);
  await page.locator('#gate-GC5-title').waitFor({ timeout: 60_000 });
}

async function captures(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_CAPTURAS_DIR;
  if (!dir) return;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.screenshot({ path: `${dir}/${name}-${scheme}-${width}.png`, fullPage: true });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
}

test.beforeAll(async ({ request }) => {
  const processes = await ok<Array<{ id: string; code: string }>>(request, 'get', '/processes');
  const fibi = processes.find((p) => p.code === 'FIBI');
  expect(fibi, 'el seed debe tener el proceso FIBI').toBeTruthy();
  processId = fibi!.id;

  // Persona de prueba: integrante de FIBI (ve la solicitud, no la gestiona).
  const user = await ok<{ id: string }>(request, 'post', '/users', {
    identifier: memberIdentifier,
    name: MEMBER_NAME,
  });
  userId = user.id;
  await ok(request, 'post', '/grants', { userId, roleCode: 'INTEGRANTE', processId });

  // Solicitud en ejecución con plan autorizado y una tarea.
  const req = await ok<{ id: string; code: string }>(request, 'post', '/requests', {
    title: `E2E controles y cierre ${ts}`,
    mainProcessId: processId,
  });
  requestId = req.id;
  requestCode = req.code;
  await ok(request, 'post', `/requests/${requestId}/triage`, {
    decision: 'CONTINUAR',
    mainProcessId: processId,
    participantProcessIds: [processId],
  });
  const asset = await ok<{ id: string }>(request, 'post', '/assets', {
    processId,
    name: `E2E activo controles ${ts}`,
  });
  assetId = asset.id;
  await ok(request, 'post', `/requests/${requestId}/asset`, { assetId });
  await ok(request, 'post', `/requests/${requestId}/priority`, {
    impact: 3,
    alignment: 3,
    riskControl: 3,
    urgency: 3,
    scope: 3,
    dataAvailability: 3,
    feasibility: 3,
    reuse: 3,
  });
  await ok(request, 'post', `/requests/${requestId}/approval`, { decision: 'APROBAR' });
  const plan = await ok<{ id: string }>(request, 'post', `/requests/${requestId}/plan`, {});
  const phase = await ok<{ id: string }>(request, 'post', `/plans/${plan.id}/phases`, {
    name: 'Fase controles',
    startDate: '2030-01-01',
    endDate: '2030-12-31',
  });
  taskId = (
    await ok<{ id: string }>(request, 'post', `/phases/${phase.id}/tasks`, {
      title: 'Tarea controles',
      responsibleUserId: userId,
      startDate: '2030-02-01',
      endDate: '2030-02-10',
      estimateHours: 4,
    })
  ).id;
  await ok(request, 'post', `/requests/${requestId}/plan/submit`, {});
  await ok(request, 'post', `/requests/${requestId}/plan/authorize`, {});
});

test.describe.serial('Controles y cierre (D10, D11)', () => {
  test('GC5 no se aprueba a mano: responde 409 y la solicitud no se cierra', async ({ request }) => {
    const res = await call(request, 'post', `/requests/${requestId}/gates/GC5/approve`, JEFE, {});
    await expectMessage(res, 409, GC5_MESSAGE);
    const board = await ok<{ operationalState: string }>(request, 'get', `/requests/${requestId}/gates`);
    expect(board.operationalState).not.toBe('CERRADA');
  });

  test('«No aplica» solo sobre un control pendiente', async ({ request }) => {
    await ok(request, 'put', `/requests/${requestId}/governance-route`, { route: 'SIMPLIFICADA' });
    // GC1 ya está CUMPLIDO (derivado del estado): no se puede declarar «No aplica».
    const res = await call(request, 'post', `/requests/${requestId}/gates/GC1/waive`, JEFE, {
      waiverReason: 'Motivo de prueba',
    });
    await expectMessage(res, 409, 'Solo se puede marcar como no aplicable un control pendiente.');
    await ok(request, 'put', `/requests/${requestId}/governance-route`, { route: 'COMPLETA' });
  });

  test('validaciones: ejecutor inexistente y fecha futura dan 400; el integrante solo registra las suyas', async ({
    request,
  }) => {
    const base = {
      validationTypeCode: 'FUNCIONAL_ACEPTACION',
      testCase: 'Caso E2E controles',
      resultCode: 'APROBADA',
      executedByUserId: userId,
      executedAt: new Date(Date.now() - 3600_000).toISOString(),
    };
    const ghost = await call(request, 'post', `/requests/${requestId}/validations`, JEFE, {
      ...base,
      executedByUserId: '00000000-0000-4000-8000-000000000000',
    });
    await expectMessage(ghost, 400, 'no existe o está inactiva');
    const future = await call(request, 'post', `/requests/${requestId}/validations`, JEFE, {
      ...base,
      executedAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    });
    await expectMessage(future, 400, 'no puede ser posterior a hoy');

    const jefeId = (await ok<{ userId: string }>(request, 'get', '/me/permissions')).userId;
    const other = await call(request, 'post', `/requests/${requestId}/validations`, memberIdentifier, {
      ...base,
      executedByUserId: jefeId,
    });
    await expectMessage(other, 403, 'Solo puedes registrar validaciones ejecutadas por ti');
    const own = await call(request, 'post', `/requests/${requestId}/validations`, memberIdentifier, base);
    expect(own.status(), await own.text()).toBe(201);
    // El jefe registra a nombre de otra persona.
    const onBehalf = await call(request, 'post', `/requests/${requestId}/validations`, JEFE, base);
    expect(onBehalf.status(), await onBehalf.text()).toBe(201);
  });

  test('Controles: GC5 enlaza al cierre y el integrante solo se elige a sí mismo como ejecutor', async ({
    page,
  }) => {
    await openControls(page);
    const gc5 = page.locator('li').filter({ has: page.locator('#gate-GC5-title') });
    await expect(gc5).toBeVisible();
    await expect(gc5.getByRole('button', { name: /Aprobar GC5/ })).toHaveCount(0);
    const link = gc5.getByRole('link', { name: 'Ir al cierre del proyecto' });
    await expect(link).toHaveAttribute('href', `/demanda/solicitudes/${requestId}`);
    await expect(page.getByText('Proyecto cerrado')).toHaveCount(0);
    await expectNoSeriousViolations(page);
    await captures(page, 'controles-abierto');
  });

  test('integrante: el ejecutor es solo él mismo', async ({ page }) => {
    await useActor(page, memberIdentifier);
    await openControls(page);
    await page.getByRole('tab', { name: /Validaciones/ }).click();
    await page.getByRole('button', { name: 'Registrar validación' }).click();
    const executor = page.locator('#val-executor');
    await expect(executor).toBeDisabled();
    await expect(executor).toContainText(MEMBER_NAME);
    await expect(page.getByText('Solo puedes registrar validaciones ejecutadas por ti.')).toBeVisible();
    await expect(page.getByText('Otra persona (ingresar id)')).toHaveCount(0);
    await expectNoSeriousViolations(page);
    await captures(page, 'controles-ejecutor-integrante');
  });

  test('jefe: elige entre personas del alcance, sin entrada manual de id', async ({ page }) => {
    await openControls(page);
    await page.getByRole('tab', { name: /Validaciones/ }).click();
    await page.getByRole('button', { name: 'Registrar validación' }).click();
    await expect(page.locator('#val-executor')).toBeEnabled();
    await page.locator('#val-executor').click();
    await expect(page.getByRole('option', { name: MEMBER_NAME })).toBeVisible();
    await expect(page.getByText('Otra persona (ingresar id)')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#val-executor-manual')).toHaveCount(0);
  });

  test('el cierre formal deja GC5 CUMPLIDO y congela los controles', async ({ request }) => {
    // Tarea terminada.
    for (const status of ['EN_CURSO', 'EN_REVISION', 'TERMINADA']) {
      await ok(request, 'patch', `/tasks/${taskId}/status`, { status, progress: 100, evidenceUrl: 'https://example.com/evidencia' });
    }
    // Documentación de cierre aprobada.
    const doc = await ok<{ id: string }>(request, 'post', '/documents', {
      assetId,
      title: `E2E acta de cierre ${ts}`,
      categoryCode: 'CIERRE',
      requestId,
      content: '# Acta de cierre\n\nResultados y lecciones aprendidas.',
    });
    await ok(request, 'post', `/documents/${doc.id}/submit-approval`, {});
    await ok(request, 'post', `/documents/${doc.id}/review`, { decision: 'APROBAR' });
    // Antes del cierre, GC5 sigue pendiente.
    const before = await ok<{ gates: Array<{ gateCode: string; status: string }> }>(
      request,
      'get',
      `/requests/${requestId}/gates`,
    );
    expect(before.gates.find((g) => g.gateCode === 'GC5')?.status).toBe('PENDIENTE');

    await ok(request, 'post', `/requests/${requestId}/closure`, {});
    await ok(request, 'post', `/requests/${requestId}/closure/decision`, { decision: 'APROBAR' });

    const board = await ok<{
      operationalState: string;
      gates: Array<{ gateCode: string; status: string; decidedByName: string | null }>;
    }>(request, 'get', `/requests/${requestId}/gates`);
    expect(board.operationalState).toBe('CERRADA');
    const gc5 = board.gates.find((g) => g.gateCode === 'GC5');
    expect(gc5?.status).toBe('CUMPLIDO');
    expect(gc5?.decidedByName).toBeTruthy();

    // Congelado: 409 en español en cada mutación de controles.
    const frozen: Array<[Method, string, Record<string, unknown>]> = [
      ['post', `/requests/${requestId}/gates/GC4/waive`, { waiverReason: 'x' }],
      ['put', `/requests/${requestId}/governance-route`, { route: 'COMPLETA' }],
      ['post', `/requests/${requestId}/gates/GC4/pending-items`, { description: 'x' }],
      ['post', `/requests/${requestId}/gates/GC4/request-validation`, {}],
      ['post', `/requests/${requestId}/block`, { blockReason: 'x' }],
      ['post', `/requests/${requestId}/gates/GC4/approve`, {}],
      [
        'post',
        `/requests/${requestId}/validations`,
        {
          validationTypeCode: 'FUNCIONAL_ACEPTACION',
          testCase: 'x',
          resultCode: 'APROBADA',
          executedByUserId: userId,
          executedAt: new Date(Date.now() - 3600_000).toISOString(),
        },
      ],
    ];
    for (const [method, path, body] of frozen) {
      await expectMessage(await call(request, method, path, JEFE, body), 409, CLOSED_MESSAGE);
    }
    // GC5 sobre el proyecto cerrado solo refleja el cierre: no falla ni cambia nada.
    const gc5Again = await call(request, 'post', `/requests/${requestId}/gates/GC5/approve`, JEFE, {});
    expect(gc5Again.status(), await gc5Again.text()).toBe(201);
  });

  test('Controles con el proyecto cerrado: aviso, GC5 cumplido y acciones no disponibles con motivo', async ({
    page,
  }) => {
    await openControls(page);
    await expect(page.getByRole('status').filter({ hasText: 'Proyecto cerrado' })).toBeVisible();
    await expect(page.getByText('Cumplido por el cierre formal del proyecto.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a la ficha' })).toHaveAttribute(
      'href',
      `/demanda/solicitudes/${requestId}`,
    );
    for (const name of ['Enviar a validación', 'Marcar lista para liberar', 'Confirmar estabilización', 'Guardar ruta']) {
      const button = page.getByRole('button', { name });
      await expect(button).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(page.getByText(CLOSED_MESSAGE).first()).toBeVisible();
    const approveGc4 = page.getByRole('button', { name: 'Aprobar GC4' });
    await expect(approveGc4).toHaveAttribute('aria-disabled', 'true');
    await expectNoSeriousViolations(page);
    await captures(page, 'controles-cerrado');
    await page.getByRole('tab', { name: /Validaciones/ }).click();
    await expect(page.getByRole('button', { name: 'Registrar validación' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(CLOSED_MESSAGE).first()).toBeVisible();
    void requestCode;
  });
});
