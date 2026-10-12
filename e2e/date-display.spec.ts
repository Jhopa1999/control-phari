import { expect, test } from '@playwright/test';

/**
 * Fechas con datos fijos (design §20, «e2e/date-display.spec.ts»).
 *
 * El navegador corre en UTC−5 (Bogotá) y con el reloj fijado, de modo que las
 * diferencias entre el calendario UTC y el local se detectan en cualquier
 * máquina, también en una CI en UTC. Usa el storageState del jefe, que tiene
 * el módulo `log`. No crea datos: el diálogo se abre y se cierra con Cancelar.
 */
test.use({ timezoneId: 'America/Bogota' });

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
