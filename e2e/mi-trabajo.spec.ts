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
    pendingPredecessors: [],
    blockedReason: null,
    requestOperationalState: 'ABIERTA',
    requestCommitmentDate: null,
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

/**
 * Entrega 2 (docs/design/mi-trabajo-miembros.md, Anexo E2): conmutador
 * Lista/Tablero, mover entre columnas por menú, diálogo de motivo de bloqueo,
 * chip de predecesora y proyecto cerrado. Mismo enfoque: fixture del GET
 * /my-work y PATCH simulados; no se tocan datos.
 */
const BOARD_TODO = item(11, { status: 'POR_HACER', endDate: '2026-12-01T00:00:00.000Z' });
const BOARD_WAITING = item(12, {
  status: 'POR_HACER',
  endDate: '2026-12-02T00:00:00.000Z',
  pendingPredecessors: [{ taskId: '00000000-0000-4000-8000-00000000f0aa', title: 'Construir dashboard' }],
});
const BOARD_CLOSED = item(13, {
  status: 'EN_CURSO',
  progress: 20,
  endDate: '2026-11-02T00:00:00.000Z',
  requestOperationalState: 'CERRADA',
});
const BOARD_FIXTURE = [OVERDUE, BOARD_TODO, BOARD_WAITING, BOARD_CLOSED];

async function openWith(page: Page, fixture: MyWorkItem[]): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.route('**/my-work', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: fixture });
  });
  await page.goto('/mi-trabajo');
  await expect(page.getByRole('radiogroup', { name: 'Vista' })).toBeVisible();
}

async function chooseView(page: Page, label: 'Lista' | 'Tablero'): Promise<void> {
  // Los radios nativos son sr-only: se acciona su etiqueta visible.
  await page.getByRole('radiogroup', { name: 'Vista' }).locator('label', { hasText: label }).click();
  await expect(page.getByRole('radio', { name: label })).toBeChecked();
}

function boardList(page: Page, column: string) {
  return page.getByRole('list', { name: `Tareas en ${column}`, exact: true });
}

function card(page: Page, task: MyWorkItem) {
  return page.locator(`li[data-task-id="${task.taskId}"]`);
}

function statusPatch(task: MyWorkItem, status: string, blockedReason: string | null = null) {
  return { id: task.taskId, status, progress: task.progress, evidenceUrl: null, blockedReason };
}

test('el conmutador pasa de Lista a Tablero y recuerda la elección al recargar', async ({ page }) => {
  await openWith(page, BOARD_FIXTURE);
  // Por defecto: lista «Mi día» y filtro de estado visible.
  await expect(page.getByRole('radio', { name: 'Lista' })).toBeChecked();
  await expect(page.locator('#mt-filtro-estado')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tablero de tus tareas por estado' })).toHaveCount(0);

  await chooseView(page, 'Tablero');
  const board = page.getByRole('region', { name: 'Tablero de tus tareas por estado' });
  await expect(board).toBeVisible();
  // En el tablero el estado lo dice la columna: el filtro de estado se oculta.
  await expect(page.locator('#mt-filtro-estado')).toHaveCount(0);
  await expect(boardList(page, 'Por hacer').locator(`li[data-task-id="${BOARD_TODO.taskId}"]`)).toBeVisible();
  await expect(boardList(page, 'En curso').locator(`li[data-task-id="${OVERDUE.taskId}"]`)).toBeVisible();

  // La preferencia se guarda en el navegador y sobrevive a la recarga.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Tablero' })).toBeChecked();
  await expect(board).toBeVisible();

  await chooseView(page, 'Lista');
  await expect(page.getByRole('heading', { level: 2, name: 'Vencidas' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Lista' })).toBeChecked();
});

test('mueve una tarjeta entre columnas con «Mover a…» y solo ofrece transiciones válidas', async ({
  page,
}) => {
  await openWith(page, BOARD_FIXTURE);
  await chooseView(page, 'Tablero');
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fulfill({ json: statusPatch(BOARD_TODO, 'EN_CURSO') });
  });

  await page.getByRole('button', { name: `Mover «${BOARD_TODO.title}» a…` }).click();
  // Desde «Por hacer» solo se puede empezar o bloquear (no terminar ni revisar).
  const menuItems = page.getByRole('menuitem');
  await expect(menuItems).toHaveCount(2);
  await expect(menuItems.filter({ hasText: 'Empezar' })).toBeVisible();
  await expect(menuItems.filter({ hasText: 'Marcar como bloqueada' })).toBeVisible();
  await expect(menuItems.filter({ hasText: 'Terminar' })).toHaveCount(0);

  await menuItems.filter({ hasText: 'Empezar' }).click();
  await expect(boardList(page, 'En curso').locator(`li[data-task-id="${BOARD_TODO.taskId}"]`)).toBeVisible();
  await expect(boardList(page, 'Por hacer').locator(`li[data-task-id="${BOARD_TODO.taskId}"]`)).toHaveCount(0);
});

test('bloquear pide el motivo: sin texto no envía; con texto lo manda y lo muestra', async ({ page }) => {
  await openWith(page, BOARD_FIXTURE);
  await chooseView(page, 'Tablero');
  const reason = 'Falta el acceso al servidor de pruebas';
  const bodies: Array<Record<string, unknown>> = [];
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: statusPatch(BOARD_TODO, 'BLOQUEADA', reason) });
  });

  await page.getByRole('button', { name: `Mover «${BOARD_TODO.title}» a…` }).click();
  await page.getByRole('menuitem', { name: /Marcar como bloqueada/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Marcar como bloqueada' });
  await expect(dialog).toBeVisible();
  const field = dialog.getByLabel('Motivo del bloqueo (obligatorio)');
  await expect(field).toBeFocused();

  // En la interfaz el motivo es obligatorio: vacío no llama a la API.
  await dialog.getByRole('button', { name: 'Marcar como bloqueada' }).click();
  await expect(dialog.getByText('Escribe el motivo del bloqueo.')).toBeVisible();
  await expect(field).toBeFocused();
  expect(bodies).toHaveLength(0);

  await field.fill(`  ${reason}  `);
  await dialog.getByRole('button', { name: 'Marcar como bloqueada' }).click();
  await expect(dialog).toBeHidden();
  expect(bodies).toEqual([{ status: 'BLOQUEADA', blockedReason: reason }]);

  const blocked = boardList(page, 'Bloqueada').locator(`li[data-task-id="${BOARD_TODO.taskId}"]`);
  await expect(blocked).toBeVisible();
  await expect(blocked).toContainText(`Motivo: ${reason}`);
});

