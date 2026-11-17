import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

/**
 * Seguimiento · D16 (oleada 2, PR-E): la API rechaza un diario de fecha futura,
 * un diario enviado sin actividades, un semanal de semana futura y un semanal
 * enviado sin texto; la web explica el motivo junto al botón.
 *
 * Modo dev-header: el actor por defecto es el jefe. Los datos llevan fechas
 * pasadas distintas por ejecución y se retiran al terminar (el semanal no tiene
 * DELETE en la API: se borra por id con DATABASE_URL, si está definida).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
const TIME_ZONE = 'America/Lima';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

const ts = Date.now();

function limaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/** Fecha (YYYY-MM-DD) `days` días después (o antes, si es negativo) de hoy en Lima. */
function shiftDay(days: number): string {
  const [y, m, d] = limaToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Días atrás distintos por ejecución (rango 400-690) para no chocar con otros diarios.
const base = 400 + (Math.floor(ts / 1000) % 290);
const DATE_DAILY_EMPTY = shiftDay(-base);
const DATE_DAILY_OK = shiftDay(-(base + 1));
// Semanas pasadas: múltiplos de 7 días, únicas por ejecución.
const WEEK_API = shiftDay(-7 * (60 + (Math.floor(ts / 1000) % 40)));
const WEEK_UI = shiftDay(-7 * (110 + (Math.floor(ts / 1000) % 40)));

const created: { dailyLogs: string[]; weeklyReports: string[] } = {
  dailyLogs: [],
  weeklyReports: [],
};

const headers = { 'X-Actor-Id': JEFE };

async function post(
  request: APIRequestContext,
  path: string,
  data?: Record<string, unknown>,
) {
  return request.post(`${API_URL}${path}`, { headers, data });
}

let fibiId = '';

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API_URL}/processes`, { headers });
  expect(res.ok()).toBeTruthy();
  const processes = (await res.json()) as { id: string; code: string }[];
  const fibi = processes.find((p) => p.code === 'FIBI');
  expect(fibi, 'proceso FIBI del seed').toBeTruthy();
  fibiId = fibi!.id;
});

test.afterAll(async ({ request }) => {
  for (const id of created.dailyLogs) {
    await request.delete(`${API_URL}/worklog/daily/${id}`, { headers }).catch(() => undefined);
  }
  if (created.weeklyReports.length > 0 && DATABASE_URL !== '') {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query('DELETE FROM weekly_reports WHERE id = ANY($1::uuid[])', [
        created.weeklyReports,
      ]);
    } finally {
      await client.end();
    }
  }
});

test.describe('API: diario', () => {
  test('una fecha futura se rechaza con 400 y mensaje en español', async ({ request }) => {
    for (const date of [shiftDay(1), shiftDay(30)]) {
      const res = await post(request, '/worklog/daily', { processId: fibiId, date });
      expect(res.status(), date).toBe(400);
      expect(await res.text()).toContain('No puedes registrar un diario de una fecha futura.');
    }
  });

  test('enviar un diario sin actividades da 400; con una actividad «Interna» se envía', async ({
    request,
  }) => {
    const res = await post(request, '/worklog/daily', {
      processId: fibiId,
      date: DATE_DAILY_EMPTY,
      dayNotes: 'E2E día libre',
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    created.dailyLogs.push(id);

    const empty = await post(request, `/worklog/daily/${id}/submit`);
    expect(empty.status()).toBe(400);
    expect(await empty.text()).toContain(
      'Agrega al menos una actividad antes de enviar el diario.',
    );

    const activity = await post(request, `/worklog/daily/${id}/activities`, {
      classificationCode: 'INTERNA',
      hours: 1,
      description: 'E2E día libre',
    });
    expect(activity.status()).toBe(201);
    const sent = await post(request, `/worklog/daily/${id}/submit`);
    expect(sent.status()).toBe(201);
    // Se retira el envío para poder borrarlo al terminar.
    await post(request, `/worklog/daily/${id}/recall`);
  });
});

test.describe('API: semanal', () => {
  test('una semana futura se rechaza con 400 y mensaje en español', async ({ request }) => {
    const future = await post(request, '/weekly-reports', {
      processId: fibiId,
      weekStart: shiftDay(14),
    });
    expect(future.status()).toBe(400);
    expect(await future.text()).toContain('No puedes registrar un semanal de una semana futura.');
  });

  test('enviar un semanal sin texto da 400; con una sección escrita se envía', async ({
    request,
  }) => {
    const res = await post(request, '/weekly-reports', {
      processId: fibiId,
      weekStart: WEEK_API,
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    created.weeklyReports.push(id);

    const empty = await post(request, `/weekly-reports/${id}/submit`);
    expect(empty.status()).toBe(400);
    expect(await empty.text()).toContain(
      'Escribe al menos una sección del semanal antes de enviarlo.',
    );

    const spaces = await request.patch(`${API_URL}/weekly-reports/${id}`, {
      headers,
      data: { results: '   ' },
    });
    expect(spaces.ok()).toBeTruthy();
    expect((await post(request, `/weekly-reports/${id}/submit`)).status()).toBe(400);

    const patch = await request.patch(`${API_URL}/weekly-reports/${id}`, {
      headers,
      data: { results: 'E2E resultado de la semana' },
    });
    expect(patch.ok()).toBeTruthy();
    expect((await post(request, `/weekly-reports/${id}/submit`)).status()).toBe(201);
  });
});

test.describe('Web', () => {
  test('el diario sin actividades explica por qué no se envía y se habilita al agregar una', async ({
    page,
    request,
  }) => {
    const res = await post(request, '/worklog/daily', {
      processId: fibiId,
      date: DATE_DAILY_OK,
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    created.dailyLogs.push(id);

    await page.goto(`/seguimiento/bitacora?diario=${id}`);
    const sheet = page.getByRole('dialog');
    const send = sheet.getByRole('button', { name: 'Enviar a revisión' });
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    await expect(sheet.getByText('Agrega al menos una actividad para enviar el diario.')).toBeVisible();

    const activity = await post(request, `/worklog/daily/${id}/activities`, {
      classificationCode: 'INTERNA',
      hours: 1,
      description: 'E2E actividad',
    });
    expect(activity.status()).toBe(201);
    await page.reload();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Enviar a revisión' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('semanal: semana futura se rechaza con el mensaje de la API y el envío exige una sección guardada', async ({
    page,
  }) => {
    await page.goto('/seguimiento/semanal');
    await page.getByRole('button', { name: 'Nuevo reporte semanal' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo reporte semanal' });
    await dialog.getByRole('combobox', { name: /Proceso/ }).click();
    await page.getByRole('option').first().click();

    await dialog.getByLabel(/Semana|Fecha/).fill(shiftDay(21));
    await dialog.getByRole('button', { name: 'Crear reporte semanal' }).click();
    await expect(
      dialog.getByText('No puedes registrar un semanal de una semana futura.'),
    ).toBeVisible();

    await dialog.getByLabel(/Semana|Fecha/).fill(WEEK_UI);
    const createResponse = page.waitForResponse(
      (r) => r.url().endsWith('/weekly-reports') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Crear reporte semanal' }).click();
    const body = (await (await createResponse).json()) as { id: string };
    created.weeklyReports.push(body.id);

    const send = page.getByRole('button', { name: 'Enviar reporte' });
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByText('Escribe y guarda al menos una sección para enviar el reporte.'),
    ).toBeVisible();

    await page.getByLabel('Resultados').fill('E2E resultado');
    await page.getByRole('button', { name: 'Guardar secciones' }).click();
    await expect(page.getByRole('button', { name: 'Enviar reporte' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('Accesibilidad (axe) con el motivo del botón a la vista', () => {
  const axe = (page: import('@playwright/test').Page) =>
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

  test('bitácora: diario sin actividades (botón no disponible con motivo)', async ({
    page,
    request,
  }) => {
    const res = await post(request, '/worklog/daily', {
      processId: fibiId,
      date: shiftDay(-(base + 2)),
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    created.dailyLogs.push(id);
    await page.goto('/seguimiento/bitacora?diario=' + id);
    await expect(
      page.getByRole('dialog').getByText('Agrega al menos una actividad para enviar el diario.'),
    ).toBeVisible();
    const results = await axe(page).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, serious.map((v) => v.id).join(', ')).toEqual([]);
  });

  test('semanal: reporte sin secciones guardadas (botón no disponible con motivo)', async ({
    page,
    request,
  }) => {
    const res = await post(request, '/weekly-reports', {
      processId: fibiId,
      weekStart: shiftDay(-7 * (160 + (Math.floor(ts / 1000) % 40))),
    });
    expect(res.status()).toBe(201);
    created.weeklyReports.push(((await res.json()) as { id: string }).id);
    await page.goto('/seguimiento/semanal');
    // La lista va de la semana más reciente a la más antigua: este reporte es el último.
    await page.getByRole('list', { name: /reportes/i }).getByRole('button').last().click();
    await expect(
      page.getByText('Escribe y guarda al menos una sección para enviar el reporte.'),
    ).toBeVisible();
    const results = await axe(page).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, serious.map((v) => v.id).join(', ')).toEqual([]);
  });
});
