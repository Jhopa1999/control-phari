import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

/**
 * Seguimiento · «Proponer borrador» del reporte semanal (oleada 4, PR D).
 *
 * Modo dev-header: el actor por defecto es el jefe. Se crea un diario con una
 * actividad en una semana pasada muy antigua, se crea el semanal de esa semana y
 * se comprueba que el borrador rellena el formulario sin guardar nada, que pide
 * confirmación antes de reemplazar texto escrito y que solo «Guardar secciones»
 * persiste. Los datos se retiran al terminar (el semanal no tiene DELETE en la
 * API: se borra por id con DATABASE_URL, si está definida).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
const TIME_ZONE = 'America/Lima';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const headers = { 'X-Actor-Id': JEFE };
const ts = Date.now();

function limaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/** Fecha (YYYY-MM-DD) `days` días después (o antes, si es negativo) de hoy en Lima. */
function shiftDay(days: number): string {
  const [y, m, d] = limaToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Lunes (YYYY-MM-DD) de la semana de una fecha. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

// Semana muy antigua (más que las de otras specs) y única por ejecución: el
// reporte queda al final de la lista, que va de la más reciente a la más antigua.
const WEEK_MONDAY = mondayOf(shiftDay(-7 * (210 + (Math.floor(ts / 1000) % 40))));
const DAY_OF_WEEK = shiftDay(
  Math.round(
    (Date.parse(`${WEEK_MONDAY}T00:00:00.000Z`) - Date.parse(`${limaToday()}T00:00:00.000Z`)) /
      86_400_000,
  ) + 1,
);
const ACTIVITY_TEXT = 'E2E borrador actividad';

const created: { dailyLogs: string[]; weeklyReports: string[] } = {
  dailyLogs: [],
  weeklyReports: [],
};

async function post(request: APIRequestContext, path: string, data?: Record<string, unknown>) {
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
  for (const id of created.dailyLogs) {
    await request.delete(`${API_URL}/worklog/daily/${id}`, { headers }).catch(() => undefined);
  }
});

test.describe('API: borrador del semanal', () => {
  test('rechaza una semana futura y no crea nada', async ({ request }) => {
    const res = await request.get(`${API_URL}/weekly-reports/draft`, {
      headers,
      params: { processId: fibiId, weekStart: shiftDay(14) },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('No puedes registrar un semanal de una semana futura.');
  });
});

test.describe('Web: Proponer borrador', () => {
  test('rellena el formulario, confirma antes de reemplazar y solo guarda con «Guardar secciones»', async ({
    page,
    request,
  }) => {
    const daily = await post(request, '/worklog/daily', { processId: fibiId, date: DAY_OF_WEEK });
    expect(daily.status()).toBe(201);
    created.dailyLogs.push(((await daily.json()) as { id: string }).id);
    const activity = await post(request, `/worklog/daily/${created.dailyLogs[0]}/activities`, {
      classificationCode: 'INTERNA',
      hours: 1,
      description: ACTIVITY_TEXT,
    });
    expect(activity.status()).toBe(201);

    const weekly = await post(request, '/weekly-reports', {
      processId: fibiId,
      weekStart: WEEK_MONDAY,
    });
    expect(weekly.status()).toBe(201);
    const weeklyId = ((await weekly.json()) as { id: string }).id;
    created.weeklyReports.push(weeklyId);

    await page.goto('/seguimiento/semanal');
    await page.getByRole('list', { name: /reportes/i }).getByRole('button').last().click();
    const results = page.getByLabel('Resultados');
    await expect(results).toBeVisible();

    // Sin texto escrito: se aplica de inmediato, sin diálogo, y avisa de dónde sale.
    await page.getByRole('button', { name: 'Proponer borrador' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Borrador generado desde 1 diario' })).toBeVisible();
    await expect(results).toHaveValue(new RegExp(ACTIVITY_TEXT));
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Proponer no guarda nada: el reporte sigue vacío en la base.
    const before = await request.get(`${API_URL}/weekly-reports/${weeklyId}`, { headers });
    expect(((await before.json()) as { results: string | null }).results ?? '').toBe('');

    // Con texto escrito: pide confirmación; «Conservar» no toca el campo.
    await results.fill('Texto propio E2E');
    await page.getByRole('button', { name: 'Proponer borrador' }).click();
    const dialog = page.getByRole('alertdialog', { name: '¿Reemplazar el texto escrito?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Conservar mi texto' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(results).toHaveValue('Texto propio E2E');

    // «Reemplazar» aplica el borrador.
    await page.getByRole('button', { name: 'Proponer borrador' }).click();
    await dialog.getByRole('button', { name: 'Reemplazar con el borrador' }).click();
    await expect(results).toHaveValue(new RegExp(ACTIVITY_TEXT));

    // Se edita y solo entonces se guarda.
    await results.fill(`${ACTIVITY_TEXT} editado`);
    await page.getByRole('button', { name: 'Guardar secciones' }).click();
    await expect(page.getByText('Secciones guardadas.')).toBeVisible();
    const after = await request.get(`${API_URL}/weekly-reports/${weeklyId}`, { headers });
    expect(((await after.json()) as { results: string }).results).toBe(`${ACTIVITY_TEXT} editado`);
  });
});