test('cancelar el diálogo de bloqueo no cambia la tarea', async ({ page }) => {
  await openWith(page, BOARD_FIXTURE);
  await chooseView(page, 'Tablero');
  let patched = false;
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    patched = true;
    await route.continue();
  });
  await page.getByRole('button', { name: `Mover «${BOARD_TODO.title}» a…` }).click();
  await page.getByRole('menuitem', { name: /Marcar como bloqueada/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar como bloqueada' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect(patched).toBe(false);
  await expect(boardList(page, 'Por hacer').locator(`li[data-task-id="${BOARD_TODO.taskId}"]`)).toBeVisible();
});

test('una tarjeta con predecesora pendiente muestra el chip «Espera a…»', async ({ page }) => {
  await openWith(page, BOARD_FIXTURE);
  await chooseView(page, 'Tablero');
  await expect(card(page, BOARD_WAITING)).toContainText('Espera a “Construir dashboard”');
  await expect(card(page, BOARD_TODO)).not.toContainText('Espera a');
});

test('un proyecto cerrado deshabilita sus acciones y no cuenta en los resúmenes', async ({ page }) => {
  await openWith(page, BOARD_FIXTURE);

  // Lista: fuera de los contadores y en el grupo plegado «De proyectos cerrados».
  const summary = page.getByRole('region', { name: 'Resumen de tu trabajo' });
  // El texto accesible del contador va concatenado («Vencidas1pasaron su fecha»),
  // así que no hay límite de palabra entre la etiqueta y el número.
  await expect(summary.getByRole('button', { name: /Vencidas/ })).toContainText(/^Vencidas1(?!\d)/);
  await expect(summary.getByRole('button', { name: /En curso/ })).toContainText(/^En curso1(?!\d)/);
  await expect(card(page, BOARD_CLOSED)).toHaveCount(0);
  await page.getByRole('button', { name: /De proyectos cerrados/ }).click();
  const closedRow = page.locator(`tr[data-task-id="${BOARD_CLOSED.taskId}"]`);
  await expect(closedRow).toBeVisible();
  await expect(closedRow.getByText('Proyecto cerrado', { exact: true })).toBeVisible();
  await expect(closedRow.getByRole('button', { name: /Cambiar estado de/ })).toBeDisabled();
  await expect(closedRow.getByRole('button', { name: /Actualizar avance de/ })).toBeDisabled();

  // Tablero: la tarjeta sigue en su columna, con el motivo visible y sin «Mover a…».
  await chooseView(page, 'Tablero');
  const closedCard = boardList(page, 'En curso').locator(`li[data-task-id="${BOARD_CLOSED.taskId}"]`);
  await expect(closedCard).toBeVisible();
  // El mismo texto está también en un <span hidden> (aria-describedby de los
  // controles deshabilitados): se afirma sobre el párrafo visible.
  await expect(
    closedCard.locator('p', { hasText: 'Proyecto cerrado: no se puede cambiar el estado ni el avance.' }),
  ).toBeVisible();
  await expect(closedCard.getByRole('button', { name: /Actualizar avance de/ })).toBeDisabled();
  await expect(closedCard.getByRole('button', { name: /Mover «/ })).toHaveCount(0);
});