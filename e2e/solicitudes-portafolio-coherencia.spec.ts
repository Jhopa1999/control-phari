import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * Coherencia entre Solicitudes y Portafolio:
 * - alcance único (las cifras coinciden por rol, también las sin proceso);
 * - Portafolio = iniciativas comprometidas por defecto, con el conmutador
 *   «Incluir pendientes de decisión»;
 * - enlaces cruzados («Ver en Portafolio») y ficha que conserva el contexto.
 *
 * Los escenarios de alcance usan la API real con datos propios (que se eliminan
 * al final); el filtro por defecto del Portafolio simula solo la respuesta de
 * GET /portfolio para no depender de solicitudes comprometidas reales.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;

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

async function actAs(context: BrowserContext, identifier: string): Promise<void> {
  await context.addInitScript(
    ([origin, actor]) => {
      if (window.location.origin === origin) window.localStorage.setItem('actorId', actor);
    },
    [WEB_ORIGIN, identifier] as const,
  );
}

async function createRequest(
  request: APIRequestContext,
  headers: Record<string, string>,
  title: string,
): Promise<string> {
  const response = await request.post(`${API_URL}/requests`, { headers, data: { title } });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

async function removeRequest(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
}

async function ids(
  request: APIRequestContext,
  headers: Record<string, string>,
  path: string,
): Promise<string[]> {
  const response = await request.get(`${API_URL}${path}`, { headers });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { id: string }[]).map((item) => item.id);
}

test.describe('alcance único de solicitudes', () => {
  test('Solicitudes, Portafolio y Panel dan la misma cifra a cada rol, también para lo que no tiene proceso', async ({
    request,
  }) => {
    const sinProceso = await createRequest(request, JEFE, `Alcance sin proceso ${Date.now()}`);
    try {
      for (const headers of [JEFE, LIDER, INTEGRANTE]) {
        const solicitudes = await ids(request, headers, '/requests');
        const portafolio = await ids(request, headers, '/portfolio');
        const panel = await request.get(`${API_URL}/area-control/demand-summary`, { headers });
        const attention = await request.get(`${API_URL}/area-control/attention`, { headers });
        expect(panel.ok() && attention.ok()).toBeTruthy();

        expect([...portafolio].sort()).toEqual([...solicitudes].sort());
        expect(((await panel.json()) as { total: number }).total).toBe(solicitudes.length);

        // «Pendientes de triage» del Panel = REGISTRADA de la lista que usa Triage.
        const lista = (await (
          await request.get(`${API_URL}/requests`, { headers })
        ).json()) as { operationalState: string }[];
        const registradas = lista.filter((r) => r.operationalState === 'REGISTRADA').length;
        expect(((await attention.json()) as { pendingTriage: number }).pendingTriage).toBe(registradas);
      }
      // Jefe y líder ven la solicitud sin proceso; el integrante, no (no la creó).
      expect(await ids(request, LIDER, '/portfolio')).toContain(sinProceso);
      expect(await ids(request, LIDER, '/requests')).toContain(sinProceso);
      expect(await ids(request, INTEGRANTE, '/portfolio')).not.toContain(sinProceso);
    } finally {
      await removeRequest(request, sinProceso);
    }
  });

  test('el integrante ve en Portafolio la solicitud sin proceso que él creó', async ({ page, request, context }) => {
    const title = `Creada por integrante ${Date.now()}`;
    const id = await createRequest(request, INTEGRANTE, title);
    try {
      expect(await ids(request, INTEGRANTE, '/portfolio')).toContain(id);

      await actAs(context, 'integrante@demo.local');
      await page.goto('/seguimiento/portafolio');
      await expect(page.getByRole('heading', { level: 1, name: 'Portafolio', exact: true })).toBeVisible();
      // Sin comprometer, aparece al incluir los pendientes de decisión.
      await page.getByRole('switch', { name: 'Incluir pendientes de decisión' }).click();
      await page.locator('#portafolio-buscar').fill(title);
      await expect(page.getByRole('link', { name: title })).toBeVisible();
    } finally {
      await removeRequest(request, id);
    }
  });

  test('el líder ve el mismo total en Solicitudes y en el Panel', async ({ page, request, context }) => {
    const total = (await ids(request, LIDER, '/requests')).length;
    await actAs(context, 'lider@demo.local');

    await page.goto('/demanda/solicitudes');
    const count = page.locator('[role="group"][aria-label="Filtros de solicitudes"] [role="status"]');
    await expect(count).toHaveText(new RegExp(`^${total} solicitud(es)?$`));

    await page.goto('/inicio');
    const tile = page.getByText('Solicitudes en alcance', { exact: true }).locator('xpath=..');
    await expect(tile).toContainText(total.toLocaleString('es-CO'));
  });
});

