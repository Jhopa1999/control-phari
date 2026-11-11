import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Filtros de selección múltiple de Solicitudes y Portafolio
 * (docs/design/filtros-seleccion-multiple.md).
 *
 * El seed no crea solicitudes y la CI parte de una base limpia, así que el GET
 * del listado de Solicitudes se intercepta solo para sustituir el cuerpo: la
 * petición llega a la API real (autenticación, permisos y CORS reales). Los
 * procesos sí son los reales del seed. Los menús de Radix se renderizan en un
 * portal: se buscan por rol en la página, no dentro del Toolbar.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const HEADERS = { 'X-Actor-Id': 'jefe@demo.local' } as const;

interface ProcessRef {
  id: string;
  name: string;
}

async function loadProcesses(request: APIRequestContext): Promise<ProcessRef[]> {
  const response = await request.get(`${API_URL}/processes`, { headers: HEADERS });
  expect(response.ok()).toBeTruthy();
  const processes = (await response.json()) as ProcessRef[];
  expect(processes.length).toBeGreaterThanOrEqual(2);
  return processes;
}

const BAND_P1 = 'P1 · Primera consideración para compromiso';
/** Estados que el Portafolio muestra por defecto (iniciativas comprometidas). */
const COMMITTED = [
  'COMPROMETIDA',
  'EN_PLANIFICACION',
  'EN_EJECUCION',
  'BLOQUEADA',
  'EN_VALIDACION',
  'LISTA_PARA_LIBERAR',
  'EN_ESTABILIZACION',
  'OPERATIVA',
  'CERRADA',
];

const BAND_P2 = 'P2 · Programación en el horizonte cercano';

interface FixtureSpec {
  n: number;
  state: string;
  process: 0 | 1 | null; // índice del proceso real o null (sin proceso aún)
  band: string | null;
}

// Seis solicitudes que cruzan estado, proceso y banda.
const SPECS: FixtureSpec[] = [
  { n: 1, state: 'REGISTRADA', process: null, band: null },
  { n: 2, state: 'EN_TRIAGE', process: 0, band: null },
  { n: 3, state: 'BACKLOG_PRIORIZADO', process: 0, band: BAND_P1 },
  { n: 4, state: 'COMPROMETIDA', process: 1, band: BAND_P2 },
  { n: 5, state: 'EN_EJECUCION', process: 1, band: BAND_P1 },
  { n: 6, state: 'CERRADA', process: null, band: BAND_P1 },
];

function buildFixture(processes: ProcessRef[]): unknown[] {
  return SPECS.map(({ n, state, process, band }) => {
    const at = new Date(Date.UTC(2026, 0, n, 12)).toISOString();
    return {
      id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      title: `Filtro múltiple ${n}`,
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
      mainProcessId: process === null ? null : processes[process].id,
      participants: [],
      operationalState: state,
      currentTriageDecision: band ? 'CONTINUAR' : null,
      currentScore: band ? 70 : null,
      priorityLabel: band,
    };
  });
}

async function openSolicitudes(
  page: Page,
  request: APIRequestContext,
  path = '/demanda/solicitudes',
): Promise<ProcessRef[]> {
  const processes = await loadProcesses(request);
  const fixture = buildFixture(processes);
  await page.route(
    (url) => url.pathname.endsWith('/requests'),
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, json: fixture });
    },
  );
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Solicitudes', exact: true })).toBeVisible();
  return processes;
}

// Con un menú de Radix abierto el resto de la página queda aria-hidden y las
// consultas por rol no la ven: filas y contador se buscan por CSS.
function rowsOf(page: Page) {
  return page.locator('table tbody tr');
}

function countOf(page: Page) {
  return page.locator('[role="group"][aria-label="Filtros de solicitudes"] [role="status"]');
}

/** Títulos visibles del cuerpo de la tabla, en el orden mostrado. */
async function visibleTitles(page: Page): Promise<string[]> {
  const texts = await rowsOf(page).allInnerTexts();
  return texts
    .map((text) => /Filtro múltiple \d/.exec(text)?.[0] ?? null)
    .filter((t): t is string => t !== null);
}

async function expectTitles(page: Page, numbers: number[]): Promise<void> {
  const expected = numbers.map((n) => `Filtro múltiple ${n}`).sort();
  await expect.poll(async () => (await visibleTitles(page)).sort()).toEqual(expected);
}

