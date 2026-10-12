import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Shell y navegación (design §8 y §20, «e2e/shell-navigation.spec.ts»):
 * grupos del menú y página activa, filtrado por permisos, cajón móvil, riel,
 * skip link y ruta inexistente. Ninguna URL cambia con el rediseño.
 *
 * Solo depende del seed (actores y permisos), como el resto de la suite: usa
 * el storageState del jefe y, para otros actores o la preferencia del riel,
 * addInitScript con el mismo patrón que responsible-selector.spec.ts. No crea
 * ni modifica datos.
 */

// Origen de la web: WEB_ORIGIN o, si falta, E2E_WEB_URL (el mismo de
// playwright.config.ts). Sin variables vale lo mismo que en la CI.
const WEB_ORIGIN =
  process.env.WEB_ORIGIN ?? process.env.E2E_WEB_URL ?? 'http://localhost:3000';
// Integrante BI (seed): sin triage, priorización, aprobaciones, plan,
// indicadores, equipo ni maestras (MODULE_MATRIX).
const INTEGRANTE_IDENTIFIER = 'integrante.bi@demo.local';

/** Títulos de los grupos del menú, en orden (el primero no tiene título). */
const GROUP_LABELS = [
  'Demanda',
  'Ejecución',
  'Seguimiento',
  'Activos y conocimiento',
  'Gobierno',
  'Administración',
];

/** Escribe claves de localStorage antes de cada carga, solo en el origen de la web. */
async function seedLocalStorage(
  context: BrowserContext,
  entries: Record<string, string>,
): Promise<void> {
  await context.addInitScript(
    ([origin, values]) => {
      if (window.location.origin === origin) {
        for (const [key, value] of Object.entries(values)) {
          window.localStorage.setItem(key, value);
        }
      }
    },
    [WEB_ORIGIN, entries] as const,
  );
}

const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegación principal', exact: true });

test.describe('escritorio 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('el menú agrupa la navegación por flujo y marca la página actual', async ({
    page,
  }) => {
    await page.goto('/inicio');
    const menu = mainNav(page);

    // Un grupo de entrada sin título y los 6 grupos de §8.5, en orden.
    const lists = menu.getByRole('list');
    await expect(lists).toHaveCount(GROUP_LABELS.length + 1);
    await expect(lists.first().getByRole('link')).toHaveText([
      'Panel del área',
      'Mi trabajo',
    ]);
    for (const [index, label] of GROUP_LABELS.entries()) {
      await expect(lists.nth(index + 1)).toHaveAccessibleName(label);
    }
    // El menú no usa encabezados.
    await expect(menu.getByRole('heading')).toHaveCount(0);

    const solicitudes = menu.getByRole('link', { name: 'Solicitudes', exact: true });
    await solicitudes.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Solicitudes', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL('/demanda/solicitudes');
    await expect(solicitudes).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('el integrante solo ve los módulos que tiene habilitados', async ({
    page,
    context,
  }) => {
    await seedLocalStorage(context, { actorId: INTEGRANTE_IDENTIFIER });
    await page.goto('/inicio');
    const menu = mainNav(page);

    for (const label of ['Panel del área', 'Mi trabajo', 'Solicitudes', 'Capacidad']) {
      await expect(menu.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    for (const label of [
      'Triage',
      'Priorización',
      'Aprobaciones',
      'Planificación',
      'Indicadores',
      'Equipo y permisos',
      'Maestras',
    ]) {
      await expect(menu.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
  });

  test('Tareas marca «Mi trabajo» y /catalogs marca «Maestras»', async ({ page }) => {
    const menu = mainNav(page);

    await page.goto('/seguimiento/tareas');
    await expect(
      menu.getByRole('link', { name: 'Mi trabajo', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);

    await page.goto('/catalogs');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Maestras', exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole('link', { name: 'Maestras', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
  });
});

test.describe('móvil 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // El sidebar de escritorio sigue en el DOM, oculto: los locators del cajón
  // se acotan al diálogo «Menú principal».
  const drawer = (page: Page) =>
    page.getByRole('dialog', { name: 'Menú principal', exact: true });
  const menuButton = (page: Page) =>
    page.getByRole('button', { name: 'Abrir menú', exact: true });

  test('el cajón navega, se cierra y devuelve el foco a «Abrir menú»', async ({
    page,
  }) => {
    await page.goto('/inicio');
    await expect(
      page.getByRole('complementary', { name: 'Menú lateral', includeHidden: true }),
    ).toBeHidden();

    await menuButton(page).click();
    await expect(drawer(page)).toBeVisible();

    await drawer(page).getByRole('link', { name: 'Solicitudes', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Solicitudes', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL('/demanda/solicitudes');
    await expect(drawer(page)).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
  });

  test('con la preferencia de riel guardada, el cajón no abre tooltips', async ({
    page,
    context,
  }) => {
    await seedLocalStorage(context, { sidebarCollapsed: 'true' });
    await page.goto('/inicio');

    // Se abre con teclado: así el foco que se mueve después también es
    // :focus-visible y un tooltip se abriría si el cajón tuviera alguno.
    await menuButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(drawer(page)).toBeVisible();

    const link = drawer(page).getByRole('link', { name: 'Solicitudes', exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});

test.describe('riel 1100×800', () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test('el botón del riel expande el menú, conserva el foco y recuerda la preferencia', async ({
    page,
  }) => {
    await page.goto('/inicio');
    const menu = mainNav(page);
    const solicitudes = menu.getByRole('link', { name: 'Solicitudes', exact: true });
    const solicitudesText = solicitudes.getByText('Solicitudes', { exact: true });
    const expand = page.getByRole('button', { name: 'Expandir menú', exact: true });
    const collapse = page.getByRole('button', { name: 'Contraer menú', exact: true });

    // Riel por defecto: los enlaces conservan su nombre y solo existe el botón
    // visible (el otro tiene display: none y sale del árbol de accesibilidad).
    await expect(solicitudes).toBeVisible();
    await expect(expand).toHaveCount(1);
    await expect(collapse).toHaveCount(0);
    // En riel la etiqueta es sr-only (1 × 1 px).
    await expect
      .poll(async () => (await solicitudesText.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(1);

    await expand.focus();
    await page.keyboard.press('Enter');
    await expect(collapse).toBeFocused();
    await expect(expand).toHaveCount(0);
    await expect
      .poll(async () => (await solicitudesText.boundingBox())?.width ?? 0)
      .toBeGreaterThan(1);

    // La preferencia se guarda: tras recargar sigue expandido.
    await page.reload();
    await expect(collapse).toBeVisible();
    await expect(expand).toHaveCount(0);
  });
});

test('el primer Tab enfoca «Saltar al contenido» y Enter lleva el foco al contenido', async ({
  page,
}) => {
  await page.goto('/inicio');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Saltar al contenido', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#contenido')).toBeFocused();
});

test('una ruta inexistente responde 404 con su propia pantalla', async ({ page }) => {
  const response = await page.goto('/ruta-inexistente');
  expect(response?.status()).toBe(404);
  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { level: 1, name: 'Página no encontrada', exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole('link', { name: 'Ir al Panel del área', exact: true }),
  ).toBeVisible();
});
