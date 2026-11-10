import { expect, test, type Page } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL.
import type { MyWorkItem, PendingReviewItem } from '../apps/web/src/lib/api-client';

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
    evidenceRequired: false,
    hasEvidence: false,
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

/**
 * La cola «Por aprobar» solo existe para jefes y líderes (el actor de la suite es
 * jefe): se simula su GET para que estos escenarios no dependan de datos reales.
 */
async function mockPendingReview(
  page: Page,
  items: PendingReviewItem[] = [],
  total = items.length,
): Promise<void> {
  await page.route('**/tasks/pending-review', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ json: { total, items } });
  });
}

async function openMyWork(page: Page): Promise<void> {
  await mockPendingReview(page);
  await page.clock.setFixedTime(NOW);
  await page.route('**/my-work', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: FIXTURE });
  });
  await page.goto('/mi-trabajo');
  await expect(page.getByRole('heading', { level: 2, name: 'Vencidas' })).toBeVisible();
}

/** Hace que el portal trate al actor como integrante (el servidor sigue decidiendo). */
async function actAsMember(page: Page): Promise<void> {
  await page.route('**/me/permissions', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body = (await response.json()) as { roleCodes: string[]; grants: Array<{ roleCode: string }> };
    await route.fulfill({
      response,
      json: {
        ...body,
        roleCodes: ['INTEGRANTE'],
        grants: body.grants.map((g) => ({ ...g, roleCode: 'INTEGRANTE' })),
      },
    });
  });
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

