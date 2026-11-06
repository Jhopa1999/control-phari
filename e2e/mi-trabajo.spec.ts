import { expect, test, type Page } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL.
import type { MyWorkItem } from '../apps/web/src/lib/api-client';

/**
 * «Mi día» (docs/design/mi-trabajo-miembros.md): contadores, agrupación por
 * urgencia, «Terminadas» plegadas y acción en línea.
 *
 * Como date-display.spec.ts, solo sustituye el cuerpo del GET /my-work con un
 * fixture (la petición llega a la API real, con su autenticación y CORS) y fija
 * el reloj: martes 10 de noviembre de 2026, 12:00 en Bogotá. Las acciones de
 * escritura (PATCH de estado) también se simulan, así que no se tocan datos.
 */
test.use({ timezoneId: 'America/Bogota', viewport: { width: 1440, height: 900 } });

const NOW = new Date('2026-11-10T17:00:00Z');

function item(n: number, patch: Partial<MyWorkItem>): MyWorkItem {
  return {
    taskId: `00000000-0000-4000-8000-00000000f0${String(n).padStart(2, '0')}`,
    title: `Tarea e2e ${n}`,
    status: 'POR_HACER',
    progress: 0,
    isMilestone: false,
    startDate: null,
    endDate: null,
    phaseId: '00000000-0000-4000-8000-00000000f100',
    phaseName: 'Fase e2e',
    planId: '00000000-0000-4000-8000-00000000f101',
    requestId: '00000000-0000-4000-8000-00000000f102',
    requestTitle: 'Solicitud e2e',
    ...patch,
  };
}

const OVERDUE = item(1, { status: 'EN_CURSO', progress: 30, endDate: '2026-11-05T00:00:00.000Z' });
const TODAY = item(2, { status: 'POR_HACER', endDate: '2026-11-10T00:00:00.000Z' });
const WEEK = item(3, { status: 'BLOQUEADA', endDate: '2026-11-13T00:00:00.000Z' });
const LATER = item(4, { status: 'POR_HACER', endDate: '2026-12-20T00:00:00.000Z' });
const NO_DATE = item(5, { status: 'POR_HACER' });
const DONE = item(6, { status: 'TERMINADA', progress: 100, endDate: '2026-11-01T00:00:00.000Z' });
const FIXTURE = [OVERDUE, TODAY, WEEK, LATER, NO_DATE, DONE];

async function openMyWork(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.route('**/my-work', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: FIXTURE });
  });
  await page.goto('/mi-trabajo');
  await expect(page.getByRole('heading', { level: 2, name: 'Vencidas' })).toBeVisible();
}

function row(page: Page, task: MyWorkItem) {
  return page.locator(`tr[data-task-id="${task.taskId}"]`);
}

test('agrupa por urgencia, muestra los contadores y pliega las terminadas', async ({ page }) => {
  await openMyWork(page);

  for (const name of ['Vencidas', 'Hoy', 'Esta semana', 'Más adelante', 'Sin fecha']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await expect(row(page, OVERDUE)).toBeVisible();
  await expect(row(page, DONE)).toHaveCount(0);

  // Contadores: vencidas 1, para hoy 1, en curso 1, bloqueadas 1.
  const summary = page.getByRole('region', { name: 'Resumen de tu trabajo' });
  for (const label of ['Vencidas', 'Para hoy', 'En curso', 'Bloqueadas']) {
    const counter = summary.getByRole('button', { name: new RegExp(label) });
    await expect(counter).toContainText('1');
    await expect(counter).toHaveAttribute('aria-pressed', 'false');
  }

  // «Terminadas» está colapsada por defecto y se abre con su botón.
  const doneToggle = page.getByRole('button', { name: /Terminadas/ });
  await expect(doneToggle).toHaveAttribute('aria-expanded', 'false');
  await doneToggle.click();
  await expect(doneToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, DONE)).toBeVisible();
});

test('un contador actúa como filtro de selección única', async ({ page }) => {
  await openMyWork(page);

  const overdueCounter = page
    .getByRole('region', { name: 'Resumen de tu trabajo' })
    .getByRole('button', { name: /Vencidas/ });
  await overdueCounter.click();
  await expect(overdueCounter).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, OVERDUE)).toBeVisible();
  await expect(row(page, TODAY)).toHaveCount(0);
  await expect(row(page, LATER)).toHaveCount(0);

  await overdueCounter.click();
  await expect(overdueCounter).toHaveAttribute('aria-pressed', 'false');
  await expect(row(page, TODAY)).toBeVisible();
});

test('avanza una tarea desde su fila con el siguiente paso, sin abrir el detalle', async ({
  page,
}) => {
  await openMyWork(page);
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fulfill({
      json: { id: TODAY.taskId, status: 'EN_CURSO', progress: 0, evidenceUrl: null },
    });
  });

  const todayRow = row(page, TODAY);
  await todayRow.getByRole('button', { name: `Empezar: ${TODAY.title}` }).click();

  // El siguiente paso de «En curso» es enviar a revisión; el panel no se abrió.
  await expect(
    todayRow.getByRole('button', { name: `Enviar a revisión: ${TODAY.title}` }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/taskId=/);
});

test('si el servidor rechaza el cambio, revierte y muestra su mensaje', async ({ page }) => {
  await openMyWork(page);
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fulfill({
      status: 409,
      json: { statusCode: 409, message: 'Hay una predecesora pendiente (e2e).' },
    });
  });

  const todayRow = row(page, TODAY);
  await todayRow.getByRole('button', { name: `Empezar: ${TODAY.title}` }).click();

  await expect(page.getByText('Hay una predecesora pendiente (e2e).').first()).toBeVisible();
  await expect(todayRow.getByRole('button', { name: `Empezar: ${TODAY.title}` })).toBeVisible();
});
