import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Oleada 2, PR-B (D6 y validaciones del plan, BL-065).
 *
 * El compromiso es obligatorio para enviar el plan a autorización y llega
 * precargado con la fecha fin de la última tarea como valor editable. La API
 * rechaza (400) un periodo invertido y un nombre de fase vacío.
 *
 * Crea su propia persona y solicitud por la API real (prefijo «E2E»). No toca a
 * los usuarios demo. Con E2E_CAPTURAS_DIR guarda capturas a 1440 y 390 en claro y
 * oscuro.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
const ts = Date.now();

async function call(
  api: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: Record<string, unknown>,
) {
  return api[method](`${API_URL}${path}`, {
    headers: { 'X-Actor-Id': JEFE },
    ...(body ? { data: body } : {}),
  });
}

async function ok<T = Record<string, unknown>>(
  api: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await call(api, method, path, body);
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (res.status() === 204 ? {} : await res.json()) as T;
}

let requestId = '';
let planId = '';
let phaseId = '';

test.beforeAll(async ({ request }) => {
  const processes = await ok<Array<{ id: string; code: string }>>(request, 'get', '/processes');
  const fibi = processes.find((p) => p.code === 'FIBI');
  expect(fibi, 'el seed debe tener el proceso FIBI').toBeTruthy();
  const user = await ok<{ id: string }>(request, 'post', '/users', {
    identifier: `e2e.compromiso.${ts}@demo.local`,
    name: `E2E Compromiso ${ts}`,
  });
  await ok(request, 'post', '/grants', { userId: user.id, roleCode: 'INTEGRANTE', processId: fibi!.id });

  const req = await ok<{ id: string }>(request, 'post', '/requests', {
    title: `E2E compromiso del plan ${ts}`,
    mainProcessId: fibi!.id,
  });
  requestId = req.id;
  await ok(request, 'post', `/requests/${requestId}/triage`, {
    decision: 'CONTINUAR',
    mainProcessId: fibi!.id,
    participantProcessIds: [fibi!.id],
  });
  const asset = await ok<{ id: string }>(request, 'post', '/assets', {
    processId: fibi!.id,
    name: `E2E Activo compromiso ${ts}`,
  });
  await ok(request, 'post', `/requests/${requestId}/asset`, { assetId: asset.id });
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
  planId = (await ok<{ id: string }>(request, 'post', `/requests/${requestId}/plan`, {})).id;
  phaseId = (
    await ok<{ id: string }>(request, 'post', `/plans/${planId}/phases`, {
      name: 'Fase compromiso',
      startDate: '2030-01-01',
      endDate: '2030-12-31',
    })
  ).id;
  for (const [title, endDate] of [
    ['Tarea temprana', '2030-02-10'],
    ['Tarea final', '2030-03-15'],
  ]) {
    await ok(request, 'post', `/phases/${phaseId}/tasks`, {
      title,
      responsibleUserId: user.id,
      startDate: '2030-02-01',
      endDate,
      estimateHours: 4,
    });
  }
});

test.describe.serial('Plan: compromiso obligatorio para enviar (D6)', () => {
  test('la API valida periodo y nombre de fase, y la guía sugiere el compromiso', async ({ request }) => {
    const inverted = await call(request, 'patch', `/requests/${requestId}/plan`, {
      periodStart: '2030-06-10',
      periodEnd: '2030-06-01',
    });
    expect(inverted.status()).toBe(400);
    expect(await inverted.text()).toContain('no puede ser anterior a su fecha de inicio');

    for (const name of ['', '   ']) {
      const res = await call(request, 'post', `/plans/${planId}/phases`, { name });
      expect(res.status(), `nombre «${name}»`).toBe(400);
      expect(await res.text()).toContain('El nombre de la fase es obligatorio.');
    }

    const guide = await ok<{
      canSubmit: boolean;
      pendings: Array<{ code: string }>;
      suggestedCommitmentDate: string | null;
    }>(request, 'get', `/requests/${requestId}/plan/guide`);
    expect(guide.canSubmit).toBe(false);
    expect(guide.pendings.map((p) => p.code)).toEqual(['NO_COMMITMENT']);
    expect(guide.suggestedCommitmentDate?.startsWith('2030-03-15')).toBe(true);

    const submit = await call(request, 'post', `/requests/${requestId}/plan/submit`, {});
    expect(submit.status()).toBe(409);
    expect(await submit.text()).toContain('El plan necesita la fecha de compromiso.');
  });

  test('la web precarga la sugerida, guarda el compromiso y envía el plan', async ({ page }, testInfo) => {
    await page.goto(`/seguimiento/plan?requestId=${encodeURIComponent(requestId)}`);

    const card = page.getByRole('region', { name: 'Datos del plan' });
    const commitment = card.getByLabel(/Fecha de compromiso/);
    // La primera carga lista las solicitudes y puede tardar con una BD grande.
    await expect(commitment).toHaveValue('2030-03-15', { timeout: 20_000 });
    await expect(card.getByText('Sugerida, sin guardar')).toBeVisible();
    await expect(page.getByText('Falta la fecha de compromiso.')).toBeVisible();
    const send = page.getByRole('button', { name: 'Enviar a autorización' });
    await expect(send).toHaveAttribute('aria-disabled', 'true');

    const dir = process.env.E2E_CAPTURAS_DIR;
    async function capturar(nombre: string): Promise<void> {
      if (!dir) return;
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          await page.screenshot({ path: `${dir}/${nombre}-${scheme}-${width}.png`, fullPage: true });
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await capturar('plan-compromiso-precargado');

    const results = await new AxeBuilder({ page }).disableRules(['label-content-name-mismatch']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

    // «Ir al compromiso» lleva el foco al campo.
    await page.getByRole('button', { name: 'Ir al compromiso' }).click();
    await expect(commitment).toBeFocused();

    // Periodo invertido: el error aparece junto al campo y no se llama a la API.
    await card.getByLabel('Inicio del periodo').fill('2030-06-10');
    await card.getByLabel('Fin del periodo').fill('2030-06-01');
    await card.getByRole('button', { name: 'Guardar datos del plan' }).click();
    await expect(card.getByText('La fecha de fin del periodo no puede ser anterior al inicio.')).toBeVisible();
    await capturar('plan-compromiso-error-periodo');
    await card.getByLabel('Fin del periodo').fill('2030-06-30');

    // El valor sugerido es editable: se cambia y se guarda.
    await commitment.fill('2030-04-01');
    await expect(card.getByText('Sugerida, sin guardar')).toHaveCount(0);
    await card.getByRole('button', { name: 'Guardar datos del plan' }).click();
    await expect(page.getByText('Datos del plan guardados.').first()).toBeVisible();
    await expect(page.getByText('Falta la fecha de compromiso.')).toHaveCount(0);
    await expect(commitment).toHaveValue('2030-04-01');
    await expect(send).not.toHaveAttribute('aria-disabled', 'true');
    await capturar('plan-compromiso-guardado');

    // Envío: el diálogo menciona el compromiso.
    await send.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Compromiso:');
    await dialog.getByRole('button', { name: 'Enviar a autorización' }).click();
    await expect(page.getByText('Plan enviado a autorización.').first()).toBeVisible();
    // Con el plan en autorización la tarjeta ya no se pinta.
    await expect(page.getByRole('region', { name: 'Datos del plan' })).toHaveCount(0);
    await capturar('plan-compromiso-no-editable');
    void testInfo;
  });
});