function portfolioItem(n: number, operationalState: string) {
  return {
    id: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
    title: `Coherencia ${n} ${operationalState}`,
    mainProcessId: null,
    mainProcessCode: null,
    mainProcessName: null,
    operationalState,
    priorityBand: null,
    priorityLabel: null,
    currentScore: null,
    governanceRoute: null,
    responsibleName: null,
    registeredAt: '2026-01-05',
    targetDate: null,
    initialCommitmentDate: null,
    progressPercent: null,
    dueStatus: 'SIN_FECHA',
    daysToTarget: null,
    blocked: false,
    blockedReason: null,
  };
}

test.describe('Portafolio: iniciativas comprometidas por defecto', () => {
  test('muestra solo lo comprometido y el conmutador amplía a los pendientes de decisión', async ({ page }) => {
    const fixture = [
      portfolioItem(1, 'REGISTRADA'),
      portfolioItem(2, 'EN_TRIAGE'),
      portfolioItem(3, 'COMPROMETIDA'),
      portfolioItem(4, 'EN_EJECUCION'),
      portfolioItem(5, 'CERRADA'),
    ];
    const queries: URLSearchParams[] = [];
    await page.route(
      (url) => url.pathname.endsWith('/portfolio'),
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const params = new URL(route.request().url()).searchParams;
        queries.push(params);
        const states = params.getAll('state');
        await route.fulfill({
          json: states.length === 0 ? fixture : fixture.filter((i) => states.includes(i.operationalState)),
        });
      },
    );

    await page.goto('/seguimiento/portafolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portafolio', exact: true })).toBeVisible();
    const rows = page.locator('table tbody tr');
    const count = page.locator('[role="group"][aria-label="Filtros del portafolio"] [role="status"]');

    await expect(rows).toHaveCount(3);
    await expect(count).toHaveText('3 iniciativas');
    await expect(page.getByText(/Solo iniciativas comprometidas/)).toBeVisible();
    expect([...queries[0].getAll('state')].sort()).toEqual([...COMMITTED].sort());
    const toggle = page.getByRole('switch', { name: 'Incluir pendientes de decisión' });
    await expect(toggle).not.toBeChecked();
    // Mismos nombres que Solicitudes.
    await expect(page.locator('#portafolio-estado')).toBeVisible();
    await expect(page.getByText('Estado', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Prioridad', { exact: true }).first()).toBeVisible();

    await toggle.click();
    await expect(rows).toHaveCount(5);
    await expect(count).toHaveText('5 solicitudes e iniciativas');
    await expect(page.getByText(/Se incluyen solicitudes pendientes de decisión/)).toBeVisible();
    expect(queries[queries.length - 1].getAll('state')).toEqual([]);
    await expect(page.locator('#portafolio-estado')).toContainText('Todos');

    // «Limpiar filtros» vuelve al conjunto por defecto.
    await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(toggle).not.toBeChecked();
  });

  test('sin iniciativas, el estado vacío explica qué ocurre y dónde gestionar las solicitudes', async ({ page }) => {
    await page.route(
      (url) => url.pathname.endsWith('/portfolio'),
      (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue()),
    );
    await page.goto('/seguimiento/portafolio');
    await expect(page.getByText('Aún no hay iniciativas comprometidas en tu alcance.')).toBeVisible();
    await expect(page.getByText(/cuando se aprueba su compromiso/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a Solicitudes' })).toHaveAttribute('href', '/demanda/solicitudes');
  });
});

async function openRowMenu(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: `Más acciones para «${title}»` }).first().click();
}

