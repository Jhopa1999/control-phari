import { expect, test, type Page } from '@playwright/test';
import {
  cleanupE2ECatalog,
  E2E_CATALOG,
} from '../apps/api/test-utils/e2e-cleanup';

/**
 * E2E del flujo de Maestras. Valida la cadena completa:
 * navegador -> Next.js -> api-client -> NestJS -> Prisma -> PostgreSQL.
 *
 * Los datos viven en el catalogo reservado E2E_CATALOG y se limpian antes y
 * despues de la suite con una utilidad de testing (sin DELETE por HTTP).
 */

// Cada test parte de un estado E2E limpio para que sean independientes del orden.
test.beforeEach(async ({ page }) => {
  await cleanupE2ECatalog();
  await page.goto('/catalogs');
});

test.afterAll(async () => {
  await cleanupE2ECatalog();
});

/** Aplica el filtro de catalogo E2E y el estado indicado. */
async function applyFilter(
  page: Page,
  estado: 'Todos' | 'Activos' | 'Inactivos',
) {
  // El filtro de catalogo y el campo del dialog comparten etiqueta "Catalogo";
  // acotamos por los ids estables del formulario de filtros.
  await page.locator('#filter-catalog').fill(E2E_CATALOG);
  await page.locator('#filter-active').click();
  await page.getByRole('option', { name: estado }).click();
  const listResponse = page.waitForResponse(
    (r) => r.url().includes('/catalog-items') && r.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await listResponse;
}

/** Devuelve la fila de la tabla que contiene el codigo dado. */
function rowByCode(page: Page, code: string) {
  return page.getByRole('row').filter({ hasText: code });
}

async function createItem(
  page: Page,
  values: { code: string; label: string; sortOrder: number },
) {
  await page.getByRole('button', { name: 'Nuevo elemento' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Nuevo elemento')).toBeVisible();

  await dialog.getByLabel('Catalogo').fill(E2E_CATALOG);
  await dialog.getByLabel('Codigo').fill(values.code);
  await dialog.getByLabel('Etiqueta').fill(values.label);
  await dialog.getByLabel('Orden').fill(String(values.sortOrder));

  const created = page.waitForResponse(
    (r) => r.url().includes('/catalog-items') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await created;
  // Esperar a que el dialog se cierre tras el exito antes de continuar.
  await expect(dialog).toBeHidden();
}

test('flujo principal de maestras', async ({ page }) => {
  // 2. Encabezado visible.
  await expect(
    page.getByRole('heading', { name: 'Maestras' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nuevo elemento' }).first(),
  ).toBeVisible();

  // 3. Estado vacio para E2E_CATALOG.
  await applyFilter(page, 'Todos');
  await expect(page.getByText('No hay elementos todavia.')).toBeVisible();

  // 4-5. Crear HIGH y confirmar en tabla.
  await createItem(page, { code: 'HIGH', label: 'Alta', sortOrder: 1 });
  await applyFilter(page, 'Todos');
  const high = rowByCode(page, 'HIGH');
  await expect(high).toContainText(E2E_CATALOG);
  await expect(high).toContainText('HIGH');
  await expect(high).toContainText('Alta');
  await expect(high.getByText('Activo', { exact: true })).toBeVisible();

  // 6. Crear LOW.
  await createItem(page, { code: 'LOW', label: 'Baja', sortOrder: 2 });
  await applyFilter(page, 'Todos');
  await expect(rowByCode(page, 'LOW')).toContainText('Baja');

  // 7-8. Editar HIGH: label y orden.
  await rowByCode(page, 'HIGH').getByRole('button', { name: 'Editar' }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByText('Editar elemento')).toBeVisible();
  // catalog y code son solo lectura en edicion.
  await expect(editDialog.getByLabel('Catalogo')).toBeDisabled();
  await expect(editDialog.getByLabel('Codigo')).toBeDisabled();
  await editDialog.getByLabel('Etiqueta').fill('Alta prioridad');
  await editDialog.getByLabel('Orden').fill('10');
  const edited = page.waitForResponse(
    (r) =>
      r.url().includes('/catalog-items') && r.request().method() === 'PATCH',
  );
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await edited;

  await applyFilter(page, 'Todos');
  await expect(rowByCode(page, 'HIGH')).toContainText('Alta prioridad');
  await expect(rowByCode(page, 'HIGH')).toContainText('10');

  // 9-10. Desactivar HIGH y confirmar badge Inactivo.
  const deactivate = page.waitForResponse(
    (r) =>
      r.url().includes('/catalog-items') && r.request().method() === 'PATCH',
  );
  await rowByCode(page, 'HIGH')
    .getByRole('button', { name: 'Desactivar' })
    .click();
  await deactivate;
  await applyFilter(page, 'Todos');
  await expect(
    rowByCode(page, 'HIGH').getByText('Inactivo', { exact: true }),
  ).toBeVisible();

  // 11-12. Filtrar Inactivos: HIGH aparece, LOW (activo) no.
  await applyFilter(page, 'Inactivos');
  await expect(rowByCode(page, 'HIGH')).toBeVisible();
  await expect(rowByCode(page, 'LOW')).toHaveCount(0);

  // 13-15. Volver a Todos, activar HIGH y confirmar Activo.
  await applyFilter(page, 'Todos');
  const activate = page.waitForResponse(
    (r) =>
      r.url().includes('/catalog-items') && r.request().method() === 'PATCH',
  );
  await rowByCode(page, 'HIGH').getByRole('button', { name: 'Activar' }).click();
  await activate;
  await applyFilter(page, 'Todos');
  await expect(
    rowByCode(page, 'HIGH').getByText('Activo', { exact: true }),
  ).toBeVisible();
});

test('duplicado muestra feedback entendible (409)', async ({ page }) => {
  // Prepara un HIGH en E2E_CATALOG.
  await createItem(page, { code: 'HIGH', label: 'Alta', sortOrder: 1 });

  // Intenta crear el mismo catalog/code otra vez.
  await page.getByRole('button', { name: 'Nuevo elemento' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Catalogo').fill(E2E_CATALOG);
  await dialog.getByLabel('Codigo').fill('HIGH');
  await dialog.getByLabel('Etiqueta').fill('Duplicada');
  await dialog.getByRole('button', { name: 'Crear' }).click();

  // Feedback entendible (toast), sin texto interno de Prisma.
  await expect(
    page.getByText('Ya existe un elemento con ese codigo en esta maestra.'),
  ).toBeVisible();
});

test('el formulario requiere los campos obligatorios', async ({ page }) => {
  await page.getByRole('button', { name: 'Nuevo elemento' }).first().click();
  const dialog = page.getByRole('dialog');

  // Intento crear sin completar nada: no debe crear y debe avisar.
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(
    dialog.getByText('Catalogo y codigo son obligatorios.'),
  ).toBeVisible();
  // El dialog sigue abierto (no se creo nada).
  await expect(dialog.getByText('Nuevo elemento')).toBeVisible();
});
