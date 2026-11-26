import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * Oleada 4, PR C: franja de alertas del Portafolio y sección «Ejecución» de la
 * ficha.
 *
 * - Contrato real: cada contador de GET /portfolio/summary coincide con el total
 *   de GET /portfolio?alert=... para cada rol.
 * - Franja: se simulan solo las respuestas de GET /portfolio y
 *   /portfolio/summary (la BD de la CI parte vacía) para comprobar el clic, la
 *   URL y el filtro enviado.
 * - Ejecución: se crea una solicitud propia (se elimina al final) y se simula la
 *   respuesta de GET /portfolio/{id}/execution. El integrante tiene Portafolio y
 *   no tiene Planificación.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const JEFE = { 'X-Actor-Id': 'jefe@demo.local' } as const;
const LIDER = { 'X-Actor-Id': 'lider@demo.local' } as const;
const INTEGRANTE = { 'X-Actor-Id': 'integrante@demo.local' } as const;

async function actAs(context: BrowserContext, identifier: string): Promise<void> {
  await context.addInitScript(
    ([origin, actor]) => {
      if (window.location.origin === origin) window.localStorage.setItem('actorId', actor);
    },
    [WEB_ORIGIN, identifier] as const,
  );
}

async function totalOf(
  request: APIRequestContext,
  headers: Record<string, string>,
  path: string,
): Promise<number> {
  const sep = path.includes('?') ? '&' : '?';
  const response = await request.get(`${API_URL}${path}${sep}pageSize=1`, { headers });
  expect(response.ok()).toBeTruthy();
  return Number(response.headers()['x-total-count']);
}

test.describe('GET /portfolio/summary frente al listado', () => {
  for (const [name, headers] of [
    ['jefe', JEFE],
    ['líder', LIDER],
    ['integrante', INTEGRANTE],
  ] as const) {
    test(`las cifras de ${name} coinciden con el total del listado filtrado`, async ({ request }) => {
      const response = await request.get(`${API_URL}/portfolio/summary`, { headers });
      expect(response.ok()).toBeTruthy();
      const summary = (await response.json()) as {
        total: number;
        overdue: number;
        dueSoon: number;
        withVariance: number;
        blocked: number;
        truncated: boolean;
      };
      // Con más de 1000 iniciativas los contadores evalúan las 1000 primeras (truncated).
      const listTotal = await totalOf(request, headers, '/portfolio');
      if (summary.truncated) {
        expect(summary.total).toBe(1000);
        expect(listTotal).toBeGreaterThan(1000);
      } else {
        expect(summary.total).toBe(listTotal);
      }
      expect(summary.overdue).toBe(await totalOf(request, headers, '/portfolio?alert=VENCIDA'));
      expect(summary.dueSoon).toBe(await totalOf(request, headers, '/portfolio?alert=PROXIMA'));
      expect(summary.withVariance).toBe(await totalOf(request, headers, '/portfolio?alert=CON_DESVIACION'));
      expect(summary.blocked).toBe(await totalOf(request, headers, '/portfolio?alert=BLOQUEADA'));
    });
  }

  test('alert fuera del enum responde 400 y la ejecución de un id inexistente, 404', async ({ request }) => {
    const bad = await request.get(`${API_URL}/portfolio?alert=INVENTADA`, { headers: JEFE });
    expect(bad.status()).toBe(400);
    const missing = await request.get(
      `${API_URL}/portfolio/00000000-0000-4000-8000-00000000ffff/execution`,
      { headers: JEFE },
    );
    expect(missing.status()).toBe(404);
  });
});