/** Cierra el panel con Esc y espera a que desaparezca antes de abrir otro. */
async function closePanel(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
}

async function toggle(page: Page, name: string): Promise<void> {
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click();
}

test.describe('Solicitudes: filtros de selección múltiple', () => {
  test('dos estados muestran las filas de ambos y «Todos» limpia el filtro', async ({
    page,
    request,
  }) => {
    await openSolicitudes(page, request);
    await expect(countOf(page)).toHaveText('6 solicitudes');
    const trigger = page.locator('#sol-filtro-estado');
    await expect(trigger).toContainText('Todos');

    await trigger.click();
    await toggle(page, 'Registrada');
    await toggle(page, 'Cerrada');
    // El panel sigue abierto al marcar y el filtro se aplica al instante.
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Registrada', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectTitles(page, [1, 6]);
    await expect(countOf(page)).toHaveText('2 de 6 solicitudes');
    await closePanel(page);
    await expect(trigger).toContainText('2 seleccionados');

    // «Todos» limpia la selección.
    await trigger.click();
    await toggle(page, 'Todos');
    await expectTitles(page, [1, 2, 3, 4, 5, 6]);
    await expect(page.getByRole('menuitemcheckbox', { name: 'Todos', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await closePanel(page);
    await expect(countOf(page)).toHaveText('6 solicitudes');
  });

  test('Y entre filtros: estado, proceso y prioridad se intersectan', async ({ page, request }) => {
    const processes = await openSolicitudes(page, request);

    await page.locator('#sol-filtro-estado').click();
    await toggle(page, 'Backlog priorizado');
    await toggle(page, 'Comprometida');
    await toggle(page, 'En ejecución');
    await closePanel(page);
    await expectTitles(page, [3, 4, 5]);

    await page.locator('#sol-filtro-proceso').click();
    await toggle(page, processes[1].name);
    await closePanel(page);
    await expectTitles(page, [4, 5]);

    await page.locator('#sol-filtro-banda').click();
    await toggle(page, 'P1');
    await closePanel(page);
    await expectTitles(page, [5]);
    await expect(countOf(page)).toHaveText('1 de 6 solicitudes');
  });

  test('«Sin proceso aún» más un proceso: unión de ambos', async ({ page, request }) => {
    const processes = await openSolicitudes(page, request);
    await page.locator('#sol-filtro-proceso').click();
    await toggle(page, 'Sin proceso aún');
    await expectTitles(page, [1, 6]);
    await toggle(page, processes[0].name);
    await expectTitles(page, [1, 2, 3, 6]);
    await closePanel(page);
    await expect(page.locator('#sol-filtro-proceso')).not.toContainText('Todos');
  });

  test('el enlace ?proceso=SIN_PROCESO sigue preseleccionando «Sin proceso aún»', async ({
    page,
    request,
  }) => {
    await openSolicitudes(page, request, '/demanda/solicitudes?proceso=SIN_PROCESO');
    await expect(page.locator('#sol-filtro-proceso')).toContainText('Sin proceso aún');
    await expectTitles(page, [1, 6]);
    await expect(countOf(page)).toHaveText('2 de 6 solicitudes');
    await page.locator('#sol-filtro-proceso').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Sin proceso aún', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('contador de resultados y «Limpiar filtros» restablecen todos los filtros', async ({
    page,
    request,
  }) => {
    await openSolicitudes(page, request);
    const clear = page.getByRole('button', { name: 'Limpiar filtros', exact: true });
    await expect(clear).toHaveCount(0);

    await page.locator('#sol-filtro-estado').click();
    await toggle(page, 'Registrada');
    await closePanel(page);
    await page.locator('#sol-filtro-banda').click();
    await toggle(page, 'Sin priorizar');
    await closePanel(page);
    await expect(countOf(page)).toHaveText('1 de 6 solicitudes');
    await expect(clear).toHaveCount(1);

    await clear.click();
    await expect(countOf(page)).toHaveText('6 solicitudes');
    await expect(page.locator('#sol-filtro-estado')).toContainText('Todos');
    await expect(page.locator('#sol-filtro-banda')).toContainText('Todas');
    await expect(clear).toHaveCount(0);
    await expect(page.locator('#sol-buscar')).toBeFocused();
  });

  test('teclado: abrir, flechas, Espacio alterna y Esc cierra devolviendo el foco', async ({
    page,
    request,
  }) => {
    await openSolicitudes(page, request);
    // El h1 ya viene en el HTML del servidor: sin esperar a la vista hidratada y
    // con datos, el Enter llega antes de que Radix escuche el teclado y el
    // resultado depende de la carrera (React lo reproduce tras hidratar, pero
    // Radix lo toma como apertura con puntero y deja el foco en el contenedor).
    await expect(countOf(page)).toHaveText('6 solicitudes');
    const trigger = page.locator('#sol-filtro-estado');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // Abierto con Enter, el foco va a la primera opción («Todos», patrón de
    // botón de menú WAI-ARIA); la flecha pasa a la siguiente.
    await expect(page.getByRole('menuitemcheckbox', { name: 'Todos', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const first = page.getByRole('menuitemcheckbox', { name: 'Registrada', exact: true });
    await expect(first).toBeFocused();
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-checked', 'true');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemcheckbox', { name: 'En triage', exact: true })).toBeFocused();
    await page.keyboard.press('Space');
    await expectTitles(page, [1, 2]);
    // Espacio otra vez desmarca.
    await page.keyboard.press('Space');
    await expectTitles(page, [1]);

    await closePanel(page);
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText('Registrada');
  });
});

test.describe('Portafolio: filtros de selección múltiple', () => {
  test('la petición lleva parámetros repetidos y se envía al cerrar el panel', async ({ page }) => {
    const urls: URL[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith('/portfolio')) urls.push(url);
    });
    await page.goto('/seguimiento/portafolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portafolio', exact: true })).toBeVisible();
    await expect.poll(() => urls.length).toBeGreaterThanOrEqual(1);
    const initial = urls.length;
    // El Portafolio parte del conjunto de iniciativas comprometidas (filtro de la UI).
    expect([...urls[0].searchParams.getAll('state')].sort()).toEqual([...COMMITTED].sort());
    await expect(page.locator('#portafolio-estado')).toContainText('9 seleccionados');

    const trigger = page.locator('#portafolio-estado');
    await trigger.click();
    await toggle(page, 'Registrada');
    await toggle(page, 'En triage');
    // Con el panel abierto no hay petición nueva (se aplica al cerrar).
    await page.waitForTimeout(400);
    expect(urls.length).toBe(initial);
    await closePanel(page);

    await expect.poll(() => urls.length).toBe(initial + 1);
    const last = urls[urls.length - 1];
    expect([...last.searchParams.getAll('state')].sort()).toEqual(
      [...COMMITTED, 'REGISTRADA', 'EN_TRIAGE'].sort(),
    );
    // La lista con comas pasa de 14 caracteres: el resumen es el conteo.
    await expect(trigger).toContainText('11 seleccionados');

    // Banda: otro filtro conserva el anterior (Y entre filtros).
    await page.locator('#portafolio-banda').click();
    await toggle(page, 'P1');
    await toggle(page, 'P2');
    await closePanel(page);
    await expect.poll(() => urls.length).toBe(initial + 2);
    const both = urls[urls.length - 1];
    expect(both.searchParams.getAll('state')).toHaveLength(11);
    expect(both.searchParams.getAll('band')).toEqual(['P1', 'P2']);

    // «Limpiar filtros» vuelve al conjunto por defecto (iniciativas comprometidas).
    await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await expect.poll(() => urls.length).toBe(initial + 3);
    const cleared = urls[urls.length - 1];
    expect([...cleared.searchParams.getAll('state')].sort()).toEqual([...COMMITTED].sort());
    expect(cleared.searchParams.getAll('band')).toEqual([]);
    await expect(trigger).toContainText('9 seleccionados');
  });

  test('«Sin proceso aún» y un proceso viajan como mainProcessId repetido', async ({
    page,
    request,
  }) => {
    const processes = await loadProcesses(request);
    const urls: URL[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith('/portfolio')) urls.push(url);
    });
    await page.goto('/seguimiento/portafolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portafolio', exact: true })).toBeVisible();
    await expect.poll(() => urls.length).toBeGreaterThanOrEqual(1);
    const initial = urls.length;

    await page.locator('#portafolio-proceso').click();
    await toggle(page, 'Sin proceso aún');
    await toggle(page, processes[0].name);
    await closePanel(page);
    await expect.poll(() => urls.length).toBe(initial + 1);
    expect(urls[urls.length - 1].searchParams.getAll('mainProcessId')).toEqual([
      'SIN_PROCESO',
      processes[0].id,
    ]);
  });
});
