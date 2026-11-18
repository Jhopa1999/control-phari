import AxeBuilder from '@axe-core/playwright';
import { paginationHeaders, serveRequestList } from './helpers/server-list-mock';
import { expect, test, type Page } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL.
import type { Request } from '../apps/web/src/lib/api-client';
import { mockOleada3Data } from './helpers/oleada3-fixtures';

/**
 * Chequeo automatizado de accesibilidad (Fase D). Ejecuta axe-core sobre rutas
 * representativas y falla solo ante violaciones de impacto `serious` o
 * `critical`, para no bloquear por avisos menores o reglas discutibles. No
 * sustituye la revisión manual con lectores de pantalla (ver
 * apps/web/docs/accesibilidad-fase-d.md); cubre un subconjunto objetivo.
 *
 * Sigue el patrón de shell-navigation.spec.ts: storageState del jefe
 * (global-setup) y el mismo origen; no crea ni modifica datos. Para la ruta de
 * tabla intercepta el GET del listado con un fixture (la base de la CI parte
 * vacía y mostraría el estado «sin solicitudes», no la tabla).
 */

const PROCESS_ID = '00000000-0000-4000-8000-000000000000';
const FIXTURE_STATES = ['REGISTRADA', 'EN_TRIAGE', 'COMPROMETIDA', 'EN_EJECUCION', 'CERRADA'];

function fakeRequest(i: number): Request {
  const n = String(i).padStart(2, '0');
  const at = new Date(Date.UTC(2026, 0, i, 12)).toISOString();
  return {
    id: `00000000-0000-4000-8000-0000000000${n}`,
    code: `PRY-00${n}`,
    title: `Solicitud a11y ${n}`,
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
    operationalState: FIXTURE_STATES[i % FIXTURE_STATES.length],
    currentTriageDecision: null,
    currentScore: null,
    priorityLabel: null,
  };
}

const REQUESTS_FIXTURE = Array.from({ length: 8 }, (_, i) => fakeRequest(i + 1));

/** Reglas WCAG 2.0/2.1 A y AA; se filtra por impacto al afirmar. */
const axe = (page: Page): AxeBuilder =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

