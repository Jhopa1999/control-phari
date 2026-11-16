import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Oleada 2 · PR-C · D9: «Vigente» exige aprobación.
 * - Un líder no publica directo (403); envía a aprobación y el jefe aprueba.
 * - Versionar un documento vigente lo devuelve a Borrador (en toda categoría).
 * - La categoría debe existir en la maestra DOC_CATEGORY (400).
 * - Documentos: «Publicar» solo para el jefe y aviso al editar un vigente.
 *
 * Los activos y documentos los crea la propia prueba con el prefijo «E2E docs».
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const ts = Date.now();

type Headers = typeof JEFE | typeof LIDER;
interface Doc {
  id: string;
  status: string;
  title: string;
  categoryCode: string | null;
}

async function call<T = Record<string, unknown>>(
  api: APIRequestContext,
  headers: Headers,
  method: 'post' | 'get' | 'patch',
  path: string,
  body?: Record<string, unknown>,
  expected: number[] = [200, 201],
): Promise<{ status: number; body: T }> {
  const res = await api[method](`${API_URL}${path}`, { headers, data: body });
  const text = await res.text();
  expect(expected, `${method} ${path} → ${res.status()} ${text}`).toContain(res.status());
  return { status: res.status(), body: (text ? JSON.parse(text) : {}) as T };
}

let assetId = '';

test.beforeAll(async ({ request }) => {
  // Un proceso donde el líder demo tiene grant: el activo queda en su alcance.
  const processes = await call<Array<{ id: string }>>(request, LIDER, 'get', '/processes');
  const processId = processes.body[0].id;
  const asset = await call<{ id: string }>(request, JEFE, 'post', '/assets', {
    processId,
    name: `E2E docs activo ${ts}`,
  });
  assetId = asset.body.id;
  await call(request, JEFE, 'post', `/assets/${assetId}/status`, { targetStatus: 'ACTIVO' });
});

async function newDoc(
  api: APIRequestContext,
  title: string,
  extra: Record<string, unknown> = { categoryCode: 'TECNICA' },
): Promise<Doc> {
  return (
    await call<Doc>(api, LIDER, 'post', '/documents', {
      assetId,
      title: `E2E docs ${title} ${ts}`,
      content: '# Contenido',
      ...extra,
    })
  ).body;
}

