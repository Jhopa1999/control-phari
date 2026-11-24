import { expect, test } from '@playwright/test';
import { createActiveAsset } from './helpers/activo-activo';

/**
 * Oleada 4 · PR B: ficha del activo (`/activos/catalogo/[id]`).
 * Resumen, Solicitudes y Documentos; enlace «Ver auditoría» filtrado por
 * código; la ruta antigua `/historial` redirige a la pestaña Solicitudes.
 * Los datos los crea la propia prueba con el prefijo «E2E ficha» (D8: el activo
 * se crea y se activa por el flujo real).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const ts = Date.now();

let asset = { id: '', name: `E2E ficha activo ${ts}`, code: '' };

test.beforeAll(async ({ request }) => {
  const processes = await request.get(`${API_URL}/processes`, { headers: JEFE });
  expect(processes.ok()).toBeTruthy();
  const [process] = (await processes.json()) as Array<{ id: string }>;
  const created = await createActiveAsset(request, { processId: process.id, name: asset.name });
  const detail = await request.get(`${API_URL}/assets/${created.id}`, { headers: JEFE });
  const body = (await detail.json()) as { id: string; code: string };
  asset = { ...asset, id: body.id, code: body.code };
});

test('la ficha muestra cabecera, pestañas y el enlace «Ver auditoría» con el código', async ({ page }) => {
  await page.goto(`/activos/catalogo/${asset.id}`);
  await expect(page.getByRole('heading', { level: 1, name: asset.name })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`Código ${asset.code}, copiar`) })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /^Solicitudes/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Documentos/ })).toBeVisible();
  await expect(page.getByText('Sin dependencias registradas.')).toBeVisible();
  const audit = page.getByRole('link', { name: 'Ver auditoría' });
  await expect(audit).toHaveAttribute('href', `/gobierno/auditoria?objectCode=${asset.code}`);
});

test('la pestaña Solicitudes vacía y Documentos vacía se piden al abrirlas', async ({ page }) => {
  await page.goto(`/activos/catalogo/${asset.id}`);
  await page.getByRole('tab', { name: /^Solicitudes/ }).click();
  await expect(page).toHaveURL(/tab=solicitudes/);
  await expect(page.getByText('Ninguna solicitud usa este activo todavía.')).toBeVisible();
  await page.getByRole('tab', { name: /^Documentos/ }).click();
  await expect(page).toHaveURL(/tab=documentos/);
  await expect(page.getByText('Este activo aún no tiene documentos.')).toBeVisible();
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await expect(page).not.toHaveURL(/tab=/);
});

test('/historial redirige a la ficha con la pestaña Solicitudes abierta', async ({ page }) => {
  await page.goto(`/activos/catalogo/${asset.id}/historial`);
  await expect(page).toHaveURL(new RegExp(`/activos/catalogo/${asset.id}\\?tab=solicitudes`));
  await expect(page.getByRole('tab', { name: /^Solicitudes/ })).toHaveAttribute('aria-selected', 'true');
});

test('el catálogo enlaza el nombre del activo con su ficha y «Ver auditoría» abre la auditoría filtrada', async ({ page }) => {
  await page.goto('/activos/catalogo');
  await page.getByRole('searchbox', { name: 'Buscar por nombre o código' }).fill(asset.name);
  await page.getByRole('link', { name: asset.name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/activos/catalogo/${asset.id}`));
  await page.getByRole('link', { name: 'Ver auditoría' }).click();
  await expect(page).toHaveURL(new RegExp(`/gobierno/auditoria\\?objectCode=${asset.code}`));
  await expect(page.getByLabel('Código del objeto')).toHaveValue(asset.code);
});

test('un activo inexistente muestra el mensaje de no encontrado', async ({ page }) => {
  await page.goto('/activos/catalogo/00000000-0000-4000-8000-00000000dead');
  await expect(page.getByText('No encontramos este activo.')).toBeVisible();
});
