import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Actividades recurrentes: «Mi trabajo» y flujo de completar.
 *
 * Crea dos definiciones reales por la API (actor jefe de la suite): una con la
 * ventana ya abierta (startDate = hoy) y otra con la ventana cerrada (empieza en
 * 10 días y se habilita 1 día antes). Comprueba que solo la primera aparece en
 * Mi trabajo, la completa con texto y horas y revisa el detalle. La CI no tiene
 * S3: las llamadas de adjuntos se simulan con page.route (la ocurrencia no exige
 * evidencia, así que la API real no consulta el almacenamiento al completar).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = 'jefe@demo.local';
// El motor calcula «hoy» en la zona configurada (America/Lima por defecto).
const TIME_ZONE = 'America/Lima';

const ts = Date.now();
const OPEN_TITLE = `E2E recurrente abierta ${ts}`;
const CLOSED_TITLE = `E2E recurrente programada ${ts}`;
const REPORT_TEXT = 'Se consolidó el reporte semanal y se envió al área.';

const activityIds: string[] = [];

function localDate(offsetDays: number): string {
  const base = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
  const [y, m, d] = base.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

async function api<T>(
  request: APIRequestContext,
  method: 'get' | 'post' | 'delete',
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: { 'X-Actor-Id': JEFE }, data });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function createActivity(
  request: APIRequestContext,
  userId: string,
  title: string,
  startDate: string,
  prepDays: number,
): Promise<string> {
  const created = await api<{ id: string }>(request, 'post', '/recurring-activities', {
    title,
    activityType: 'REPORTE',
    cadence: 'SEMANAL',
    intervalCount: 1,
    startDate: `${startDate}T00:00:00.000Z`,
    estimatedHours: 1.5,
    prepDays,
    requiresEvidence: false,
    responsibleKind: 'USER',
    responsibleUserId: userId,
  });
  activityIds.push(created.id);
  return created.id;
}

test.beforeAll(async ({ request }) => {
  const me = await api<{ userId: string }>(request, 'get', '/me/permissions');
  await createActivity(request, me.userId, OPEN_TITLE, localDate(0), 2);
  await createActivity(request, me.userId, CLOSED_TITLE, localDate(10), 1);
});

test.afterAll(async ({ request }) => {
  // «Pausar» (DELETE) cancela las ocurrencias futuras sin tomar; no deja ruido en otras suites.
  for (const id of activityIds) {
    await request.delete(`${API_URL}/recurring-activities/${id}`, { headers: { 'X-Actor-Id': JEFE } });
  }
});

/** Simula los adjuntos (CI sin S3): la lista parte vacía y la subida devuelve un archivo. */
async function stubEvidence(page: Page): Promise<void> {
  const uploaded: Record<string, unknown>[] = [];
  await page.route(/\/recurring-activities\/occurrences\/[^/]+\/evidence$/, async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const id = route.request().url().split('/occurrences/')[1].split('/')[0];
      const item = {
        id: '00000000-0000-4000-8000-00000000e001',
        occurrenceId: id,
        fileName: 'informe.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        uploadedByUserId: '00000000-0000-4000-8000-00000000e002',
        uploadedByName: 'Jefe e2e',
        createdAt: new Date().toISOString(),
      };
      uploaded.push(item);
      return route.fulfill({ status: 201, json: item });
    }
    if (method === 'GET') return route.fulfill({ json: uploaded });
    return route.continue();
  });
}

async function openMyWork(page: Page): Promise<void> {
  await page.goto('/mi-trabajo');
  await expect(page.getByRole('heading', { level: 1, name: 'Mi trabajo' })).toBeVisible();
  const section = page.getByRole('region', { name: 'Actividades recurrentes' });
  await expect(section).toBeVisible();
  // Con muchas filas la sección muestra solo 5: se despliegan las restantes.
  const more = section.getByRole('button', { name: /Ver las \d+ restantes/ });
  if (await more.isVisible()) await more.click();
}

test.describe('actividades recurrentes en Mi trabajo', () => {
  test('una actividad con ventana abierta pasa axe, se completa con texto, horas y adjunto, y queda en el detalle', async ({
    page,
  }) => {
    await stubEvidence(page);
    await openMyWork(page);
    const section = page.getByRole('region', { name: 'Actividades recurrentes' });
    await expect(section.getByText(OPEN_TITLE)).toBeVisible();
    // La de ventana cerrada (Programada) no aparece en Mi trabajo.
    await expect(section.getByText(CLOSED_TITLE)).toHaveCount(0);

    // Accesibilidad de la sección con filas reales, en claro y oscuro.
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      // Solo la sección nueva: los controles de las tareas de Mi trabajo tienen su propia cobertura.
      const { violations } = await new AxeBuilder({ page })
        .include('section[aria-labelledby="mt-recurrentes-titulo"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        blocking.map((v) => v.id + ' (' + v.impact + '): ' + v.nodes.length),
        'tema ' + scheme,
      ).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await section.getByRole('button', { name: `Completar ${OPEN_TITLE}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Completar actividad' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Qué se realizó').fill(REPORT_TEXT);
    await dialog.getByLabel('Horas dedicadas').fill('2');
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'informe.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e'),
    });
    await expect(dialog.getByText('informe.pdf')).toBeVisible();
    await dialog.getByRole('button', { name: 'Completar actividad' }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByText(OPEN_TITLE)).toHaveCount(0);

    // Detalle desde «Qué me toca» → Completadas recientes.
    await page.goto('/actividades-recurrentes');
    await page.getByRole('button', { name: /Completadas recientes/ }).click();
    // La actividad es semanal: la siguiente fecha (Programada) comparte título; se abre la completada.
    await page.locator('#grupo-completadas-contenido').getByRole('button', { name: OPEN_TITLE, exact: true }).click();
    const detail = page.getByRole('dialog', { name: OPEN_TITLE });
    await expect(detail).toBeVisible();
    await expect(detail.getByText(REPORT_TEXT)).toBeVisible();
    await expect(detail.getByText('Horas reales')).toBeVisible();
    await expect(detail.getByText(/2\s*h/).first()).toBeVisible();
    await expect(detail.getByText('informe.pdf')).toBeVisible();
  });

  test('una actividad con ventana cerrada aparece Programada en «Qué me toca» y sin botones', async ({
    page,
  }) => {
    await stubEvidence(page);
    await page.goto('/actividades-recurrentes');
    await expect(page.getByRole('heading', { level: 1, name: 'Actividades recurrentes' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: CLOSED_TITLE });
    await expect(row).toBeVisible();
    await expect(row.getByText('Programada', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: `Tomar ${CLOSED_TITLE}` })).toHaveCount(0);
    await expect(row.getByRole('button', { name: `Completar ${CLOSED_TITLE}` })).toHaveCount(0);
  });
});