test.describe('API · Vigente exige aprobación', () => {
  test('el líder no publica directo; envía a aprobación y el jefe aprueba', async ({ request }) => {
    const doc = await newDoc(request, 'flujo');
    expect(doc.status).toBe('BORRADOR');

    const denied = await call<{ message: string }>(
      request, LIDER, 'post', `/documents/${doc.id}/status`, { targetStatus: 'VIGENTE' }, [403],
    );
    expect(denied.body.message).toBe(
      'Solo el jefe de área puede publicar directamente; envía el documento a aprobación.',
    );

    const pending = await call<Doc>(request, LIDER, 'post', `/documents/${doc.id}/submit-approval`);
    expect(pending.body.status).toBe('PENDIENTE_APROBACION');
    const approved = await call<Doc>(request, JEFE, 'post', `/documents/${doc.id}/review`, {
      decision: 'APROBAR',
    });
    expect(approved.body.status).toBe('VIGENTE');
  });

  test('versionar un vigente de categoría general lo devuelve a Borrador; el jefe puede publicar directo', async ({
    request,
  }) => {
    const doc = await newDoc(request, 'versionar');
    await call(request, JEFE, 'post', `/documents/${doc.id}/status`, { targetStatus: 'VIGENTE' });

    const versioned = await call<Doc>(request, LIDER, 'post', `/documents/${doc.id}/versions`, {
      content: '# Cambio',
    });
    expect(versioned.body.status).toBe('BORRADOR');

    const republished = await call<Doc>(request, JEFE, 'post', `/documents/${doc.id}/status`, {
      targetStatus: 'VIGENTE',
    });
    expect(republished.body.status).toBe('VIGENTE');
  });

  test('reactivar un archivado a Vigente es solo del jefe', async ({ request }) => {
    const doc = await newDoc(request, 'archivado');
    await call(request, JEFE, 'post', `/documents/${doc.id}/status`, { targetStatus: 'VIGENTE' });
    await call(request, LIDER, 'post', `/documents/${doc.id}/status`, { targetStatus: 'ARCHIVADA' });
    await call(request, LIDER, 'post', `/documents/${doc.id}/status`, { targetStatus: 'VIGENTE' }, [403]);
    const back = await call<Doc>(request, JEFE, 'post', `/documents/${doc.id}/status`, {
      targetStatus: 'VIGENTE',
    });
    expect(back.body.status).toBe('VIGENTE');
  });

  test('una categoría inexistente se rechaza al crear y al editar; la guardada se conserva', async ({ request }) => {
    await call(request, LIDER, 'post', '/documents', {
      assetId, title: `E2E docs cat ${ts}`, content: 'x', categoryCode: 'NO_EXISTE',
    }, [400]);
    const doc = await newDoc(request, 'categoria');
    await call(request, LIDER, 'patch', `/documents/${doc.id}`, { categoryCode: 'NO_EXISTE' }, [400]);
    const ok = await call<Doc>(request, LIDER, 'patch', `/documents/${doc.id}`, { categoryCode: 'FUNCIONAL' });
    expect(ok.body.categoryCode).toBe('FUNCIONAL');
    const renamed = await call<Doc>(request, LIDER, 'patch', `/documents/${doc.id}`, {
      title: `E2E docs cat renombrado ${ts}`,
    });
    expect(renamed.body.categoryCode).toBe('FUNCIONAL');
  });
});

async function actAs(context: import('@playwright/test').BrowserContext, actor: string): Promise<void> {
  await context.addInitScript(
    ([origin, id]) => {
      if (window.location.origin === origin) window.localStorage.setItem('actorId', id);
    },
    [WEB_ORIGIN, actor] as const,
  );
}

async function openMenu(page: import('@playwright/test').Page, title: string) {
  await page.goto('/activos/documentos');
  await page.locator('#doc-filtro-busqueda').fill(title);
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /Más acciones para/ }).click();
  return row;
}

test.describe('Documentos · acciones por rol', () => {
  test('el líder ve «Enviar a aprobación» y no «Publicar»', async ({ page, context, request }) => {
    await actAs(context, 'lider@demo.local');
    const doc = await newDoc(request, 'ui lider');
    await openMenu(page, doc.title);
    await expect(page.getByRole('menuitem', { name: 'Enviar a aprobación' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Publicar' })).toHaveCount(0);
  });

  test('el jefe ve «Publicar» en un borrador general', async ({ page, context, request }) => {
    await actAs(context, 'jefe@demo.local');
    const doc = await newDoc(request, 'ui jefe');
    await openMenu(page, doc.title);
    await expect(page.getByRole('menuitem', { name: 'Publicar' })).toBeVisible();
  });

  test('al editar un vigente se avisa que volverá a borrador y se guarda sin errores de accesibilidad', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(90_000);
    await actAs(context, 'lider@demo.local');
    const doc = await newDoc(request, 'ui vigente');
    await call(request, JEFE, 'post', `/documents/${doc.id}/status`, { targetStatus: 'VIGENTE' });
    await page.goto('/activos/documentos');
    await page.locator('#doc-filtro-busqueda').fill(doc.title);
    const row = page.getByRole('row', { name: new RegExp(doc.title) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Editar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar documento' });
    await expect(dialog.getByText('Este documento está vigente')).toBeVisible();
    await expect(dialog.getByText(/vuelve a Borrador/)).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);

    await dialog.getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByText(/volvió a Borrador y necesita aprobación/)).toBeVisible({ timeout: 40_000 });
    const after = await call<Doc>(request, LIDER, 'get', `/documents/${doc.id}`);
    expect(after.body.status).toBe('BORRADOR');
  });
});
