import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * Integración Bitácora ↔ Reuniones ↔ Compromisos ↔ Actividades recurrentes.
 *
 * Modo dev-header de la suite: el actor por defecto es el jefe; el participante
 * (integrante) entra con su propio contexto de navegador. Los datos de apoyo se
 * crean por la API y se retiran al terminar (mejor esfuerzo).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = 'jefe@demo.local';
const INTEGRANTE = 'integrante@demo.local';
// El motor de actividades recurrentes calcula «hoy» en la zona configurada.
const TIME_ZONE = 'America/Lima';
const ts = Date.now();

function limaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/** Fecha pasada (YYYY-MM-DD) estable por ejecución para no chocar con otros diarios. */
function pastDate(daysAgo: number): string {
  const [y, m, d] = limaToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysAgo)).toISOString().slice(0, 10);
}

// Días atrás distintos por prueba y por ejecución (rango 40-340).
const base = 40 + (Math.floor(ts / 1000) % 290);
const DATE_MAIN = pastDate(base);
const DATE_DEDUPE = pastDate(base + 1);
const DATE_SENT = pastDate(base + 2);

interface Cleanup {
  dailyLogs: { id: string; actor: string }[];
  meetings: string[];
  commitments: string[];
  activities: string[];
}
const cleanup: Cleanup = { dailyLogs: [], meetings: [], commitments: [], activities: [] };

async function api<T>(
  request: APIRequestContext,
  actor: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: { 'X-Actor-Id': actor }, data });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

interface Ids {
  fibiId: string;
  fibiName: string;
  fiidId: string;
  jefeId: string;
  integranteId: string;
  integranteName: string;
}

let ids: Ids;

test.beforeAll(async ({ request }) => {
  const processes = await api<{ id: string; code: string; name: string }[]>(request, JEFE, 'get', '/processes');
  const fibi = processes.find((p) => p.code === 'FIBI');
  const fiid = processes.find((p) => p.code === 'FIID');
  expect(fibi && fiid, 'procesos FIBI y FIID del seed').toBeTruthy();
  const people = await api<{ id: string; name: string; identifier: string }[]>(
    request,
    JEFE,
    'get',
    '/coordination/people',
  );
  const jefe = people.find((p) => p.identifier === JEFE);
  const integrante = people.find((p) => p.identifier === INTEGRANTE);
  expect(jefe && integrante, 'usuarios jefe e integrante del seed').toBeTruthy();
  ids = {
    fibiId: fibi!.id,
    fibiName: fibi!.name,
    fiidId: fiid!.id,
    jefeId: jefe!.id,
    integranteId: integrante!.id,
    integranteName: integrante!.name,
  };
});

test.afterAll(async ({ request }) => {
  const headers = (actor: string) => ({ headers: { 'X-Actor-Id': actor } });
  for (const log of cleanup.dailyLogs) {
    // Un diario enviado se retira antes de eliminarlo (el borrador se elimina directo).
    await request.post(`${API_URL}/worklog/daily/${log.id}/recall`, headers(log.actor)).catch(() => undefined);
    await request.delete(`${API_URL}/worklog/daily/${log.id}`, headers(log.actor)).catch(() => undefined);
  }
  for (const id of cleanup.meetings) {
    await request.post(`${API_URL}/meetings/${id}/reopen`, headers(JEFE)).catch(() => undefined);
    await request.delete(`${API_URL}/meetings/${id}`, headers(JEFE)).catch(() => undefined);
  }
  for (const id of cleanup.commitments) {
    await request.delete(`${API_URL}/commitments/${id}`, headers(JEFE)).catch(() => undefined);
  }
  for (const id of cleanup.activities) {
    await request.delete(`${API_URL}/recurring-activities/${id}`, headers(JEFE)).catch(() => undefined);
  }
});

async function createDiary(
  request: APIRequestContext,
  actor: string,
  processId: string,
  date: string,
): Promise<string> {
  const log = await api<{ id: string }>(request, actor, 'post', '/worklog/daily', { processId, date });
  cleanup.dailyLogs.push({ id: log.id, actor });
  return log.id;
}

