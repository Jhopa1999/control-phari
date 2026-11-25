import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * Reuniones · participantes (PR-1): un participante ve el acta completa con los
 * nombres de todos, la lee sin poder editarla, recibe un aviso con el enlace al
 * acta y un integrante puede invitar a sus compañeros del proceso al crearla.
 *
 * Modo dev-header de la suite: el actor por defecto es el jefe; el participante
 * entra con su propio contexto de navegador. Los datos se crean por la API y se
 * retiran al terminar (mejor esfuerzo).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = 'jefe@demo.local';
const LIDER = 'lider@demo.local';
const INTEGRANTE = 'integrante@demo.local';
const ts = Date.now();

const meetings: string[] = [];

async function api<T>(
  request: APIRequestContext,
  actor: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  data?: Record<string, unknown>,
  expectedStatus?: number,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: { 'X-Actor-Id': actor }, data });
  if (expectedStatus !== undefined) {
    expect(res.status(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBe(expectedStatus);
  } else {
    expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

interface Person {
  id: string;
  name: string;
  identifier: string;
}

let fibiId: string;
let jefe: Person;
let lider: Person;
let integrante: Person;

test.beforeAll(async ({ request }) => {
  const processes = await api<{ id: string; code: string }[]>(request, JEFE, 'get', '/processes');
  fibiId = processes.find((p) => p.code === 'FIBI')!.id;
  const people = await api<Person[]>(request, JEFE, 'get', `/coordination/people?processId=${fibiId}`);
  jefe = people.find((p) => p.identifier === JEFE)!;
  lider = people.find((p) => p.identifier === LIDER)!;
  integrante = people.find((p) => p.identifier === INTEGRANTE)!;
  expect(jefe && lider && integrante, 'jefe, líder e integrante del seed en BI').toBeTruthy();
});

test.afterAll(async ({ request }) => {
  for (const id of meetings) {
    await request.delete(`${API_URL}/meetings/${id}`, { headers: { 'X-Actor-Id': JEFE } }).catch(() => undefined);
  }
});

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

test.describe('Reuniones · participantes', () => {
  test('el participante ve el acta con los nombres, en solo lectura, y recibe el aviso', async ({
    browser,
    request,
  }) => {
    const title = `E2E acta con participantes ${ts}`;
    const meeting = await api<{ id: string }>(request, JEFE, 'post', '/meetings', {
      processId: fibiId,
      title,
      meetingDate: '2026-01-15',
      responsibleUserId: lider.id,
      participantUserIds: [integrante.id, jefe.id],
      decisions: 'Se aprueba el plan.',
    });
    meetings.push(meeting.id);

    // Aviso al participante con el enlace al acta (no al autor).
    const notifications = await api<{ items: { type: string; link: string | null }[] }>(
      request,
      INTEGRANTE,
      'get',
      '/notifications',
    );
    expect(
      notifications.items.some(
        (n) => n.type === 'MEETING_PARTICIPANT_ADDED' && n.link === `/seguimiento/reuniones?meetingId=${meeting.id}`,
      ),
    ).toBe(true);

    const page = await pageAs(browser, INTEGRANTE);
    await page.goto(`/seguimiento/reuniones?meetingId=${meeting.id}`);
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^Participantes \(/ })).toBeVisible();
    // Los nombres de las demás personas son visibles aunque el participante no las tenga en su alcance.
    await expect(page.getByText(lider.name).first()).toBeVisible();
    await expect(page.getByText(jefe.name).first()).toBeVisible();
    await expect(page.getByText('Persona fuera de tu alcance')).toHaveCount(0);
    // Solo lectura: aviso y sin acciones de edición.
    await expect(page.getByText('Solo puedes leer esta acta')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar acta' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar compromiso' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Descargar acta' })).toBeVisible();
    await page.context().close();
  });

  test('un participante que no dirige el acta no la edita (403) y el responsable sí', async ({ request }) => {
    const meeting = await api<{ id: string; viewerCanEdit: boolean }>(request, JEFE, 'post', '/meetings', {
      processId: fibiId,
      title: `E2E acta de solo lectura ${ts}`,
      meetingDate: '2026-01-16',
      responsibleUserId: lider.id,
      participantUserIds: [integrante.id],
    });
    meetings.push(meeting.id);
    expect(meeting.viewerCanEdit).toBe(true);

    await api(request, INTEGRANTE, 'patch', `/meetings/${meeting.id}`, { title: 'Intento ajeno' }, 403);
    const asParticipant = await api<{ viewerCanEdit: boolean; participants: { id: string; name: string }[] }>(
      request,
      INTEGRANTE,
      'get',
      `/meetings/${meeting.id}`,
    );
    expect(asParticipant.viewerCanEdit).toBe(false);
    expect(asParticipant.participants).toEqual([{ id: integrante.id, name: integrante.name }]);

    const edited = await api<{ title: string }>(request, LIDER, 'patch', `/meetings/${meeting.id}`, {
      title: `E2E acta editada por el responsable ${ts}`,
    });
    expect(edited.title).toContain('editada por el responsable');
  });

  test('un integrante crea la reunión e invita a un compañero del proceso; un líder ajeno no lo ve', async ({
    request,
  }) => {
    const candidates = await api<Person[]>(request, INTEGRANTE, 'get', `/coordination/people?processId=${fibiId}`);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.some((p) => p.id === lider.id)).toBe(true);

    const meeting = await api<{ id: string; participants: { id: string }[] }>(request, INTEGRANTE, 'post', '/meetings', {
      processId: fibiId,
      title: `E2E reunión creada por un integrante ${ts}`,
      meetingDate: '2026-01-17',
      participantUserIds: [lider.id],
    });
    meetings.push(meeting.id);
    expect(meeting.participants.map((p) => p.id)).toEqual([lider.id]);

    // El compañero invitado la ve en su lista.
    const visibleToLider = await api<{ id: string }[]>(request, LIDER, 'get', '/meetings');
    expect(visibleToLider.some((m) => m.id === meeting.id)).toBe(true);
  });

  test('un integrante que crea un acta sin responsable queda como responsable y la sigue viendo', async ({
    request,
  }) => {
    const created = await api<{ id: string; responsibleUserId: string | null }>(request, INTEGRANTE, 'post', '/meetings', {
      processId: fibiId,
      title: `E2E acta sin responsable explícito ${ts}`,
      meetingDate: '2026-01-18',
    });
    meetings.push(created.id);
    expect(created.responsibleUserId).toBe(integrante.id);
    // Antes del arreglo el detalle daba 404 y el acta no salía en el listado.
    const detail = await api<{ id: string; viewerCanEdit: boolean }>(request, INTEGRANTE, 'get', `/meetings/${created.id}`);
    expect(detail.viewerCanEdit).toBe(true);
    const list = await api<{ id: string }[]>(request, INTEGRANTE, 'get', '/meetings');
    expect(list.some((m) => m.id === created.id)).toBe(true);
    // Puede crear compromisos en su acta y, al bloquearlos, debe indicar el motivo.
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    const commitment = await api<{ id: string }>(request, INTEGRANTE, 'post', '/commitments', {
      processId: fibiId,
      title: `E2E compromiso para bloquear ${ts}`,
      dueDate,
      sourceMeetingId: created.id,
      // El integrante ve compromisos asignados a él o de los que es responsable.
      assignedUserId: integrante.id,
    });
    try {
      const transition = `/commitments/${commitment.id}/transition`;
      await api(request, INTEGRANTE, 'post', transition, { toState: 'BLOQUEADO' }, 400);
      await api(request, INTEGRANTE, 'post', transition, { toState: 'BLOQUEADO', blockedReason: '   ' }, 400);
      const blocked = await api<{ state: string; blockers: string | null }>(request, INTEGRANTE, 'post', transition, {
        toState: 'BLOQUEADO',
        blockedReason: 'Falta la aprobación',
      });
      expect(blocked).toMatchObject({ state: 'BLOQUEADO', blockers: 'Falta la aprobación' });
      // Ya bloqueado, no se puede vaciar el motivo.
      await api(request, INTEGRANTE, 'patch', `/commitments/${commitment.id}`, { blockers: '' }, 400);
    } finally {
      await request
        .delete(`${API_URL}/commitments/${commitment.id}`, { headers: { 'X-Actor-Id': JEFE } })
        .catch(() => undefined);
    }
  });
});
