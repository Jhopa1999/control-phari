import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Asistente de IA (BL-032 F2): lo que ve y puede hacer la persona.
 *
 * Bedrock y el MCP NO forman parte de esta prueba: se interceptan las rutas
 * `/assistant/*` y se responde el flujo SSE a mano, de modo que la suite no
 * necesita credenciales de AWS, la IA encendida ni el MCP. El resto del portal
 * (shell, navegación, sesión del jefe del storageState) va contra la API real.
 *
 * Reglas de producto que protege:
 * - el asistente es accesible desde cualquier pantalla (panel) y tiene página propia;
 * - si no está disponible se explica el motivo y no se puede escribir;
 * - un fallo antes del flujo conserva el mensaje y ofrece reintentar;
 * - eliminar una conversación pide confirmación.
 */
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

/** Cuerpo SSE de una respuesta que consultó una herramienta y devolvió una tabla. */
function sseBody(withProposal = false): string {
  const events: Array<[string, unknown]> = withProposal
    ? [
        ['conversation', { conversationId: CONVERSATION_ID, title: 'Crear solicitud' }],
        ['text', { delta: 'Preparé la solicitud; confírmala para crearla.' }],
        ['proposal', PROPOSAL],
        ['done', { messageId: '22222222-2222-4222-8222-222222222222' }],
      ]
    : [
    ['conversation', { conversationId: CONVERSATION_ID, title: '¿Cuántas solicitudes hay?' }],
    ['tool', { id: 't1', name: 'request.list', label: 'solicitudes', status: 'running' }],
    ['tool', { id: 't1', name: 'request.list', label: 'solicitudes', status: 'done' }],
    ['text', { delta: 'Hay **2 solicitudes**:\n\n| Estado | Cantidad |\n| --- | --- |\n' }],
    ['text', { delta: '| REGISTRADA | 1 |\n| CERRADA | 1 |\n\nVer [Portafolio](/seguimiento/portafolio).' }],
    ['done', { messageId: '22222222-2222-4222-8222-222222222222' }],
  ];
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

/** Propuesta pendiente que el asistente prepara en los tests de acciones. */
const PROPOSAL_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const PROPOSAL = {
  id: PROPOSAL_ID,
  toolName: 'request.create',
  title: 'Crear solicitud',
  summary: 'Crear la solicitud «Reporte de ventas» en el proceso BI',
  args: { body: { title: 'Reporte de ventas', mainProcessId: 'proc-bi' } },
  status: 'PENDIENTE',
  resultId: null,
  resultTitle: null,
  error: null,
  createdAt: new Date().toISOString(),
};

interface MockOptions {
  /** El asistente responde con una propuesta de acción. */
  proposal?: boolean;
  /** Resultado de confirmar: ok (por defecto), rechazada por la API o vencida (409). */
  confirm?: 'ok' | 'rechazada' | 'vencida';
  available?: boolean;
  reason?: string | null;
  chatStatus?: number;
}

/** Intercepta las rutas del asistente. Devuelve contadores para afirmar. */
async function mockAssistant(page: Page, options: MockOptions = {}) {
  const calls = { chat: 0, confirm: 0, discard: 0, deleted: [] as string[] };
  let conversations = [
    { id: CONVERSATION_ID, title: 'Estado de mis proyectos', updatedAt: new Date().toISOString() },
  ];

  await page.route('**/assistant/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      json: { available: options.available ?? true, reason: options.reason ?? null },
    });
  });

  await page.route('**/assistant/chat', async (route: Route) => {
    calls.chat += 1;
    if (options.chatStatus && options.chatStatus !== 200) {
      await route.fulfill({ status: options.chatStatus, json: { message: 'fallo' } });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: sseBody(options.proposal),
    });
  });

  await page.route(/\/assistant\/proposals\/[^/]+\/(confirm|discard)$/, async (route: Route) => {
    const action = /\/(confirm|discard)$/.exec(route.request().url())?.[1];
    if (action === 'discard') {
      calls.discard += 1;
      await route.fulfill({ status: 200, json: { ...PROPOSAL, status: 'DESCARTADA' } });
      return;
    }
    calls.confirm += 1;
    if (options.confirm === 'vencida') {
      await route.fulfill({ status: 409, json: { message: 'La propuesta venció. Pídele al asistente que la vuelva a preparar.' } });
    } else if (options.confirm === 'rechazada') {
      await route.fulfill({ status: 200, json: { ...PROPOSAL, status: 'FALLIDA', error: 'No tienes acceso a esta acción.' } });
    } else {
      await route.fulfill({
        status: 200,
        json: { ...PROPOSAL, status: 'CONFIRMADA', resultId: REQUEST_ID, resultTitle: 'Reporte de ventas' },
      });
    }
  });

  await page.route(/\/assistant\/conversations(\/[^/?]+)?(\?.*)?$/, async (route: Route) => {
    const method = route.request().method();
    const match = /\/assistant\/conversations\/([^/?]+)/.exec(route.request().url());
    if (method === 'DELETE' && match) {
      calls.deleted.push(match[1]);
      conversations = conversations.filter((c) => c.id !== match[1]);
      await route.fulfill({ status: 204 });
      return;
    }
    if (match) {
      await route.fulfill({
        status: 200,
        json: {
          id: match[1],
          title: 'Estado de mis proyectos',
          messages: [
            { id: 'm1', role: 'user', text: '¿Cómo van mis proyectos?', tools: [], proposals: [], createdAt: new Date().toISOString() },
            {
              id: 'm2',
              role: 'assistant',
              text: 'Todo va **bien**.',
              tools: [{ name: 'portfolio.get', label: 'portafolio', status: 'done' }],
              proposals: options.proposal ? [PROPOSAL] : [],
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ status: 200, json: conversations });
  });

  return calls;
}

async function openPanel(page: Page): Promise<void> {
  await page.goto('/inicio');
  await page.getByRole('button', { name: 'Abrir asistente' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Asistente' })).toBeVisible();
}

test('el panel abre con sugerencias y una pregunta muestra herramientas, tabla y enlace', async ({ page }) => {
  const calls = await mockAssistant(page);
  await openPanel(page);
  const panel = page.getByRole('dialog', { name: 'Asistente' });

  await expect(panel.getByRole('heading', { name: '¿En qué te puedo ayudar?' })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Preguntas sugeridas' }).getByRole('button')).toHaveCount(5);
  // El foco inicial está en el campo de mensaje.
  await expect(panel.getByRole('textbox', { name: 'Mensaje para el asistente' })).toBeFocused();

  await panel.getByRole('textbox', { name: 'Mensaje para el asistente' }).fill('¿Cuántas solicitudes hay?');
  await panel.getByRole('textbox', { name: 'Mensaje para el asistente' }).press('Enter');

  const answer = panel.getByRole('article', { name: 'Respuesta del asistente' });
  await expect(answer).toContainText('Hay 2 solicitudes');
  await expect(answer.getByRole('region', { name: 'Tabla de la respuesta' })).toBeVisible();
  await expect(answer.getByRole('cell', { name: 'REGISTRADA' })).toBeVisible();
  // Enlace interno del portal: misma pestaña.
  await expect(answer.getByRole('link', { name: 'Portafolio' })).toHaveAttribute(
    'href',
    '/seguimiento/portafolio',
  );
  // Herramientas: resumen colapsado que se expande.
  const sources = answer.getByRole('button', { name: /Consultó 1 fuente/ });
  await expect(sources).toHaveAttribute('aria-expanded', 'false');
  await sources.click();
  await expect(answer.getByRole('list', { name: 'Fuentes consultadas' })).toContainText('Solicitudes');
  await expect(answer.getByRole('button', { name: 'Copiar' })).toBeVisible();
  // El campo se limpió y el mensaje del usuario quedó en el hilo.
  await expect(panel.getByRole('article', { name: 'Tu mensaje' })).toContainText('¿Cuántas solicitudes hay?');
  expect(calls.chat).toBe(1);
});

test('Mayús+Enter inserta un salto de línea y no envía', async ({ page }) => {
  const calls = await mockAssistant(page);
  await openPanel(page);
  const input = page.getByRole('textbox', { name: 'Mensaje para el asistente' });
  await input.fill('línea 1');
  await input.press('Shift+Enter');
  await input.pressSequentially('línea 2');
  await expect(input).toHaveValue('línea 1\nlínea 2');
  expect(calls.chat).toBe(0);
});

test('una pregunta sugerida se envía de inmediato', async ({ page }) => {
  const calls = await mockAssistant(page);
  await openPanel(page);
  await page.getByRole('button', { name: '¿Qué solicitudes están bloqueadas y por qué?' }).click();
  await expect(page.getByRole('article', { name: 'Respuesta del asistente' })).toContainText(
    'Hay 2 solicitudes',
  );
  expect(calls.chat).toBe(1);
});

test('si el asistente no está disponible, el botón lo indica y el motivo se lee', async ({ page }) => {
  await mockAssistant(page, { available: false, reason: 'Se alcanzó el presupuesto mensual de IA.' });
  await page.goto('/inicio');
  const trigger = page.getByRole('button', { name: 'Abrir asistente' }).first();
  await expect(trigger).toHaveAttribute('aria-disabled', 'true');
  // Playwright trata aria-disabled como deshabilitado: el clic real de la persona sí funciona.
  await trigger.click({ force: true });
  await expect(page.getByRole('tooltip').first()).toContainText('presupuesto mensual');
  // No se abre el panel.
  await expect(page.getByRole('dialog', { name: 'Asistente' })).toHaveCount(0);
});

test('un fallo del servidor conserva el mensaje y ofrece reintentar', async ({ page }) => {
  await mockAssistant(page, { chatStatus: 503 });
  await openPanel(page);
  const input = page.getByRole('textbox', { name: 'Mensaje para el asistente' });
  await input.fill('¿Hay algo bloqueado?');
  await input.press('Enter');
  const alert = page.getByRole('alert').filter({ hasText: 'No se pudo enviar tu mensaje' });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Tu mensaje' })).toContainText('¿Hay algo bloqueado?');
});

test('el contador avisa al acercarse al límite y bloquea el envío al superarlo', async ({ page }) => {
  await mockAssistant(page);
  await openPanel(page);
  const input = page.getByRole('textbox', { name: 'Mensaje para el asistente' });
  await input.fill('a'.repeat(3600));
  await expect(page.getByText(/3.?600 \/ 4.?000/)).toBeVisible();
  await input.fill('a'.repeat(4001));
  await expect(page.getByText(/supera el límite de 4 000 caracteres/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
});

test('la página muestra el historial, abre una conversación y elimina con confirmación', async ({ page }) => {
  const calls = await mockAssistant(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/asistente');
  const history = page.getByRole('navigation', { name: 'Conversaciones anteriores' });
  await expect(history.getByRole('link', { name: /Estado de mis proyectos/ })).toBeVisible();

  await history.getByRole('link', { name: /Estado de mis proyectos/ }).click();
  await expect(page).toHaveURL(new RegExp(`/asistente/${CONVERSATION_ID}$`));
  await expect(page.getByRole('article', { name: 'Respuesta del asistente' })).toContainText('Todo va bien.');
  await expect(page.getByRole('button', { name: /Consultó 1 fuente/ })).toBeVisible();

  await page.getByRole('button', { name: /Eliminar conversación «Estado de mis proyectos»/ }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Se borrará todo el historial de este chat.');
  // Cancelar no borra.
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  expect(calls.deleted).toEqual([]);

  await page.getByRole('button', { name: /Eliminar conversación «Estado de mis proyectos»/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar conversación' }).click();
  await expect.poll(() => calls.deleted).toEqual([CONVERSATION_ID]);
  await expect(page.getByText('Aún no tienes conversaciones.')).toBeVisible();
});

test('en móvil el panel ocupa la pantalla y el campo es utilizable', async ({ page }) => {
  await mockAssistant(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inicio');
  await page.getByRole('button', { name: 'Abrir asistente' }).click();
  const panel = page.getByRole('dialog', { name: 'Asistente' });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(385);
  const input = panel.getByRole('textbox', { name: 'Mensaje para el asistente' });
  await input.fill('hola');
  await expect(panel.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled();
  // Sin desbordamiento horizontal de la página.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------- propuestas

/** Pide una acción al asistente y devuelve la tarjeta de la propuesta. */
async function askForProposal(page: Page) {
  await openPanel(page);
  const panel = page.getByRole('dialog', { name: 'Asistente' });
  const input = panel.getByRole('textbox', { name: 'Mensaje para el asistente' });
  await input.fill('Crea una solicitud de reporte de ventas en BI');
  await input.press('Enter');
  const card = panel.getByRole('region', { name: 'Propuesta: Crear solicitud' });
  await expect(card).toBeVisible();
  return { panel, card };
}

test('el asistente PROPONE una acción: no se ejecuta hasta que la persona confirma', async ({ page }) => {
  const calls = await mockAssistant(page, { proposal: true });
  const { card } = await askForProposal(page);

  await expect(card).toContainText('Crear la solicitud «Reporte de ventas» en el proceso BI');
  await expect(card).toContainText('Pendiente de tu confirmación');
  await expect(card.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  await expect(card.getByRole('button', { name: 'Descartar' })).toBeEnabled();
  // Nada se confirmó por sí solo.
  expect(calls.confirm).toBe(0);

  // Los datos exactos están disponibles pero plegados.
  const details = card.getByRole('button', { name: 'Ver los datos exactos' });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await details.click();
  await expect(card.getByText('Reporte de ventas', { exact: true })).toBeVisible();
});

test('al confirmar se ejecuta, se informa el resultado y se enlaza el registro', async ({ page }) => {
  const calls = await mockAssistant(page, { proposal: true });
  const { card } = await askForProposal(page);

  await card.getByRole('button', { name: 'Confirmar' }).click();
  await expect(card.getByText('Listo, la acción se realizó')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Ver solicitud' })).toHaveAttribute(
    'href',
    '/demanda/solicitudes/44444444-4444-4444-8444-444444444444',
  );
  // Ya no se puede confirmar ni descartar de nuevo.
  await expect(card.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Descartar' })).toHaveCount(0);
  expect(calls.confirm).toBe(1);
});

test('descartar no ejecuta nada', async ({ page }) => {
  const calls = await mockAssistant(page, { proposal: true });
  const { card } = await askForProposal(page);

  await card.getByRole('button', { name: 'Descartar' }).click();
  await expect(card.getByText('Descartaste esta propuesta.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  expect(calls.discard).toBe(1);
  expect(calls.confirm).toBe(0);
});

test('si la API rechaza la acción, se explica el motivo y no se enlaza nada', async ({ page }) => {
  await mockAssistant(page, { proposal: true, confirm: 'rechazada' });
  const { card } = await askForProposal(page);

  await card.getByRole('button', { name: 'Confirmar' }).click();
  const alert = card.getByRole('alert');
  await expect(alert).toContainText('No se pudo realizar la acción');
  await expect(alert).toContainText('No tienes acceso a esta acción.');
  await expect(alert).toContainText('No se aplicó ningún cambio');
  await expect(card.getByRole('link', { name: 'Ver solicitud' })).toHaveCount(0);
});

test('una propuesta vencida (409) muestra el motivo del servidor', async ({ page }) => {
  await mockAssistant(page, { proposal: true, confirm: 'vencida' });
  const { card } = await askForProposal(page);

  await card.getByRole('button', { name: 'Confirmar' }).click();
  await expect(card.getByRole('alert')).toContainText('La propuesta venció');
});

test('las propuestas se conservan en el historial de la conversación', async ({ page }) => {
  await mockAssistant(page, { proposal: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/asistente/${CONVERSATION_ID}`);
  const card = page.getByRole('region', { name: 'Propuesta: Crear solicitud' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
});