async function openWith(
  page: Page,
  fixture: MyWorkItem[],
  { pending = [] as PendingReviewItem[], asMember = false } = {},
): Promise<void> {
  if (asMember) await actAsMember(page);
  await mockPendingReview(page, pending);
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

/**
 * Entrega 3 (Anexo E3): regla de cierre. El integrante envía a revisión con
 * requisitos (diálogo «Antes de enviar a revisión») y espera la aprobación; el
 * líder o jefe decide desde «Por aprobar». La regla la aplica el servidor: aquí
 * se simulan el GET /my-work, el GET /tasks/pending-review y los PATCH, y el
 * permiso del integrante.
 */
const REVIEW_WAITING = item(21, {
  status: 'EN_REVISION',
  progress: 100,
  endDate: '2026-11-20T00:00:00.000Z',
});
const REVIEW_DONE = item(22, { status: 'TERMINADA', progress: 100, endDate: '2026-11-01T00:00:00.000Z' });
// Faltan avance (90 %) y evidencia (la tarea tiene criterios de aceptación).
const TO_REVIEW_BOTH = item(23, {
  status: 'EN_CURSO',
  progress: 90,
  endDate: '2026-11-25T00:00:00.000Z',
  evidenceRequired: true,
  hasEvidence: false,
});
// Falta solo el avance.
const TO_REVIEW_PROGRESS = item(24, { status: 'EN_CURSO', progress: 40, endDate: '2026-11-26T00:00:00.000Z' });
// Falta solo la evidencia.
const TO_REVIEW_EVIDENCE = item(25, {
  status: 'EN_CURSO',
  progress: 100,
  endDate: '2026-11-27T00:00:00.000Z',
  evidenceRequired: true,
  hasEvidence: false,
});
// Todo cumplido: el envío es directo.
const TO_REVIEW_READY = item(26, {
  status: 'EN_CURSO',
  progress: 100,
  endDate: '2026-11-28T00:00:00.000Z',
  evidenceRequired: true,
  hasEvidence: true,
});
const E3_FIXTURE = [
  REVIEW_WAITING,
  REVIEW_DONE,
  TO_REVIEW_BOTH,
  TO_REVIEW_PROGRESS,
  TO_REVIEW_EVIDENCE,
  TO_REVIEW_READY,
];

function pendingItem(n: number, patch: Partial<PendingReviewItem> = {}): PendingReviewItem {
  return {
    id: `00000000-0000-4000-8000-00000000e0${String(n).padStart(2, '0')}`,
    title: `Por aprobar ${n}`,
    responsibleUserId: '00000000-0000-4000-8000-00000000e1aa',
    responsibleName: 'Ana Pérez',
    requestId: '00000000-0000-4000-8000-00000000f102',
    requestTitle: 'Solicitud e2e',
    phaseName: 'Fase e2e',
    progress: 100,
    evidenceRequired: true,
    hasEvidence: true,
    endDate: '2026-11-20T00:00:00.000Z',
    isMilestone: false,
    reviewRequestedAt: '2026-11-05T12:00:00.000Z',
    waitingSince: '2026-11-05T12:00:00.000Z',
    waitingSinceApproximate: false,
    ...patch,
  };
}

function reviewPatch(task: MyWorkItem, status: string, extra: Record<string, unknown> = {}) {
  return { ...statusPatch(task, status), evidenceRequired: task.evidenceRequired, hasEvidence: task.hasEvidence, ...extra };
}

test('el integrante ve «Espera aprobación» y no puede terminar ni reabrir', async ({ page }) => {
  await openWith(page, E3_FIXTURE, { asMember: true });

  // La cola de aprobación no existe para el integrante (ni título ni hueco).
  await expect(page.getByRole('heading', { level: 2, name: 'Por aprobar' })).toHaveCount(0);

  const waiting = row(page, REVIEW_WAITING);
  await expect(waiting.getByText('Espera aprobación')).toBeVisible();
  await expect(waiting.getByRole('button', { name: /^Terminar:/ })).toHaveCount(0);
  await waiting.getByRole('button', { name: /Cambiar estado de/ }).click();
  const items = page.getByRole('menuitem');
  await expect(items.filter({ hasText: 'Devolver a En curso' })).toBeVisible();
  await expect(items.filter({ hasText: 'Marcar como bloqueada' })).toBeVisible();
  await expect(items.filter({ hasText: 'Terminar' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Terminada: no hay «Reabrir» para el integrante.
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await expect(row(page, REVIEW_DONE).getByRole('button', { name: /Cambiar estado de/ })).toBeDisabled();
});

test('el integrante ve «Espera aprobación» en el tablero, en la columna En revisión', async ({ page }) => {
  await openWith(page, E3_FIXTURE, { asMember: true });
  await chooseView(page, 'Tablero');
  const column = boardList(page, 'En revisión');
  const waitingCard = column.locator(`li[data-task-id="${REVIEW_WAITING.taskId}"]`);
  await expect(waitingCard).toBeVisible();
  await expect(waitingCard.getByText('Espera aprobación')).toBeVisible();
  await expect(waitingCard.getByRole('button', { name: /^Terminar:/ })).toHaveCount(0);
  await waitingCard.getByRole('button', { name: /Mover «/ }).click();
  await expect(page.getByRole('menuitem').filter({ hasText: 'Terminar' })).toHaveCount(0);
});

test('si todo se cumple, enviar a revisión es directo y sin diálogo', async ({ page }) => {
  await openWith(page, E3_FIXTURE, { asMember: true });
  const bodies: Array<Record<string, unknown>> = [];
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: reviewPatch(TO_REVIEW_READY, 'EN_REVISION') });
  });

  await row(page, TO_REVIEW_READY).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_READY.title}` }).click();
  await expect(page.getByText(`“${TO_REVIEW_READY.title}” enviada a revisión. Queda a la espera de aprobación.`)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(bodies).toEqual([{ status: 'EN_REVISION' }]);
  await expect(row(page, TO_REVIEW_READY).getByText('Espera aprobación')).toBeVisible();
});

test('«Antes de enviar a revisión»: falta avance y evidencia, se completan y viajan en un solo PATCH', async ({
  page,
}) => {
  await openWith(page, E3_FIXTURE, { asMember: true });
  const bodies: Array<Record<string, unknown>> = [];
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: reviewPatch(TO_REVIEW_BOTH, 'EN_REVISION', { progress: 100, hasEvidence: true }),
    });
  });

  await row(page, TO_REVIEW_BOTH).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_BOTH.title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Antes de enviar a revisión' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Ahora está en 90 %')).toBeVisible();
  await expect(dialog.getByText('Esta tarea exige evidencia.')).toBeVisible();
  const putTo100 = dialog.getByRole('button', { name: /Poner el avance de/ });
  await expect(putTo100).toBeFocused();

  // Enviar con todo pendiente: error visible, el diálogo no se cierra, foco al primer pendiente.
  await dialog.getByRole('button', { name: 'Enviar a revisión', exact: true }).click();
  await expect(dialog.getByText('Completa lo que falta para enviar a revisión: avance al 100 % y evidencia.')).toBeVisible();
  await expect(putTo100).toBeFocused();
  expect(bodies).toHaveLength(0);

  // Poner el avance en 100 % no llama a la API todavía; el botón pasa a «Deshacer».
  await putTo100.click();
  await expect(dialog.getByText('Se guardará al 100 %.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Deshacer' })).toBeFocused();
  expect(bodies).toHaveLength(0);

  await dialog.getByLabel('Nota o enlace de evidencia').fill('  https://evidencia.example/acta  ');
  await expect(dialog.getByText('Se guardará con la tarea.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Enviar a revisión', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(bodies).toEqual([
    { status: 'EN_REVISION', progress: 100, evidenceUrl: 'https://evidencia.example/acta' },
  ]);
  await expect(row(page, TO_REVIEW_BOTH).getByText('Espera aprobación')).toBeVisible();
});

test('el diálogo solo pide lo que falta: solo avance, o solo evidencia', async ({ page }) => {
  await openWith(page, E3_FIXTURE, { asMember: true });

  await row(page, TO_REVIEW_PROGRESS).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_PROGRESS.title}` }).click();
  let dialog = page.getByRole('dialog', { name: 'Antes de enviar a revisión' });
  await expect(dialog.getByText('Ahora está en 40 %')).toBeVisible();
  // La evidencia no se exige: no hay fila ni campo.
  await expect(dialog.getByLabel('Nota o enlace de evidencia')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  await row(page, TO_REVIEW_EVIDENCE).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_EVIDENCE.title}` }).click();
  dialog = page.getByRole('dialog', { name: 'Antes de enviar a revisión' });
  await expect(dialog.getByText('Ya está al 100 %.')).toBeVisible();
  await expect(dialog.getByLabel('Nota o enlace de evidencia')).toBeFocused();
  await expect(dialog.getByRole('button', { name: /Poner el avance de/ })).toHaveCount(0);
});

test('Esc cancela el diálogo de requisitos sin cambiar nada', async ({ page }) => {
  await openWith(page, E3_FIXTURE, { asMember: true });
  let patched = false;
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    patched = true;
    await route.continue();
  });
  await row(page, TO_REVIEW_PROGRESS).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_PROGRESS.title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Antes de enviar a revisión' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(patched).toBe(false);
  await expect(row(page, TO_REVIEW_PROGRESS).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_PROGRESS.title}` })).toBeVisible();
});