/** Violaciones con impacto serio o crítico (las que deben bloquear). */
function seriousOrCritical(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

/** Mensaje legible por regla para diagnosticar un fallo en la CI. */
function summarize(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodo(s)\n  ${v.helpUrl}`)
    .join('\n');
}

test.describe('accesibilidad (axe-core)', () => {
  test('la pantalla de inicio de sesión no tiene violaciones serias/críticas', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Iniciar sesión', exact: true }),
    ).toBeVisible();

    const { violations } = await axe(page).analyze();
    const blocking = seriousOrCritical(violations);
    expect(blocking, summarize(blocking)).toEqual([]);
  });

  test('el listado de solicitudes (tabla) no tiene violaciones serias/críticas', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname.endsWith('/requests'),
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        // El servidor pagina (oleada 3, PR-B): el mock aplica los mismos parámetros.
        const served = serveRequestList(REQUESTS_FIXTURE, new URL(route.request().url()));
        await route.fulfill({
          response,
          json: served.rows,
          headers: { ...response.headers(), ...paginationHeaders(served.total) },
        });
      },
    );
    await page.goto('/demanda/solicitudes');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Solicitudes', exact: true }),
    ).toBeVisible();
    // Espera a que la región de la tabla esté montada antes de analizar.
    await expect(page.getByRole('region', { name: 'Tabla de solicitudes' })).toBeVisible();

    const { violations } = await axe(page).analyze();
    const blocking = seriousOrCritical(violations);
    expect(blocking, summarize(blocking)).toEqual([]);
  });

  test('un diálogo abierto no tiene violaciones serias/críticas', async ({ page }) => {
    await page.goto('/catalogs');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Maestras', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo elemento', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const { violations } = await axe(page).analyze();
    const blocking = seriousOrCritical(violations);
    expect(blocking, summarize(blocking)).toEqual([]);
  });
});

/*
 * Oleada 3 · PR-C: axe en las pantallas con tarjetas móviles o con ajustes de
 * contraste (campana en oscuro, «Vencido», IdChip, etiquetas del presupuesto de
 * IA), en tema claro y oscuro y a 1440 y 390 px. Los datos que la BD de la CI
 * no tiene se sustituyen con fixtures (helpers/oleada3-fixtures.ts).
 */
const OLEADA3_ROUTES: Array<{ path: string; heading: string; actor?: string }> = [
  // Agentes de IA solo lo ve el administrador.
  { path: '/administracion/ia', heading: 'Agentes de IA', actor: 'admin@demo.local' },
  { path: '/administracion/revision', heading: 'Aprobaciones' },
  { path: '/seguimiento/reuniones?tab=mis-abiertos', heading: 'Reuniones y compromisos' },
  { path: '/mi-trabajo', heading: 'Mi trabajo' },
  { path: '/gobierno/auditoria', heading: 'Auditoría' },
  { path: '/activos/capacidad', heading: 'Capacidad' },
  { path: '/seguimiento/plan', heading: 'Planificación' },
  { path: '/gobierno/equipo', heading: 'Equipo y permisos' },
  { path: '/actividades-recurrentes', heading: 'Actividades recurrentes' },
];
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

/** Cambia el actor de desarrollo (localStorage) antes de cargar la página. */
async function actAs(page: Page, identifier: string): Promise<void> {
  await page.addInitScript((id) => window.localStorage.setItem('actorId', id), identifier);
}

/**
 * Deuda previa, fuera del alcance de PR-C y anotada en el backlog: nombres
 * accesibles que no contienen el texto visible (WCAG 2.5.3) en las fichas de
 * indicadores y controles de estado/avance de Mi trabajo, Reuniones y
 * Actividades recurrentes. El resto de reglas serias/críticas sí se exige.
 */
const OLEADA3_PENDING_RULES = ['label-content-name-mismatch'];

test.describe('accesibilidad oleada 3 (axe-core)', () => {
  for (const route of OLEADA3_ROUTES) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const viewport of VIEWPORTS) {
        test(`${route.path} · ${scheme} · ${viewport.name} px`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.emulateMedia({ colorScheme: scheme });
          await mockOleada3Data(page);
          if (route.actor) await actAs(page, route.actor);
          await page.goto(route.path);
          await expect(
            page.getByRole('heading', { level: 1, name: route.heading, exact: true }),
          ).toBeVisible({ timeout: 15_000 });
          // Espera a que termine la carga de datos antes de analizar.
          await page.waitForLoadState('networkidle');
          await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
          const { violations } = await axe(page).disableRules(OLEADA3_PENDING_RULES).analyze();
          const blocking = seriousOrCritical(violations);
          expect(blocking, summarize(blocking)).toEqual([]);
        });
      }
    }
  }

  test('IdChip mide al menos 24 × 24 px (WCAG 2.5.8)', async ({ page }) => {
    await mockOleada3Data(page);
    await page.goto('/administracion/revision');
    const chip = page.locator('[data-id-chip]:visible').first();
    await expect(chip).toBeVisible({ timeout: 15_000 });
    const box = await chip.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  });

  test('los campos del presupuesto de IA tienen nombre accesible y son inputs', async ({
    page,
  }) => {
    await actAs(page, 'admin@demo.local');
    await page.goto('/administracion/ia');
    const budget = page.getByLabel('Tope mensual (USD)');
    const alertPct = page.getByLabel('Umbral de aviso (% del tope)');
    await expect(budget).toHaveAttribute('type', 'number');
    await expect(alertPct).toHaveAttribute('type', 'number');
    // Con un valor inválido, el error llega al propio input.
    await alertPct.fill('150');
    await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
    await expect(alertPct).toHaveAttribute('aria-invalid', 'true');
  });
});
