import { expect, test } from '@playwright/test';

/**
 * Auditoría: el alcance de lectura depende del rol (plan de mejora 5.4-3).
 * El integrante solo ve sus propios eventos; el líder, los de sus procesos más
 * sus propios eventos sin proceso. Solo lee: no crea ni modifica datos y no toca
 * a los usuarios demo.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;

interface AuditRow {
  actorUserId: string | null;
  scopeProcessId: string | null;
}
interface AuditPage {
  data: AuditRow[];
  total: number;
}
interface Permissions {
  userId: string;
  grants: Array<{ processId: string }>;
}

test('el integrante solo ve eventos de auditoría propios', async ({ request }) => {
  const me = await (
    await request.get(`${API_URL}/me/permissions`, { headers: INTEGRANTE })
  ).json() as Permissions;
  const res = await request.get(`${API_URL}/audit-events?page=1&pageSize=100`, {
    headers: INTEGRANTE,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as AuditPage;
  for (const event of body.data) {
    expect(event.actorUserId).toBe(me.userId);
  }
});

test('el líder solo ve eventos de sus procesos o propios sin proceso', async ({ request }) => {
  const me = await (
    await request.get(`${API_URL}/me/permissions`, { headers: LIDER })
  ).json() as Permissions;
  const processIds = new Set(me.grants.map((g) => g.processId));
  const res = await request.get(`${API_URL}/audit-events?page=1&pageSize=100`, {
    headers: LIDER,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as AuditPage;
  for (const event of body.data) {
    const inScope =
      (event.scopeProcessId !== null && processIds.has(event.scopeProcessId)) ||
      (event.scopeProcessId === null && event.actorUserId === me.userId);
    expect(inScope).toBe(true);
  }
});