test('si el servidor responde 409, el diálogo se queda con su mensaje y conserva lo escrito', async ({ page }) => {
  await openWith(page, E3_FIXTURE, { asMember: true });
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fulfill({
      status: 409,
      json: { statusCode: 409, message: 'Esta tarea exige evidencia para enviarse a revisión (e2e).' },
    });
  });
  await row(page, TO_REVIEW_EVIDENCE).getByRole('button', { name: `Enviar a revisión: ${TO_REVIEW_EVIDENCE.title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Antes de enviar a revisión' });
  await dialog.getByLabel('Nota o enlace de evidencia').fill('mi nota');
  await dialog.getByRole('button', { name: 'Enviar a revisión', exact: true }).click();
  await expect(dialog.getByText('Esta tarea exige evidencia para enviarse a revisión (e2e).')).toBeVisible();
  await expect(dialog.getByLabel('Nota o enlace de evidencia')).toHaveValue('mi nota');
});

test('un 403 del servidor se muestra en español, no el genérico', async ({ page }) => {
  await openWith(page, E3_FIXTURE);
  await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fulfill({
      status: 403,
      json: {
        statusCode: 403,
        message:
          'Solo un líder de proceso o el jefe de área puede terminar una tarea. Envíala a revisión: la aprueba un líder o el jefe de área.',
      },
    });
  });
  await row(page, REVIEW_WAITING).getByRole('button', { name: `Terminar: ${REVIEW_WAITING.title}` }).click();
  await expect(page.getByText(/Solo un líder de proceso o el jefe de área puede terminar una tarea/).first()).toBeVisible();
});

test.describe('«Por aprobar» (jefe de área y líderes)', () => {
  const A = pendingItem(1, { title: 'Documentar reglas de conciliación', hasEvidence: false });
  const B = pendingItem(2, {
    waitingSince: '2026-11-10T11:00:00.000Z',
    reviewRequestedAt: '2026-11-10T11:00:00.000Z',
    progress: 90,
  });

  test('lista las tareas con responsable, espera y evidencia, y aprueba con un clic', async ({ page }) => {
    await openWith(page, [OVERDUE], { pending: [A, B] });
    const bodies: Array<Record<string, unknown>> = [];
    await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { id: A.id, status: 'TERMINADA', progress: 100, evidenceUrl: null } });
    });

    const section = page.locator('section#por-aprobar');
    await expect(section.getByRole('heading', { level: 2, name: 'Por aprobar' })).toBeVisible();
    await expect(section).toContainText('2');
    const rowA = section.locator(`li[data-task-id="${A.id}"]`);
    await expect(rowA).toContainText('Ana Pérez');
    await expect(rowA).toContainText('Solicitud e2e');
    await expect(rowA.getByText('Espera hace 5 días')).toBeVisible();
    await expect(rowA.getByText('Falta evidencia')).toBeVisible();
    await expect(section.locator(`li[data-task-id="${B.id}"]`).getByText('Avance 90 %')).toBeVisible();
    await expect(section.locator(`li[data-task-id="${B.id}"]`).getByText('Espera desde hoy')).toBeVisible();

    // Aprobar: sale de la cola, el foco pasa a la fila siguiente y hay toast con «Reabrir».
    await rowA.getByRole('button', { name: `Aprobar: ${A.title}` }).click();
    await expect(rowA).toHaveCount(0);
    expect(bodies).toEqual([{ status: 'TERMINADA' }]);
    await expect(page.getByText(`“${A.title}” aprobada. Quedó terminada.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();
    await expect(section.locator(`li[data-task-id="${B.id}"] [data-control="title"]`)).toBeFocused();
  });

  test('devuelve una tarea a En curso', async ({ page }) => {
    await openWith(page, [OVERDUE], { pending: [A] });
    const bodies: Array<Record<string, unknown>> = [];
    await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { id: A.id, status: 'EN_CURSO', progress: 100, evidenceUrl: null } });
    });
    const section = page.locator('section#por-aprobar');
    await section.getByRole('button', { name: `Devolver a En curso: ${A.title}` }).click();
    expect(bodies).toEqual([{ status: 'EN_CURSO' }]);
    // Cola vacía: el estado vacío aparece y el foco pasa al encabezado.
    await expect(section.getByText('No hay tareas por aprobar')).toBeVisible();
    await expect(section.getByRole('heading', { level: 2, name: 'Por aprobar' })).toBeFocused();
  });

  test('si el servidor rechaza, la fila se queda y se muestra su mensaje', async ({ page }) => {
    await openWith(page, [OVERDUE], { pending: [A] });
    await page.route(/\/tasks\/[^/]+\/status$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await route.fulfill({
        status: 409,
        json: { statusCode: 409, message: 'El proyecto está cerrado (e2e).' },
      });
    });
    const section = page.locator('section#por-aprobar');
    await section.getByRole('button', { name: `Aprobar: ${A.title}` }).click();
    await expect(page.getByText('El proyecto está cerrado (e2e).').first()).toBeVisible();
    await expect(section.locator(`li[data-task-id="${A.id}"]`)).toBeVisible();
  });

  test('vacío: la sección sigue visible con su mensaje', async ({ page }) => {
    await openWith(page, [OVERDUE], { pending: [] });
    const section = page.locator('section#por-aprobar');
    await expect(section.getByText('No hay tareas por aprobar')).toBeVisible();
    await expect(section.getByText('Cuando alguien envíe una tarea a revisión, aparecerá aquí.')).toBeVisible();
  });

  test('error de carga: aviso con Reintentar y la lista personal sigue disponible', async ({ page }) => {
    let fail = true;
    await page.route('**/tasks/pending-review', async (route) => {
      if (fail) {
        await route.fulfill({ status: 500, json: { statusCode: 500, message: 'Error interno' } });
      } else {
        await route.fulfill({ json: { total: 1, items: [A] } });
      }
    });
    await page.clock.setFixedTime(NOW);
    await page.route('**/my-work', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, json: [OVERDUE] });
    });
    await page.goto('/mi-trabajo');
    const section = page.locator('section#por-aprobar');
    await expect(section.getByText(/No se pudieron cargar las tareas por aprobar/)).toBeVisible();
    await expect(row(page, OVERDUE)).toBeVisible();
    fail = false;
    await section.getByRole('button', { name: 'Reintentar' }).click();
    await expect(section.locator(`li[data-task-id="${A.id}"]`)).toBeVisible();
  });

  test('muestra 5 filas y «Ver las N restantes» revela el resto', async ({ page }) => {
    const many = Array.from({ length: 7 }, (_, i) => pendingItem(i + 10));
    await openWith(page, [OVERDUE], { pending: many });
    const section = page.locator('section#por-aprobar');
    await expect(section.locator('li[data-task-id]')).toHaveCount(5);
    await section.getByRole('button', { name: 'Ver las 2 restantes' }).click();
    await expect(section.locator('li[data-task-id]')).toHaveCount(7);
  });

  test('se pinta aunque el líder no tenga tareas propias', async ({ page }) => {
    await mockPendingReview(page, [A]);
    await page.clock.setFixedTime(NOW);
    await page.route('**/my-work', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, json: [] });
    });
    await page.goto('/mi-trabajo');
    await expect(page.getByText('No tienes tareas asignadas.')).toBeVisible();
    await expect(page.locator('section#por-aprobar').locator(`li[data-task-id="${A.id}"]`)).toBeVisible();
  });
});

test('el Panel muestra «Tareas por aprobar» y enlaza a la cola', async ({ page }) => {
  await page.route('**/area-control/attention', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, number>;
    await route.fulfill({ response, json: { ...body, pendingTaskReviews: 3 } });
  });
  await page.goto('/inicio');
  const link = page.getByRole('link', { name: /3\s*tareas por aprobar/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/mi-trabajo#por-aprobar');
});