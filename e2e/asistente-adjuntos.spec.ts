import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import {
  FALLBACK_LIMITS,
  acceptAttribute,
  extensionOf,
  fileKindOf,
  formatFileSize,
  limitsSummary,
  maxBytesFor,
  sendBlockReason,
  statusLabel,
  validateAttachmentFile,
} from '../apps/web/src/lib/assistant-attachments';

/**
 * Adjuntos del chat del asistente (BL-032 F4a): imágenes y documentos que la
 * persona sube, cuyo contenido se lee como texto que puede revisar y corregir.
 *
 * Bedrock, S3 y el MCP NO forman parte de esta prueba: se interceptan las rutas
 * `/assistant/*`. Lo que protege:
 * - se valida el tipo y el tamaño ANTES de subir y se explica el motivo;
 * - no se envía mientras un adjunto se sube, se lee o falló, y se dice por qué;
 * - el texto extraído se puede revisar, corregir y guardar antes de enviarlo;
 * - se puede enviar solo con adjuntos, y estos quedan visibles en el mensaje;
 * - un fallo recuperable permite reintentar; quitar un adjunto borra su archivo.
 */
test.describe('utilidades de adjuntos', () => {
  test('valida tipo, vacío y tamaño según el tipo de archivo', () => {
    const ok = (name: string, size = 1000) => validateAttachmentFile({ name, size }, FALLBACK_LIMITS);
    expect(ok('captura.png')).toBeNull();
    expect(ok('informe.PDF')).toBeNull();
    expect(ok('notas.md')).toBeNull();
    expect(ok('virus.exe')).toMatch(/no está permitido/);
    expect(ok('sin-extension')).toMatch(/no está permitido/);
    expect(ok('vacio.pdf', 0)).toMatch(/vacío/);
    expect(ok('grande.png', FALLBACK_LIMITS.maxImageBytes + 1)).toMatch(/máximo para este tipo/);
    // Cada tipo tiene su propio máximo (el de los documentos es mayor que el de las imágenes).
    expect(ok('grande.pdf', FALLBACK_LIMITS.maxImageBytes + 1)).toBeNull();
    expect(ok('grande.txt', FALLBACK_LIMITS.maxTextBytes + 1)).not.toBeNull();
  });

  test('el cliente usa los mismos límites de respaldo que la API', async () => {
    const constants = await import('../apps/api/src/modules/assistant/assistant.constants');
    expect(FALLBACK_LIMITS.maxFiles).toBe(constants.MAX_ATTACHMENTS_PER_MESSAGE);
    expect(FALLBACK_LIMITS.maxImageBytes).toBe(constants.MAX_IMAGE_BYTES);
    expect(FALLBACK_LIMITS.maxDocumentBytes).toBe(constants.MAX_DOCUMENT_BYTES);
    expect(FALLBACK_LIMITS.maxTextBytes).toBe(constants.MAX_TEXT_FILE_BYTES);
    expect(FALLBACK_LIMITS.maxTextChars).toBe(constants.MAX_ATTACHMENT_TEXT_CHARS);
    expect([...FALLBACK_LIMITS.extensions].sort()).toEqual([...constants.ATTACHMENT_EXTENSIONS].sort());
  });

  test('formatea tamaños en decimal y en español', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(340_000)).toBe('340 KB');
    expect(formatFileSize(2_100_000)).toBe('2,1 MB');
    expect(formatFileSize(3_750_000)).toBe('3,75 MB');
  });

  test('clasifica por extensión y arma el selector de archivos', () => {
    expect(extensionOf('Informe.Final.PDF')).toBe('pdf');
    expect(fileKindOf('a.png')).toBe('imagen');
    expect(fileKindOf('a.xlsx')).toBe('hoja');
    expect(fileKindOf('a.docx')).toBe('word');
    expect(fileKindOf('a.md')).toBe('texto');
    expect(maxBytesFor('a.png', FALLBACK_LIMITS)).toBe(FALLBACK_LIMITS.maxImageBytes);
    expect(acceptAttribute(FALLBACK_LIMITS)).toContain('.png');
    expect(acceptAttribute(FALLBACK_LIMITS)).toContain('.xlsx');
    expect(limitsSummary(FALLBACK_LIMITS)).toBe(
      'Hasta 5 archivos · imágenes de hasta 3,75 MB y documentos de hasta 4,5 MB',
    );
  });

  test('explica por qué no se puede enviar mientras haya adjuntos pendientes o con error', () => {
    expect(sendBlockReason([])).toBeNull();
    expect(sendBlockReason([{ status: 'listo' }])).toBeNull();
    expect(sendBlockReason([{ status: 'subiendo' }])).toBe(
      'Espera a que termine de leerse 1 adjunto para enviar.',
    );
    expect(sendBlockReason([{ status: 'extrayendo' }, { status: 'subiendo' }])).toBe(
      'Espera a que terminen de leerse 2 adjuntos para enviar.',
    );
    expect(sendBlockReason([{ status: 'listo' }, { status: 'error' }])).toBe(
      'Hay un adjunto con error. Quítalo o reinténtalo.',
    );
  });

  test('etiquetas de estado del chip', () => {
    expect(statusLabel('subiendo', 45, false)).toBe('Subiendo… 45 %');
    expect(statusLabel('subiendo', null, false)).toBe('Subiendo…');
    expect(statusLabel('extrayendo', null, false)).toBe('Leyendo contenido…');
    expect(statusLabel('listo', null, false)).toBe('Listo');
    expect(statusLabel('listo', null, true)).toBe('Listo · editado');
  });
});

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const PNG = {
  name: 'captura.png',
  mimeType: 'image/png',
  // 1x1 PNG válido.
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

interface MockOptions {
  /** Retraso (ms) de la respuesta de la subida, para observar los estados intermedios. */
  uploadDelay?: number;
  /** Respuestas sucesivas de la subida; las que faltan responden bien. */
  uploadStatuses?: number[];
}

function attachmentJson(id: string, fileName: string, text = 'Solicitud: Tablero regional de ventas') {
  return {
    id,
    fileName,
    contentType: 'image/png',
    sizeBytes: 70,
    kind: 'imagen',
    extractedText: text,
    truncated: false,
    createdAt: new Date().toISOString(),
  };
}

async function mockAssistant(page: Page, options: MockOptions = {}) {
  const calls = {
    uploads: 0,
    patches: [] as Array<{ id: string; text: string }>,
    deleted: [] as string[],
    chatBodies: [] as Array<{ message: string; attachmentIds?: string[] }>,
  };
  let uploadSeq = 0;

  await page.route('**/assistant/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      json: { available: true, reason: null, attachments: { ...FALLBACK_LIMITS } },
    });
  });

  await page.route('**/assistant/attachments', async (route: Route) => {
    calls.uploads += 1;
    if (options.uploadDelay) await new Promise((r) => setTimeout(r, options.uploadDelay));
    const status = options.uploadStatuses?.[calls.uploads - 1] ?? 201;
    if (status !== 201) {
      await route.fulfill({
        status,
        json: { message: status === 502 ? 'No pudimos leer el archivo. Inténtalo de nuevo.' : 'Rechazado.' },
      });
      return;
    }
    const body = route.request().postData() ?? '';
    const fileName = /filename="([^"]+)"/.exec(body)?.[1] ?? 'archivo.png';
    uploadSeq += 1;
    await route.fulfill({
      status: 201,
      json: attachmentJson(`aaaaaaaa-0000-4000-8000-00000000000${uploadSeq}`, fileName),
    });
  });

  await page.route(/\/assistant\/attachments\/[^/?]+$/, async (route: Route) => {
    const id = /attachments\/([^/?]+)$/.exec(route.request().url())?.[1] ?? '';
    if (route.request().method() === 'PATCH') {
      const text = (route.request().postDataJSON() as { extractedText: string }).extractedText;
      calls.patches.push({ id, text });
      await route.fulfill({ status: 200, json: attachmentJson(id, 'captura.png', text) });
      return;
    }
    calls.deleted.push(id);
    await route.fulfill({ status: 204 });
  });

  await page.route('**/assistant/chat', async (route: Route) => {
    calls.chatBodies.push(route.request().postDataJSON() as { message: string; attachmentIds?: string[] });
    const events: Array<[string, unknown]> = [
      ['conversation', { conversationId: CONVERSATION_ID, title: 'Adjuntos' }],
      ['text', { delta: 'Leí tu captura: es el tablero regional de ventas.' }],
      ['done', { messageId: '22222222-2222-4222-8222-222222222222' }],
    ];
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''),
    });
  });

  await page.route(/\/assistant\/conversations(\/[^/?]+)?(\?.*)?$/, async (route: Route) => {
    await route.fulfill({ status: 200, json: [] });
  });

  return calls;
}

