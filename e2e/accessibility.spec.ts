import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
// Solo tipo: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL.
import type { Request } from '../apps/web/src/lib/api-client';

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
        await route.fulfill({ response, json: REQUESTS_FIXTURE });
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
