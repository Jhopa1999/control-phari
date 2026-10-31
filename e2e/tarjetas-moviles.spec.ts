import { expect, test } from '@playwright/test';
import type { Request } from '../apps/web/src/lib/api-client';

/**
 * BL-024: en móvil (< 768 px) los listados muestran tarjetas por fila en vez de
 * la tabla con desplazamiento horizontal; desde 768 px vuelve la tabla.
 * Especificación: docs/design/tarjetas-moviles-bl-024.md.
 *
 * Como shell-navigation.spec.ts, solo sustituye el cuerpo del GET /requests con
 * un fixture de 30 solicitudes (la petición llega a la API real) y no abre
 * fichas ni menús con datos del fixture.
 */

const PROCESS_ID = '00000000-0000-4000-8000-000000000000';
const STATES = ['REGISTRADA', 'EN_TRIAGE', 'BACKLOG_PRIORIZADO', 'COMPROMETIDA', 'EN_EJECUCION'];

function fakeRequest(i: number): Request {
  const n = String(i).padStart(2, '0');
  const at = new Date(Date.UTC(2026, 0, i, 12)).toISOString();
  return {
    id: `00000000-0000-4000-8000-0000000000${n}`,
    title: `Solicitud e2e ${n}`,
    registeredAt: at,
    createdAt: at,
    updatedAt: at,
    requesterArea: null,
    requesterName: null,
    functionalOwner: null,
    targetDate: null,
    referenceUrl: null,
    expectedResult: null,
    initialCommitmentDate: null,
    changeJustification: null,
    mainProcessId: PROCESS_ID,
    participants: [],
    operationalState: STATES[i % STATES.length],
    currentTriageDecision: null,
    currentScore: null,
    priorityLabel: null,
  };
}

const FIXTURE = Array.from({ length: 30 }, (_, i) => fakeRequest(i + 1));

async function mockRequests(page: import('@playwright/test').Page): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/requests'),
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, json: FIXTURE });
    },
  );
}

test.describe('móvil 375×800', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('Solicitudes muestra tarjetas, no la tabla, y no desborda en horizontal', async ({
    page,
  }) => {
    await mockRequests(page);
    await page.goto('/demanda/solicitudes');

    const list = page.getByRole('list', { name: 'Solicitudes' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(25);
    await expect(page.getByRole('region', { name: 'Tabla de solicitudes' })).toBeHidden();

    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);

    // Cada tarjeta lleva su menú «…» con objetivo táctil de 44 px.
    const menu = list.getByRole('button', { name: /^Más acciones para «Solicitud e2e/ }).first();
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('«Ordenar por» reordena las tarjetas', async ({ page }) => {
    await mockRequests(page);
    await page.goto('/demanda/solicitudes');

    const items = page.getByRole('list', { name: 'Solicitudes' }).getByRole('listitem');
    await page.getByRole('combobox', { name: 'Ordenar por' }).click();
    await page.getByRole('option', { name: 'Registro' }).click();
    const first = await items.first().textContent();

    await page.getByRole('button', { name: /^Orden (ascendente|descendente), invertir$/ }).click();
    await expect(items.first()).not.toHaveText(first ?? '');
  });
});

test.describe('escritorio 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Solicitudes vuelve a la tabla y oculta las tarjetas (corte md)', async ({ page }) => {
    await mockRequests(page);
    await page.goto('/demanda/solicitudes');

    await expect(page.getByRole('region', { name: 'Tabla de solicitudes' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Solicitudes' })).toBeHidden();
  });
});