function portfolioItem(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`,
    code: `PRY-09${String(n).padStart(2, '0')}`,
    title: `Franja ${n}`,
    mainProcessId: null,
    mainProcessCode: null,
    mainProcessName: null,
    operationalState: 'EN_EJECUCION',
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
    referenceDate: null,
    referenceSource: 'NINGUNA',
    forecastDate: null,
    requestedGapDays: null,
    scheduleVarianceDays: null,
    blocked: false,
    blockedReason: null,
    ...overrides,
  };
}

test.describe('franja de alertas del Portafolio', () => {
  test('el contador filtra el listado, queda en la URL y se apaga con un segundo clic', async ({ page }) => {
    const overdue = portfolioItem(1, { title: 'Franja vencida', dueStatus: 'VENCIDO', daysToTarget: -3 });
    const calm = portfolioItem(2, { title: 'Franja tranquila' });
    const listQueries: URLSearchParams[] = [];
    await page.route(
      (url) => url.pathname.endsWith('/portfolio/summary'),
      (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({
              json: { total: 2, overdue: 1, dueSoon: 0, withVariance: 0, blocked: 0, truncated: false },
            })
          : route.continue(),
    );
    await page.route(
      (url) => url.pathname.endsWith('/portfolio'),
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const params = new URL(route.request().url()).searchParams;
        listQueries.push(params);
        await route.fulfill({ json: params.get('alert') === 'VENCIDA' ? [overdue] : [overdue, calm] });
      },
    );

    await page.goto('/seguimiento/portafolio');
    const strip = page.getByRole('group', { name: 'Filtrar por alerta' });
    const vencidas = strip.getByRole('button', { name: /Vencidas/ });
    await expect(vencidas).toContainText('1');
    await expect(vencidas).toHaveAttribute('aria-pressed', 'false');
    // Un contador en 0 sin seleccionar queda deshabilitado.
    await expect(strip.getByRole('button', { name: /Próximas a vencer/ })).toBeDisabled();
    // La aclaración de la franja vive tras el icono Info.
    await page.locator('summary[aria-label="Cómo se cuentan las alertas"]').click();
    await expect(page.getByText('Una iniciativa puede aparecer en más de un grupo.')).toBeVisible();
    await expect(page.locator('table tbody tr')).toHaveCount(2);

    await vencidas.click();
    await expect(page).toHaveURL(/[?&]alert=VENCIDA(&|$)/);
    await expect(vencidas).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Franja vencida' })).toBeVisible();
    expect(listQueries[listQueries.length - 1].get('alert')).toBe('VENCIDA');
    // Las cifras no cambian al activar el filtro (se calculan sin la alerta).
    await expect(vencidas).toContainText('1');
    await expect(page.getByText('Alerta: Vencidas')).toBeVisible();

    // Recargar con la URL conserva el filtro.
    await page.reload();
    await expect(page.getByRole('group', { name: 'Filtrar por alerta' }).getByRole('button', { name: /Vencidas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('table tbody tr')).toHaveCount(1);

    await page.getByRole('group', { name: 'Filtrar por alerta' }).getByRole('button', { name: /Vencidas/ }).click();
    await expect(page).not.toHaveURL(/alert=/);
    await expect(page.locator('table tbody tr')).toHaveCount(2);
  });

  test('si los contadores fallan, avisa y el listado sigue disponible', async ({ page }) => {
    await page.route(
      (url) => url.pathname.endsWith('/portfolio/summary'),
      (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 500, json: {} }) : route.continue()),
    );
    await page.route(
      (url) => url.pathname.endsWith('/portfolio'),
      (route) =>
        route.request().method() === 'GET' ? route.fulfill({ json: [portfolioItem(3)] }) : route.continue(),
    );
    await page.goto('/seguimiento/portafolio');
    await expect(page.getByText('No fue posible calcular los contadores. El listado sigue disponible.')).toBeVisible();
    // Acotado al contenido: el menú lateral tiene su propio «Reintentar» si
    // falla la carga de usuarios.
    await expect(page.locator('#contenido').getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Franja 3' })).toBeVisible();
  });
});

function executionFixture(requestId: string) {
  return {
    requestId,
    requestCode: 'PRY-0999',
    hasPlan: true,
    planStatus: 'AUTORIZADO',
    baselineDate: '2026-06-30',
    forecastDate: '2026-07-12',
    scheduleVarianceDays: 12,
    progressPercent: 70,
    phases: [
      {
        id: '00000000-0000-4000-8000-000000000501',
        code: 'PRY-0999-F1',
        name: 'Descubrimiento e2e',
        order: 1,
        startDate: null,
        endDate: null,
        status: 'TERMINADA',
        progressPercent: 100,
        tasksTotal: 1,
        tasksDone: 1,
        tasks: [
          {
            id: '00000000-0000-4000-8000-000000000601',
            code: 'PRY-0999-T01',
            title: 'Tarea terminada e2e',
            status: 'TERMINADA',
            progress: 100,
            startDate: '2026-06-01',
            endDate: '2026-06-10',
            responsibleName: 'Ana Pérez',
          },
        ],
      },
      {
        id: '00000000-0000-4000-8000-000000000502',
        code: 'PRY-0999-F2',
        name: 'Construcción e2e',
        order: 2,
        startDate: null,
        endDate: null,
        status: 'EN_CURSO',
        progressPercent: 40,
        tasksTotal: 1,
        tasksDone: 0,
        tasks: [
          {
            id: '00000000-0000-4000-8000-000000000602',
            code: 'PRY-0999-T02',
            title: 'Tarea en curso e2e',
            status: 'EN_CURSO',
            progress: 40,
            startDate: null,
            endDate: '2026-07-12',
            responsibleName: null,
          },
        ],
      },
    ],
  };
}

test.describe('sección «Ejecución» de la ficha', () => {
  test('el integrante con Portafolio la ve de solo lectura y sin enlace a Planificación', async ({
    page,
    request,
    context,
  }) => {
    const title = `Ejecución e2e ${Date.now()}`;
    const created = await request.post(`${API_URL}/requests`, { headers: INTEGRANTE, data: { title } });
    expect(created.ok()).toBeTruthy();
    const id = ((await created.json()) as { id: string }).id;
    try {
      await page.route(
        (url) => url.pathname.endsWith(`/portfolio/${id}/execution`),
        (route) =>
          route.request().method() === 'GET' ? route.fulfill({ json: executionFixture(id) }) : route.continue(),
      );
      await actAs(context, 'integrante@demo.local');
      await page.goto(`/demanda/solicitudes/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      const section = page.getByRole('region', { name: 'Ejecución' });
      await expect(section).toBeVisible();
      await expect(section.getByText('+12 d')).toBeVisible();
      await expect(section.getByRole('progressbar', { name: 'Avance de la ejecución' })).toHaveAttribute(
        'aria-valuenow',
        '70',
      );
      // Se abre solo la primera fase no terminada.
      const f1 = section.getByRole('button', { name: /Descubrimiento e2e/ });
      const f2 = section.getByRole('button', { name: /Construcción e2e/ });
      await expect(f1).toHaveAttribute('aria-expanded', 'false');
      await expect(f2).toHaveAttribute('aria-expanded', 'true');
      // En escritorio se ve la tabla; la lista móvil existe pero oculta.
      await expect(section.getByRole('table').getByText('Tarea en curso e2e')).toBeVisible();
      await expect(section.getByRole('table').getByText('Sin responsable')).toBeVisible();
      await f1.click();
      await expect(f1).toHaveAttribute('aria-expanded', 'true');
      await expect(section.getByRole('table').getByText('Tarea terminada e2e')).toBeVisible();
      // Solo lectura: sin controles de edición y sin enlace a Planificación.
      await expect(section.getByRole('combobox')).toHaveCount(0);
      await expect(section.getByRole('textbox')).toHaveCount(0);
      await expect(section.getByRole('link', { name: 'Abrir en Planificación' })).toHaveCount(0);
    } finally {
      await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
    }
  });

  test('el jefe, con Planificación, ve el enlace «Abrir en Planificación»', async ({ page, request }) => {
    const title = `Ejecución jefe e2e ${Date.now()}`;
    const created = await request.post(`${API_URL}/requests`, { headers: JEFE, data: { title } });
    expect(created.ok()).toBeTruthy();
    const id = ((await created.json()) as { id: string }).id;
    try {
      await page.route(
        (url) => url.pathname.endsWith(`/portfolio/${id}/execution`),
        (route) =>
          route.request().method() === 'GET' ? route.fulfill({ json: executionFixture(id) }) : route.continue(),
      );
      await page.goto(`/demanda/solicitudes/${id}`);
      const section = page.getByRole('region', { name: 'Ejecución' });
      await expect(section).toBeVisible();
      await expect(section.getByRole('link', { name: 'Abrir en Planificación' })).toHaveAttribute(
        'href',
        `/seguimiento/plan?requestId=${id}`,
      );
    } finally {
      await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
    }
  });

  test('una solicitud sin plan muestra el estado vacío', async ({ page, request }) => {
    const title = `Ejecución vacía e2e ${Date.now()}`;
    const created = await request.post(`${API_URL}/requests`, { headers: JEFE, data: { title } });
    expect(created.ok()).toBeTruthy();
    const id = ((await created.json()) as { id: string }).id;
    try {
      await page.goto(`/demanda/solicitudes/${id}`);
      const section = page.getByRole('region', { name: 'Ejecución' });
      await expect(section.getByText('Aún no hay ejecución que mostrar')).toBeVisible();
      await expect(section.getByRole('link', { name: 'Abrir en Planificación' })).toHaveCount(0);
    } finally {
      await request.delete(`${API_URL}/requests/${id}`, { headers: JEFE });
    }
  });
});
