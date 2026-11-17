import { type APIRequestContext, expect } from '@playwright/test';

/**
 * D8: un activo nace en BORRADOR y solo uno ACTIVO admite asociaciones nuevas
 * (`POST /requests/:id/asset`). Este helper crea el activo y lo activa con el
 * actor que tiene permiso (el jefe de área) para que las pruebas lo asocien.
 * No relaja la regla: ejecuta el paso real de activación.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

export async function createActiveAsset(
  api: APIRequestContext,
  input: { processId: string; name: string },
  headers: Record<string, string> = { 'X-Actor-Id': 'jefe@demo.local' },
): Promise<{ id: string }> {
  const created = await api.post(`${API_URL}/assets`, { headers, data: input });
  expect(created.ok(), `POST /assets → ${created.status()} ${await created.text()}`).toBeTruthy();
  const asset = (await created.json()) as { id: string };
  const activated = await api.post(`${API_URL}/assets/${asset.id}/status`, {
    headers,
    data: { targetStatus: 'ACTIVO' },
  });
  expect(
    activated.ok(),
    `POST /assets/${asset.id}/status → ${activated.status()} ${await activated.text()}`,
  ).toBeTruthy();
  return asset;
}
