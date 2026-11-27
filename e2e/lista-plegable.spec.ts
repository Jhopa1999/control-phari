import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, test } from '@playwright/test';

/**
 * Mesas de trabajo por solicitud (Triage, Priorización, Planificación): desde lg
 * la lista de solicitudes se puede plegar para dar todo el ancho al detalle, y la
 * elección se recuerda al recargar. Debajo de lg la lista va apilada y no se pliega.
 *
 * Prerrequisito creado por la API real: una solicitud nueva sin triage, para que la
 * lista de Triage no esté vacía.
 */
const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const ACTOR = 'jefe@demo.local';
const HEADERS = { 'X-Actor-Id': ACTOR } as const;
const PLEGAR = 'Plegar la lista de solicitudes';
const DESPLEGAR = 'Desplegar la lista de solicitudes';

async function actAs(context: BrowserContext, identifier: string): Promise<void> {
  await context.addInitScript(
    ([origin, id]) => {
      if (window.location.origin === origin) {
        window.localStorage.setItem('actorId', id);
      }
    },
    [WEB_ORIGIN, identifier],
  );
}

test.beforeAll(async ({ request }) => {
  const procRes = await request.get(`${API_URL}/processes`, { headers: HEADERS });
  expect(procRes.ok()).toBeTruthy();
  const mainProcessId = ((await procRes.json()) as Array<{ id: string }>)[0].id;
  const res = await request.post(`${API_URL}/requests`, {
    headers: HEADERS,
    data: { title: `E2E lista plegable ${Date.now()}`, mainProcessId },
  });
  expect(res.ok(), `POST /requests → ${res.status()} ${await res.text()}`).toBeTruthy();
});

test.describe('Lista de solicitudes plegable', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('en Triage se pliega, se recuerda al recargar y se vuelve a desplegar', async ({
    page,
    context,
  }) => {
    await actAs(context, ACTOR);
    await page.goto('/demanda/triage');
    const listHeading = page.getByRole('heading', { name: 'Solicitudes', level: 2 });
    await expect(listHeading).toBeVisible();

    const plegar = page.getByRole('button', { name: PLEGAR });
    await expect(plegar).toHaveAttribute('aria-expanded', 'true');
    await plegar.click();

    const desplegar = page.getByRole('button', { name: DESPLEGAR });
    await expect(desplegar).toBeVisible();
    await expect(desplegar).toBeFocused();
    await expect(desplegar).toHaveAttribute('aria-expanded', 'false');
    await expect(listHeading).toBeHidden();

    const results = await new AxeBuilder({ page })
      .include('#contenido')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

    // La preferencia se recuerda al recargar, y es propia de cada vista.
    await page.reload();
    await expect(page.getByRole('button', { name: DESPLEGAR })).toBeVisible();
    await page.goto('/demanda/priorizacion');
    await expect(page.getByRole('button', { name: PLEGAR })).toBeVisible();

    await page.goto('/demanda/triage');
    await page.getByRole('button', { name: DESPLEGAR }).click();
    await expect(page.getByRole('button', { name: PLEGAR })).toBeFocused();
    await expect(listHeading).toBeVisible();
  });

  test('debajo de lg la lista va apilada y no se puede plegar', async ({ page, context }) => {
    await actAs(context, ACTOR);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demanda/triage');
    await expect(page.getByRole('heading', { name: 'Triage', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: PLEGAR })).toHaveCount(0);
    await expect(page.getByRole('button', { name: DESPLEGAR })).toHaveCount(0);
  });
});
