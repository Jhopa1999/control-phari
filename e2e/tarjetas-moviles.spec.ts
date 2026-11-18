import { expect, test } from '@playwright/test';
import { paginationHeaders, serveRequestList } from './helpers/server-list-mock';
import type { Request } from '../apps/web/src/lib/api-client';
import { mockOleada3Data } from './helpers/oleada3-fixtures';

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
      // El servidor pagina (oleada 3, PR-B): el mock aplica los mismos parámetros.
        const served = serveRequestList(FIXTURE, new URL(route.request().url()));
        await route.fulfill({
          response,
          json: served.rows,
          headers: { ...response.headers(), ...paginationHeaders(served.total) },
        });
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

/*
 * Oleada 3 · PR-C: tarjetas móviles en Aprobaciones, Capacidad, Auditoría,
 * Equipo, Planificación, Actividades recurrentes y Reuniones. Datos de
 * helpers/oleada3-fixtures.ts (no se escribe nada en la BD).
 */
async function expectNoHorizontalScroll(page: import('@playwright/test').Page): Promise<void> {
  const ok = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(ok).toBe(true);
}

test.describe('oleada 3 · móvil 375×800', () => {
  // La API de desarrollo carga varias secciones por pantalla: margen de espera mayor.
  test.setTimeout(60_000);
  test.use({ viewport: { width: 375, height: 800 } });

  test('Aprobaciones: Aprobar y Devolver quedan visibles en la tarjeta', async ({ page }) => {
    await mockOleada3Data(page);
    await page.goto('/administracion/revision');
    const list = page.getByRole('list', { name: 'Compromisos por aprobar' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Tabla de compromisos por aprobar' })).toBeHidden();
    const first = list.getByRole('listitem').first();
    for (const name of ['Aprobar', 'Devolver']) {
      const button = first.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible({ timeout: 15_000 });
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalScroll(page);
    // Aprobar abre la confirmación sin ejecutar nada.
    await first.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
  });

  test('Capacidad: resumen en tarjetas, la sobrecarga lleva su badge', async ({ page }) => {
    await mockOleada3Data(page);
    await page.goto('/activos/capacidad');
    const list = page.getByRole('list', { name: 'Resumen de carga por persona' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Tabla del resumen de carga' })).toBeHidden();
    const over = list.getByRole('listitem').filter({ hasText: 'Persona sobrecargada e2e' });
    await expect(over).toContainText('sobre lo disponible');
    await expect(over.locator('dt', { hasText: 'Utilización plan' })).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });

  test('Auditoría: una tarjeta por evento con «Ver cambio» a todo el ancho', async ({ page }) => {
    await mockOleada3Data(page);
    await page.goto('/gobierno/auditoria');
    const list = page.getByRole('list', { name: 'Eventos de auditoría' });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('region', { name: 'Tabla de eventos de auditoría' })).toBeHidden();
    const button = list.getByRole('button', { name: 'Ver cambio' }).first();
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expectNoHorizontalScroll(page);
  });

  test('Equipo: usuarios y roles en tarjetas compactas', async ({ page }) => {
    await page.goto('/gobierno/equipo');
    const users = page.getByRole('list', { name: 'Usuarios', exact: true });
    await expect(users).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Tabla de usuarios' })).toBeHidden();
    const invite = users.getByRole('button', { name: /^Reenviar invitación a / }).first();
    const box = await invite.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('list', { name: 'Roles asignados', exact: true })).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });

  test('Reuniones: las pestañas hacen scroll propio y la página no se ensancha', async ({
    page,
  }) => {
    await page.goto('/seguimiento/reuniones');
    const tabs = page.getByRole('tablist', { name: 'Vistas de reuniones y compromisos' });
    await expect(tabs).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    const scrolls = await tabs.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
    await page.getByRole('tab', { name: /Mis compromisos abiertos/ }).click();
    await expectNoHorizontalScroll(page);
  });

  test('Actividades recurrentes: la gestión se muestra en tarjetas', async ({ page }) => {
    await page.goto('/actividades-recurrentes');
    const manage = page.getByRole('tab', { name: /Gesti/ });
    // Solo quien administra ve la pestaña de gestión; el jefe del seed sí.
    await expect(manage).toBeVisible({ timeout: 15_000 });
    await manage.click();
    await expectNoHorizontalScroll(page);
    const empty = page.getByText('No hay actividades recurrentes todavía.');
    if ((await empty.count()) === 0) {
      await expect(
        page.getByRole('list', { name: 'Definiciones de actividades recurrentes' }),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test('Planificación: fases y tareas en tarjetas sin desborde', async ({ page }) => {
    await page.goto('/seguimiento/plan');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('oleada 3 · escritorio 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('las tablas siguen y las listas de tarjetas no existen', async ({ page }) => {
    await mockOleada3Data(page);
    await page.goto('/administracion/revision');
    await expect(page.getByRole('region', { name: 'Tabla de compromisos por aprobar' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('list', { name: 'Compromisos por aprobar' })).toHaveCount(0);
    await page.goto('/gobierno/auditoria');
    await expect(page.getByRole('region', { name: 'Tabla de eventos de auditoría' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('list', { name: 'Eventos de auditoría' })).toHaveCount(0);
  });
});
