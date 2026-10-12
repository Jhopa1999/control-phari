import { expect, test } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL, y
// un `import type` no lo evalúa.
import type { MyWorkItem } from '../apps/web/src/lib/api-client';

/**
 * Fechas con datos fijos (design §20, «e2e/date-display.spec.ts»).
 *
 * El navegador corre en UTC−5 (Bogotá) y con el reloj fijado, de modo que las
 * diferencias entre el calendario UTC y el local se detectan en cualquier
 * máquina, también en una CI en UTC. Usa el storageState del jefe, que tiene
 * el módulo `log`. No crea datos: el diálogo se abre y se cierra con Cancelar,
 * y el listado de Mi trabajo se sirve con un fixture.
 */
test.use({ timezoneId: 'America/Bogota' });

// Ids ficticios: el test no abre la tarea, así que no tienen que existir.
const DATE_ITEM: MyWorkItem = {
  taskId: '00000000-0000-4000-8000-00000000e2e1',
  title: 'Tarea de prueba de fecha (e2e)',
  status: 'EN_CURSO',
  progress: 40,
  isMilestone: false,
  startDate: '2027-07-01T00:00:00.000Z',
  endDate: '2027-07-15T00:00:00.000Z',
  phaseId: '00000000-0000-4000-8000-00000000e2e2',
  phaseName: 'Fase de prueba (e2e)',
  planId: '00000000-0000-4000-8000-00000000e2e3',
  requestId: '00000000-0000-4000-8000-00000000e2e4',
  requestTitle: 'Solicitud de prueba (e2e)',
};

// Regla 1 de format.ts: una fecha de calendario guardada como
// `${día}T00:00:00.000Z` se muestra en UTC. Leída en hora local, en Bogotá
// sería el 14 de julio a las 19:00.
test('Mi trabajo muestra la fecha de vencimiento guardada, sin correrla un día', async ({
  page,
}) => {
  // Solo se sustituye el cuerpo del GET: la petición llega a la API real, así
  // que la autenticación, los permisos y CORS siguen siendo reales.
  await page.route('**/my-work', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: [DATE_ITEM] });
  });
  await page.goto('/mi-trabajo');

  const row = page.getByRole('row').filter({ hasText: DATE_ITEM.title });
  await expect(row).toContainText('15 jul 2027');
  await expect(row).not.toContainText('14 jul 2027');
});

// Regresión de §19.2: los valores por defecto se proponían con el calendario
// UTC. 2026-11-01T01:30:00Z es el 31 de octubre a las 20:30 en Bogotá, así que
// "hoy" para el usuario es el 31 y no el 1 de noviembre.
test('«Nuevo diario» propone la fecha del calendario local', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-01T01:30:00Z'));
  await page.goto('/seguimiento/bitacora');

  // Si el actor no tiene diarios, el estado vacío repite la acción.
  await page.getByRole('button', { name: 'Nuevo diario' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#diario-date')).toHaveValue('2026-10-31');

  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