async function createMeeting(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<string> {
  const meeting = await api<{ id: string }>(request, JEFE, 'post', '/meetings', data);
  cleanup.meetings.push(meeting.id);
  return meeting.id;
}

/** Contexto de navegador con otro actor de desarrollo (modo dev-header). */
async function pageAs(browser: Browser, identifier: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: 'actorId', value: identifier }] }],
    },
  });
  return context.newPage();
}

async function openDiary(page: Page, diaryId: string) {
  await page.goto(`/seguimiento/bitacora?diario=${diaryId}`);
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('heading', { name: 'Tiempo del día sin registrar' })).toBeVisible();
  return detail;
}

test.describe('Bitácora con sugerencias del día', () => {
  test('reunión con duración y participante → acta cerrada → el participante acepta la sugerencia en su bitácora', async ({
    page,
    request,
    browser,
  }) => {
    const title = `E2E reunión integrada ${ts}`;
    await page.goto('/seguimiento/reuniones');
    await expect(page.getByRole('heading', { level: 1, name: 'Reuniones y compromisos' })).toBeVisible();

    // 1) Crear la reunión con hora, duración y un participante.
    await page.getByRole('button', { name: 'Nueva acta' }).first().click();
    const form = page.getByRole('dialog', { name: 'Nueva acta de reunión' });
    await form.getByLabel('Proceso').click();
    await page.getByRole('option', { name: ids.fibiName, exact: true }).click();
    await form.getByLabel('Título').fill(title);
    await form.getByLabel('Fecha').fill(DATE_MAIN);
    await form.getByLabel('Hora (HH:mm)').fill('10:00');
    await form.getByRole('combobox', { name: 'Horas de duración' }).click();
    await page.getByRole('option', { name: '1 h', exact: true }).click();
    await expect(form.getByText(/Horario: 10:00\s*–\s*11:00/)).toBeVisible();
    await form.getByRole('checkbox', { name: ids.integranteName }).check();
    await form.getByLabel('Decisiones y acuerdos').fill('Se acordó el alcance de la entrega.');
    await form.getByRole('button', { name: 'Crear acta' }).click();
    await expect(form).toBeHidden();

    // El detalle muestra el horario completo y la duración.
    const detail = page.getByRole('heading', { level: 2, name: title });
    await expect(detail).toBeVisible();
    await expect(page.getByText(/10:00\s*–\s*11:00/).first()).toBeVisible();

    // 2) Completar (cerrar) el acta.
    await page.getByRole('button', { name: 'Cerrar acta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar acta' }).click();
    await expect(page.getByText('El acta está cerrada y queda como registro.')).toBeVisible();

    // 3) El participante abre su bitácora en borrador de esa fecha.
    const diaryId = await createDiary(request, INTEGRANTE, ids.fibiId, DATE_MAIN);
    const participant = await pageAs(browser, INTEGRANTE);
    try {
      const sheet = await openDiary(participant, diaryId);

      // 4) Ve la sugerencia con su contador.
      await expect(sheet.getByText(/1\s*sugerencia pendiente/)).toBeVisible();
      await sheet.getByRole('button', { name: 'Revisar sugerencias del día' }).click();
      const row = sheet.getByRole('listitem').filter({ hasText: title });
      await expect(row).toBeVisible();
      await expect(row.getByText(/10:00\s*–\s*11:00/)).toBeVisible();

      // 5) La acepta: aparece como Reunión con 1 h.
      await row.getByRole('button', { name: /^Aceptar sugerencia:/ }).click();
      const activities = sheet.getByRole('list', { name: 'Actividades del diario' });
      const activity = activities.getByRole('listitem').filter({ hasText: title });
      await expect(activity).toBeVisible();
      await expect(activity.getByText('Reunión', { exact: true })).toBeVisible();
      await expect(activity.getByText(/^1\s*h$/)).toBeVisible();
      await expect(activity.getByText(`Desde la reunión «${title}»`)).toBeVisible();
      await expect(sheet.getByText('Todo registrado')).toBeVisible();
    } finally {
      await participant.context().close();
    }
  });

  test('una actividad recurrente completada ese día aparece sugerida y se acepta con horas ajustadas', async ({
    request,
    browser,
  }) => {
    const title = `E2E recurrente sugerida ${ts}`;
    const today = limaToday();
    const created = await api<{ id: string }>(request, JEFE, 'post', '/recurring-activities', {
      title,
      activityType: 'REPORTE',
      cadence: 'SEMANAL',
      intervalCount: 1,
      startDate: `${today}T00:00:00.000Z`,
      estimatedHours: 1.5,
      prepDays: 2,
      requiresEvidence: false,
      responsibleKind: 'USER',
      responsibleUserId: ids.integranteId,
    });
    cleanup.activities.push(created.id);

    const mine = await api<{ items: { id: string; activityTitle: string }[] }>(
      request,
      INTEGRANTE,
      'get',
      '/recurring-activities/occurrences/my-work',
    );
    const occurrence = mine.items.find((o) => o.activityTitle === title);
    expect(occurrence, 'ocurrencia de hoy en Mi trabajo del integrante').toBeTruthy();
    await api(request, INTEGRANTE, 'post', `/recurring-activities/occurrences/${occurrence!.id}/complete`, {
      comment: 'Se consolidó el reporte y se envió al área.',
      actualHours: 1.33,
    });

    const diaryId = await createDiary(request, INTEGRANTE, ids.fibiId, today);
    const participant = await pageAs(browser, INTEGRANTE);
    try {
      const sheet = await openDiary(participant, diaryId);
      await sheet.getByRole('button', { name: 'Revisar sugerencias del día' }).click();
      const row = sheet.getByRole('listitem').filter({ hasText: title });
      await expect(row).toBeVisible();
      await expect(row.getByText('Se consolidó el reporte y se envió al área.')).toBeVisible();
      // La API redondea 1,33 h al paso de 0,25 y lo informa.
      await expect(row.getByText(/Registraste 1,33\s*h; se propone 1,25\s*h/)).toBeVisible();

      // Ajustar horas y aceptar con 2 h.
      await row.getByRole('button', { name: /^Ajustar horas y aceptar:/ }).click();
      await row.getByLabel('Horas').fill('2');
      await row.getByRole('button', { name: /^Aceptar sugerencia con/ }).click();

      const activity = sheet
        .getByRole('list', { name: 'Actividades del diario' })
        .getByRole('listitem')
        .filter({ hasText: title });
      await expect(activity).toBeVisible();
      await expect(activity.getByText('Actividad recurrente', { exact: true })).toBeVisible();
      await expect(activity.getByText(/^2\s*h$/)).toBeVisible();
    } finally {
      await participant.context().close();
    }
  });

  test('una sugerencia aceptada en un diario desaparece del otro diario del mismo día', async ({
    page,
    request,
  }) => {
    const title = `E2E reunión sin duplicar ${ts}`;
    await createMeeting(request, {
      processId: ids.fibiId,
      title,
      meetingDate: DATE_DEDUPE,
      meetingTime: '09:00',
      durationMinutes: 30,
      responsibleUserId: ids.jefeId,
      participantUserIds: [ids.jefeId],
    });
    const diaryFibi = await createDiary(request, JEFE, ids.fibiId, DATE_DEDUPE);
    const diaryFiid = await createDiary(request, JEFE, ids.fiidId, DATE_DEDUPE);

    const sheet = await openDiary(page, diaryFibi);
    await sheet.getByRole('button', { name: 'Revisar sugerencias del día' }).click();
    const row = sheet.getByRole('listitem').filter({ hasText: title });
    await row.getByRole('button', { name: /^Aceptar sugerencia:/ }).click();
    await expect(
      sheet.getByRole('list', { name: 'Actividades del diario' }).getByText(title),
    ).toBeVisible();

    // El otro diario del día (otro proceso) ya no la ofrece.
    const other = await openDiary(page, diaryFiid);
    await expect(other.getByText('Todo registrado')).toBeVisible();
    await expect(other.getByRole('button', { name: 'Revisar sugerencias del día' })).toHaveCount(0);
  });

  test('un diario enviado no permite aceptar y avisa que hay tiempo sin registrar', async ({ page, request }) => {
    const title = `E2E reunión diario enviado ${ts}`;
    await createMeeting(request, {
      processId: ids.fibiId,
      title,
      meetingDate: DATE_SENT,
      meetingTime: '15:00',
      durationMinutes: 60,
      responsibleUserId: ids.jefeId,
      participantUserIds: [ids.jefeId],
    });
    const diaryId = await createDiary(request, JEFE, ids.fibiId, DATE_SENT);
    await api(request, JEFE, 'post', `/worklog/daily/${diaryId}/activities`, {
      classificationCode: 'INTERNA',
      hours: 1,
      description: 'Gestión interna del día',
    });
    await api(request, JEFE, 'post', `/worklog/daily/${diaryId}/submit`);

    await page.goto(`/seguimiento/bitacora?diario=${diaryId}`);
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(/Hay tiempo de este día sin registrar \(1 sugerencia\)/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Revisar sugerencias del día' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: /^Aceptar sugerencia/ })).toHaveCount(0);
  });
});

test.describe('Reuniones y compromisos', () => {
  test('cerrar un acta sin duración muestra el aviso y se corrige indicando la duración', async ({
    page,
    request,
  }) => {
    const title = `E2E acta sin duración ${ts}`;
    const meetingId = await createMeeting(request, {
      processId: ids.fibiId,
      title,
      meetingDate: pastDate(base + 3),
      meetingTime: '08:00',
      decisions: 'Se decidió continuar.',
      responsibleUserId: ids.jefeId,
    });
    await page.goto(`/seguimiento/reuniones?meetingId=${meetingId}`);
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar acta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar acta' }).click();
    await expect(
      page.getByText('Indica la duración de la reunión antes de cerrar el acta.').first(),
    ).toBeVisible();
    await expect(page.getByText('El acta está cerrada y queda como registro.')).toHaveCount(0);
  });

  test('«Mis compromisos abiertos» lista los de mis reuniones con su semáforo', async ({ page, request }) => {
    const title = `E2E compromiso de mi reunión ${ts}`;
    const meetingId = await createMeeting(request, {
      processId: ids.fibiId,
      title: `E2E reunión con compromiso ${ts}`,
      meetingDate: pastDate(base + 4),
      meetingTime: '11:00',
      durationMinutes: 60,
      responsibleUserId: ids.jefeId,
    });
    const commitment = await api<{ id: string }>(request, JEFE, 'post', '/commitments', {
      processId: ids.fibiId,
      title,
      dueDate: pastDate(2),
      assignedUserId: ids.integranteId,
      sourceMeetingId: meetingId,
    });
    cleanup.commitments.push(commitment.id);

    await page.goto('/seguimiento/reuniones?tab=mis-abiertos');
    const table = page.getByRole('table', { name: 'Compromisos abiertos de mis reuniones' });
    const row = table.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByText(ids.integranteName)).toBeVisible();
    await expect(row.getByText(/Vencido hace 2 d/)).toBeVisible();
  });

  test('un compromiso vencido aparece en Mi trabajo y se completa en línea', async ({ page, request }) => {
    const title = `E2E compromiso vencido ${ts}`;
    const commitment = await api<{ id: string }>(request, JEFE, 'post', '/commitments', {
      processId: ids.fibiId,
      title,
      dueDate: pastDate(3),
      assignedUserId: ids.jefeId,
    });
    cleanup.commitments.push(commitment.id);

    await page.goto('/mi-trabajo');
    const section = page.getByRole('region', { name: 'Compromisos' });
    await expect(section).toBeVisible();
    const row = section.getByRole('listitem').filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByText(/Vencido hace 3 d/)).toBeVisible();

    await row.getByRole('button', { name: `Completar compromiso: ${title}` }).click();
    await expect(section.getByText(title)).toHaveCount(0);
    const after = await api<{ state: string }>(request, JEFE, 'get', `/commitments/${commitment.id}`);
    expect(after.state).toBe('COMPLETADO');
  });
});