test.describe('enlaces cruzados', () => {
  test('«Ver en Portafolio» solo en solicitudes comprometidas y abre el Portafolio buscando por título', async ({
    page,
  }) => {
    const base = (n: number, state: string) => ({
      id: `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`,
      title: `Cruce ${n}`,
      registeredAt: '2026-01-05T12:00:00.000Z',
      createdAt: '2026-01-05T12:00:00.000Z',
      updatedAt: '2026-01-05T12:00:00.000Z',
      requesterArea: null,
      requesterName: null,
      functionalOwner: null,
      targetDate: null,
      referenceUrl: null,
      expectedResult: null,
      initialCommitmentDate: null,
      changeJustification: null,
      mainProcessId: null,
      participants: [],
      operationalState: state,
      currentTriageDecision: null,
      currentScore: null,
      priorityLabel: null,
    });
    await page.route(
      (url) => url.pathname.endsWith('/requests'),
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        await route.fulfill({ response, json: [base(1, 'REGISTRADA'), base(2, 'EN_EJECUCION')] });
      },
    );
    await page.route(
      (url) => url.pathname.endsWith('/portfolio'),
      (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue()),
    );

    await page.goto('/demanda/solicitudes');
    await expect(page.getByRole('heading', { level: 1, name: 'Solicitudes', exact: true })).toBeVisible();
    // Pista cruzada en el encabezado.
    await expect(page.getByText(/Bandeja de entrada y gestión de solicitudes/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Portafolio', exact: true }).first()).toHaveAttribute(
      'href',
      '/seguimiento/portafolio',
    );

    await openRowMenu(page, 'Cruce 1');
    await expect(page.getByRole('menuitem', { name: 'Ver en Portafolio' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await openRowMenu(page, 'Cruce 2');
    await page.getByRole('menuitem', { name: 'Ver en Portafolio' }).click();
    await expect(page).toHaveURL(/\/seguimiento\/portafolio\?q=Cruce%202$/);
    await expect(page.locator('#portafolio-buscar')).toHaveValue('Cruce 2');
  });

  test('la ficha abierta desde el Portafolio conserva «Portafolio» en la miga y en el menú', async ({
    page,
    request,
  }) => {
    const title = `Ficha desde portafolio ${Date.now()}`;
    const id = await createRequest(request, JEFE, title);
    try {
      // Desde el Portafolio: ruta propia, menú y miga en Portafolio.
      await page.goto(`/seguimiento/portafolio/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      const crumbs = page.getByRole('navigation', { name: 'Ruta de navegación' });
      await expect(crumbs.getByRole('link', { name: 'Portafolio' })).toHaveAttribute('href', '/seguimiento/portafolio');
      await expect(crumbs).not.toContainText('Solicitudes');
      const menu = page.getByRole('navigation', { name: 'Navegación principal', exact: true });
      await expect(menu.locator('[aria-current="page"]')).toContainText('Portafolio');

      // El enlace directo a la ficha no cambia.
      await page.goto(`/demanda/solicitudes/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Ruta de navegación' }).getByRole('link', { name: 'Solicitudes' }),
      ).toHaveAttribute('href', '/demanda/solicitudes');
      await expect(menu.locator('[aria-current="page"]')).toContainText('Solicitudes');
    } finally {
      await removeRequest(request, id);
    }
  });
});