async function openPanel(page: Page) {
  await page.goto('/inicio');
  await page.getByRole('button', { name: 'Abrir asistente' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Asistente' });
  await expect(panel).toBeVisible();
  return panel;
}

const fileInput = (panel: Locator) => panel.getByTestId('assistant-file-input');

test('adjunta una imagen, revisa y corrige el texto leído y la envía sin escribir nada', async ({ page }) => {
  const calls = await mockAssistant(page);
  const panel = await openPanel(page);

  await fileInput(panel).setInputFiles(PNG);
  const list = panel.getByRole('list', { name: 'Archivos adjuntos' });
  const chip = list.getByRole('button', { name: /captura\.png, Imagen, .*Listo/ });
  await expect(chip).toBeVisible();

  // Revisar y corregir el texto que leyó el asistente.
  await chip.click();
  const dialog = page.getByRole('dialog', { name: 'captura.png' });
  await expect(dialog.getByText('Esto entendí del adjunto:')).toBeVisible();
  const text = dialog.getByRole('textbox');
  await expect(text).toHaveValue('Solicitud: Tablero regional de ventas');
  await expect(dialog.getByText(/se enviará al asistente/)).toBeVisible();
  await text.fill('Solicitud: Tablero regional de ventas\nÁrea: Finanzas');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  expect(calls.patches).toHaveLength(1);
  expect(calls.patches[0].text).toContain('Área: Finanzas');
  await expect(list.getByRole('button', { name: /captura\.png.*Listo · editado/ })).toBeVisible();

  // Se puede enviar solo con adjuntos (sin texto).
  const send = panel.getByRole('button', { name: 'Enviar mensaje' });
  await expect(send).toBeEnabled();
  await send.click();

  const message = panel.getByRole('article', { name: 'Tu mensaje' });
  await expect(message.getByRole('button', { name: /Ver texto extraído de captura\.png/ })).toBeVisible();
  await expect(panel.getByRole('article', { name: 'Respuesta del asistente' })).toContainText('tablero regional');
  expect(calls.chatBodies).toHaveLength(1);
  expect(calls.chatBodies[0].message).toBe('');
  expect(calls.chatBodies[0].attachmentIds).toHaveLength(1);
  // Los adjuntos del compositor se vaciaron al enviar.
  await expect(panel.getByRole('list', { name: 'Archivos adjuntos', exact: true })).toHaveCount(0);

  // El chip del mensaje enviado abre el texto en solo lectura.
  await message.getByRole('button', { name: /Ver texto extraído de captura\.png/ }).click();
  const readonly = page.getByRole('dialog', { name: 'captura.png' });
  await expect(readonly.getByText('Este fue el texto que se envió al asistente.')).toBeVisible();
  await expect(readonly.getByRole('textbox')).toHaveAttribute('readonly', '');
  await expect(readonly.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
});

test('no se puede enviar mientras el adjunto se sube o se lee y se explica por qué', async ({ page }) => {
  await mockAssistant(page, { uploadDelay: 1200 });
  const panel = await openPanel(page);

  await fileInput(panel).setInputFiles(PNG);
  const send = panel.getByRole('button', { name: 'Enviar mensaje' });
  await panel.getByRole('textbox', { name: 'Mensaje para el asistente' }).fill('Mira esto');
  await expect(send).toBeDisabled();
  await expect(panel.getByText('Espera a que termine de leerse 1 adjunto para enviar.')).toBeVisible();

  // Al terminar, se habilita.
  await expect(panel.getByRole('button', { name: /captura\.png.*Listo/ })).toBeVisible();
  await expect(send).toBeEnabled();
  await expect(panel.getByText(/Espera a que termine/)).toHaveCount(0);
});

test('rechaza un tipo no permitido sin subirlo y explica el motivo', async ({ page }) => {
  const calls = await mockAssistant(page);
  const panel = await openPanel(page);

  await fileInput(panel).setInputFiles({
    name: 'virus.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('MZ'),
  });
  const alert = panel.getByRole('alert').filter({ hasText: 'No se puede adjuntar virus.exe' });
  await expect(alert).toContainText('no está permitido');
  await expect(panel.getByRole('list', { name: 'Archivos adjuntos' })).toHaveCount(0);
  expect(calls.uploads).toBe(0);

  await alert.getByRole('button', { name: 'Descartar aviso' }).click();
  await expect(alert).toBeHidden();
});

test('acepta hasta 5 archivos por mensaje y avisa del resto', async ({ page }) => {
  const calls = await mockAssistant(page);
  const panel = await openPanel(page);

  const files = Array.from({ length: 6 }, (_, i) => ({ ...PNG, name: `captura-${i + 1}.png` }));
  await fileInput(panel).setInputFiles(files);
  await expect(panel.getByRole('status').filter({ hasText: 'Máximo 5 archivos por mensaje' })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Archivos adjuntos' }).getByRole('listitem')).toHaveCount(5);
  expect(calls.uploads).toBe(5);
  // Con 5, el clip queda no disponible y lo dice.
  await expect(panel.getByRole('button', { name: 'Adjuntar archivos' })).toHaveAttribute('aria-disabled', 'true');
  await expect(panel.getByText('Ya adjuntaste 5 archivos. Quita uno para añadir otro.')).toBeVisible();
});

test('un fallo recuperable permite reintentar y bloquea el envío mientras tanto', async ({ page }) => {
  const calls = await mockAssistant(page, { uploadStatuses: [502] });
  const panel = await openPanel(page);

  await fileInput(panel).setInputFiles(PNG);
  const list = panel.getByRole('list', { name: 'Archivos adjuntos' });
  await expect(list.getByText('No pudimos leer el archivo. Inténtalo de nuevo.')).toBeVisible();
  await expect(panel.getByText('Hay un adjunto con error. Quítalo o reinténtalo.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();

  await list.getByRole('button', { name: 'Reintentar captura.png' }).click();
  await expect(list.getByRole('button', { name: /captura\.png.*Listo/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled();
  expect(calls.uploads).toBe(2);
});

test('un rechazo definitivo del servidor no ofrece reintentar y se puede quitar', async ({ page }) => {
  const calls = await mockAssistant(page, { uploadStatuses: [422] });
  const panel = await openPanel(page);

  await fileInput(panel).setInputFiles(PNG);
  const list = panel.getByRole('list', { name: 'Archivos adjuntos' });
  await expect(list.getByText('Rechazado.')).toBeVisible();
  await expect(list.getByRole('button', { name: 'Reintentar captura.png' })).toHaveCount(0);
  await list.getByRole('button', { name: 'Quitar captura.png' }).click();
  await expect(list).toHaveCount(0);
  // Nunca se guardó en el servidor: no hay nada que borrar.
  expect(calls.deleted).toHaveLength(0);
});

test('quitar un adjunto listo borra su archivo en el servidor', async ({ page }) => {
  const calls = await mockAssistant(page);
  const panel = await openPanel(page);

  await fileInput(panel).setInputFiles(PNG);
  const list = panel.getByRole('list', { name: 'Archivos adjuntos' });
  await expect(list.getByRole('button', { name: /captura\.png.*Listo/ })).toBeVisible();
  await list.getByRole('button', { name: 'Quitar captura.png' }).click();
  await expect(list).toHaveCount(0);
  await expect.poll(() => calls.deleted.length).toBe(1);
});
