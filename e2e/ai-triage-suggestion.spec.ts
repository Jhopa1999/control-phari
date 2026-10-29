import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Sugerencia de IA en la mesa de triage (IA Fase 1, BL-007 / BL-020).
 *
 * Qué se prueba: lo que ve y puede hacer la persona que hace triage. La
 * invocación a Bedrock NO forma parte de la prueba: solo se intercepta la
 * respuesta de `POST /requests/:id/ai/triage-suggestion`, así que la suite no
 * necesita credenciales de AWS ni la IA encendida. El resto (solicitud, catálogo
 * y formulario de triage) va contra la API real y el seed.
 *
 * Reglas de producto que protege:
 * - la sugerencia es una señal: nada se registra por sí sola (HU-T3/HU-T4);
 * - «Usar» solo prefija el formulario, no lo envía;
 * - si la IA no está disponible (409, 422, 503) el triage manual sigue
 *   funcionando y se explica qué pasó (HU-T5).
 *
 * Usa el storageState del jefe (jefe@demo.local), que puede hacer triage.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const HEADERS = { 'X-Actor-Id': 'jefe@demo.local' } as const;

let requestId = '';
let requestTitle = '';

test.beforeAll(async ({ request }) => {
  const ts = Date.now();
  const processesRes = await request.get(`${API_URL}/processes`, { headers: HEADERS });
  expect(processesRes.ok(), `GET /processes → ${processesRes.status()}`).toBeTruthy();
  const processes = (await processesRes.json()) as Array<{ id: string }>;
  expect(processes.length, 'el seed debe tener procesos').toBeGreaterThan(0);

  // Solicitud REGISTRADA: es la que aparece en «Pendientes de triage».
  requestTitle = `E2E sugerencia IA ${ts}`;
  const created = await request.post(`${API_URL}/requests`, {
    headers: HEADERS,
    data: { title: requestTitle, mainProcessId: processes[0].id },
  });
  expect(created.ok(), `POST /requests → ${created.status()} ${await created.text()}`).toBeTruthy();
  requestId = ((await created.json()) as { id: string }).id;
});

/** Respuesta válida del endpoint (contrato `TriageSuggestionResponseDto`). */
function suggestionBody() {
  return {
    requestId,
    title: requestTitle,
    confidence: 0.82,
    reason: 'Basado en la ficha de la solicitud.',
    suggestedRouteCode: null,
    suggestedDemandTypeCode: null,
    suggestedCriticalityCode: 'ALTA',
    suggestedSizeCode: null,
    suggestedDataAvailabilityCode: 'PARCIAL',
    tentativePriorityBand: 'P2',
    priorityRationale: 'Impacta un reporte de cierre mensual.',
    possibleDuplicates: [
      {
        requestId: '00000000-0000-4000-8000-000000000001',
        title: 'Reporte de cierre mensual (anterior)',
        reason: 'Mismo reporte, distinto periodo.',
      },
    ],
    missingInformation: ['No se indica la fuente de los datos.'],
    model: 'modelo-de-prueba',
    agentCode: 'TRIAGE',
  };
}

const SUGGESTION_URL = (id: string) => `**/requests/${id}/ai/triage-suggestion`;

/** Abre la mesa de triage con la solicitud ya seleccionada. */
async function openTriage(page: Page): Promise<void> {
  await page.goto(`/demanda/triage?requestId=${encodeURIComponent(requestId)}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Sugerencia de IA' })).toBeVisible();
}

test('la sugerencia se muestra como señal y «Usar» solo prefija el formulario', async ({ page }) => {
  // Cualquier escritura de triage durante la prueba sería un fallo del producto.
  const triageWrites: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/requests\/[^/]+\/triage$/.test(new URL(r.url()).pathname)) {
      triageWrites.push(r.url());
    }
  });
  let suggestionCalls = 0;
  await page.route(SUGGESTION_URL(requestId), async (route: Route) => {
    suggestionCalls += 1;
    await route.fulfill({ status: 201, json: suggestionBody() });
  });

  await openTriage(page);
  await page.getByRole('button', { name: 'Sugerir con IA' }).click();

  // Contenido: clasificación, banda orientativa con justificación, duplicados y faltantes.
  const panel = page.getByRole('region', { name: 'Sugerencia de IA' });
  await expect(panel.getByRole('heading', { name: 'Clasificación sugerida' })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: 'Criticidad:' })).toContainText('Alta');
  await expect(panel.getByRole('listitem').filter({ hasText: 'Ruta:' })).toContainText('Sin sugerencia');
  await expect(panel.getByRole('heading', { name: 'Prioridad orientativa' })).toBeVisible();
  await expect(panel.getByText('Impacta un reporte de cierre mensual.')).toBeVisible();
  await expect(panel.getByText('Es una señal, no el score oficial de priorización.')).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Reporte de cierre mensual (anterior)' }),
  ).toBeVisible();
  await expect(panel.getByText('No se indica la fuente de los datos.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Volver a sugerir' })).toBeVisible();
  expect(suggestionCalls).toBe(1);

  // «Usar» prefija el campo del formulario con el code sugerido.
  const criticality = page.getByRole('combobox', { name: 'Criticidad' });
  await expect(criticality).not.toHaveText('Alta');
  await panel
    .getByRole('listitem')
    .filter({ hasText: 'Criticidad:' })
    .getByRole('button', { name: 'Usar' })
    .click();
  await expect(criticality).toHaveText('Alta');

  // Nada se registró: la decisión sigue siendo de la persona.
  expect(triageWrites).toEqual([]);
  await expect(page.getByRole('button', { name: 'Guardar triage' })).toBeEnabled();
});

// Sin `message` en el cuerpo, la UI usa el texto por defecto de cada estado.
const DEGRADATIONS = [
  { status: 409, text: 'La sugerencia de IA no está disponible ahora.' },
  { status: 422, text: 'La IA devolvió una respuesta no interpretable.' },
  { status: 503, text: 'La IA no respondió a tiempo.' },
] as const;

for (const { status, text } of DEGRADATIONS) {
  test(`si la IA responde ${status}, se explica y el triage manual sigue disponible`, async ({
    page,
  }) => {
    await page.route(SUGGESTION_URL(requestId), async (route: Route) => {
      await route.fulfill({ status, json: { statusCode: status, error: 'Error' } });
    });

    await openTriage(page);
    await page.getByRole('button', { name: 'Sugerir con IA' }).click();

    const panel = page.getByRole('region', { name: 'Sugerencia de IA' });
    await expect(panel.getByText('No hay sugerencia disponible.')).toBeVisible();
    await expect(panel.getByText(text)).toBeVisible();
    // Sin sugerencia: el botón sigue ofreciendo pedirla, y no hay clasificación.
    await expect(panel.getByRole('button', { name: 'Sugerir con IA' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Clasificación sugerida' })).toHaveCount(0);

    // El formulario de triage no se bloquea.
    await expect(page.getByRole('combobox', { name: 'Criticidad' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Guardar triage' })).toBeEnabled();
  });
}

test('el mensaje específico del servidor se muestra tal cual', async ({ page }) => {
  await page.route(SUGGESTION_URL(requestId), async (route: Route) => {
    await route.fulfill({
      status: 409,
      json: { statusCode: 409, error: 'Conflict', message: 'La sugerencia de IA esta desactivada.' },
    });
  });

  await openTriage(page);
  await page.getByRole('button', { name: 'Sugerir con IA' }).click();

  await expect(
    page
      .getByRole('region', { name: 'Sugerencia de IA' })
      .getByText('La sugerencia de IA esta desactivada.'),
  ).toBeVisible();
});
