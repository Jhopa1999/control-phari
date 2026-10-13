// Comprobación de /mi-trabajo de FEAT-004 (artefacto, no se commitea).
// Sirve el GET /my-work con fixtures (route.fetch + route.fulfill, como
// date-display.spec.ts) para probar estados, filtros, orden y paginación sin
// depender de los datos de la base ni modificarlos.
// Uso: node feat-004-mi-trabajo-check.cjs <outDir>
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3300';
const OUT = path.resolve(process.argv[2] || '.');
const STATUSES = ['POR_HACER', 'EN_CURSO', 'BLOQUEADA', 'EN_REVISION', 'TERMINADA'];

function item(i) {
  const n = String(i).padStart(2, '0');
  return {
    taskId: `00000000-0000-4000-8000-0000000000${n}`,
    title: `Tarea e2e ${n}`,
    status: STATUSES[i % STATUSES.length],
    progress: (i * 10) % 110,
    isMilestone: i % 7 === 0,
    startDate: null,
    // Las tareas múltiplo de 5 no tienen fecha: deben quedar al final.
    endDate: i % 5 === 0 ? null : new Date(Date.UTC(2027, 0, 31 - i)).toISOString(),
    phaseId: '00000000-0000-4000-8000-000000000a01',
    phaseName: 'Fase e2e',
    planId: '00000000-0000-4000-8000-000000000a02',
    requestId: '00000000-0000-4000-8000-000000000a03',
    requestTitle: 'Solicitud e2e',
  };
}
const FIXTURE = Array.from({ length: 30 }, (_, i) => item(i + 1));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 }, timezoneId: 'America/Bogota' });
    await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    // Modo del fixture: 'list' | 'empty' | 'error' | 'slow'.
    let mode = 'list';
    const requests = [];
    await page.route('**/my-work', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      requests.push(route.request().headers()['x-actor-id'] || null);
      const response = await route.fetch();
      if (mode === 'error') return route.fulfill({ response, status: 500, json: { message: 'fallo de prueba' } });
      if (mode === 'empty') return route.fulfill({ response, json: [] });
      if (mode === 'slow') await wait(2500);
      return route.fulfill({ response, json: FIXTURE });
    });

    await page.goto(`${BASE}/mi-trabajo`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    const count = page.getByRole('group', { name: 'Filtros de mi trabajo' }).getByRole('status');
    await count.filter({ hasText: '30 tareas' }).waitFor({ timeout: 60000 });
    const region = page.getByRole('region', { name: 'Tabla de mis tareas' });
    const rows = region.locator('tbody tr');
    const nav = page.getByRole('navigation', { name: 'Paginación de tareas' });
    record('Un solo h1 «Mi trabajo»', (await page.locator('h1').count()) === 1 && (await page.locator('h1').innerText()) === 'Mi trabajo');
    record('Descripción de §11.1', (await page.getByText('Tareas en las que eres responsable, con su plan y su estado.').count()) === 1);
    record('ResultCount «30 tareas»', (await count.innerText()) === '30 tareas', await count.innerText());
    record('Paginación «1–25 de 30 tareas» y «Página 1 de 2»',
      (await nav.innerText()).includes('1–25 de 30 tareas') && (await nav.innerText()).includes('Página 1 de 2'), (await nav.innerText()).replace(/\s+/g, ' '));
    record('25 filas en la página 1', (await rows.count()) === 25, await rows.count());
    const headers = (await region.locator('thead th').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    record('Columnas Tarea, Solicitud, Fase, Vence y Estado (sin columna de acciones)', headers.length === 5, headers);
    const sorted = region.locator('th[aria-sort]');
    record('Orden por defecto: Vence ascendente', (await sorted.count()) === 1 && (await sorted.getAttribute('aria-sort')) === 'ascending' && (await sorted.innerText()).includes('Vence'));
    // i = 29 → 2027-01-02 es la fecha más temprana.
    record('La primera fila es la que vence antes («Tarea e2e 29», 2 ene 2027)', (await rows.first().innerText()).includes('Tarea e2e 29') && (await rows.first().innerText()).includes('2 ene 2027'), (await rows.first().innerText()).replace(/\s+/g, ' '));
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await wait(200);
    const lastRows = await rows.allInnerTexts();
    record('Página 2: las 5 filas, con las 6 sin fecha al final', lastRows.length === 5 && lastRows.every((t) => t.includes('—')), lastRows.map((t) => t.replace(/\s+/g, ' ').slice(0, 40)));
    await page.getByRole('button', { name: 'Página anterior' }).click();
    const sortVence = region.getByRole('button', { name: 'Vence, ordenar' });
    await sortVence.click();
    await wait(200);
    record('Vence descendente: la que vence más tarde primero y sin fecha al final', (await sorted.getAttribute('aria-sort')) === 'descending' && (await rows.first().innerText()).includes('Tarea e2e 01'), (await rows.first().innerText()).replace(/\s+/g, ' '));
    await sortVence.click();
    await wait(200);
    record('Vence (orden por defecto) vuelve a ascendente', (await sorted.getAttribute('aria-sort')) === 'ascending');
    await region.getByRole('button', { name: 'Estado, ordenar' }).click();
    await wait(200);
    record('Estado ascendente en el orden del flujo: primero «Por hacer»', (await rows.first().innerText()).includes('Por hacer'));
    await region.getByRole('button', { name: 'Tarea, ordenar' }).click();
    await wait(200);
    record('Tarea ascendente: «Tarea e2e 01» primero', (await rows.first().innerText()).includes('Tarea e2e 01'));
    // Enlace del título y badge Hito.
    const link = rows.first().getByRole('link', { name: 'Tarea e2e 01' });
    record('El título abre la tarea: /seguimiento/tareas?taskId=…', (await link.getAttribute('href')) === `/seguimiento/tareas?taskId=${FIXTURE[0].taskId}`, await link.getAttribute('href'));
    const hito = rows.filter({ hasText: 'Tarea e2e 07' });
    record('Badge «Hito» en las tareas hito', (await hito.getByText('Hito', { exact: true }).count()) === 1);
    // Sin normalizar espacios: \s también casaría con el espacio duro de «70 %».
    const estado07 = await hito.locator('td').nth(4).textContent();
    record('Estado con StatusBadge «Bloqueada» y progreso «70 %» (espacio duro) con etiqueta sr-only «avance»',
      estado07.includes('Bloqueada') && estado07.includes('avance') && estado07.includes('70\u00a0%'), estado07);
    // Búsqueda y filtro.
    await page.locator('#mt-buscar').fill('e2e 1');
    await wait(200);
    record('Búsqueda: «10 de 30 tareas»', (await count.innerText()) === '10 de 30 tareas', await count.innerText());
    const clear = page.getByRole('button', { name: 'Limpiar filtros' });
    record('«Limpiar filtros» aparece con un filtro activo', (await clear.count()) === 1);
    await page.locator('#mt-filtro-estado').click();
    await page.getByRole('option', { name: 'Terminada' }).click();
    await wait(300);
    record('Estado «Terminada» + búsqueda: «2 de 30 tareas»', (await count.innerText()) === '2 de 30 tareas', await count.innerText());
    await page.locator('#mt-buscar').fill('zzz');
    await wait(200);
    record('Sin resultados: mensaje y «0 de 30 tareas»',
      (await page.getByText('Ningún resultado coincide con los filtros.').count()) === 1 && (await count.innerText()) === '0 de 30 tareas');
    record('Sin resultados: un solo «Limpiar filtros»', (await page.getByRole('button', { name: 'Limpiar filtros' }).count()) === 1);
    await clear.focus();
    await page.keyboard.press('Enter');
    await wait(300);
    const active = await page.evaluate(() => document.activeElement && document.activeElement.id);
    record('«Limpiar filtros» restablece todo y lleva el foco a #mt-buscar (NIT 4)',
      active === 'mt-buscar' && (await count.innerText()) === '30 tareas' && (await page.locator('#mt-buscar').inputValue()) === '' && (await page.locator('#mt-filtro-estado').innerText()).includes('Todos'),
      { active, count: await count.innerText() });
    record('Sin filtros no hay «Limpiar filtros»', (await page.getByRole('button', { name: 'Limpiar filtros' }).count()) === 0);
    // Filas por página.
    await page.locator('#mt-paginacion-filas').click();
    await page.getByRole('option', { name: '50' }).click();
    await wait(300);
    record('50 por página: «1–30 de 30 tareas», «Página 1 de 1»', (await nav.innerText()).includes('1–30 de 30 tareas') && (await nav.innerText()).includes('Página 1 de 1'));
    // Actualizar vuelve a pedir la lista.
    const before = requests.length;
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await count.filter({ hasText: '30 tareas' }).waitFor({ timeout: 10000 });
    record('«Actualizar» vuelve a pedir GET /my-work', requests.length === before + 1, { before, after: requests.length });
    // Cambio de actor: recarga con la nueva identidad.
    const beforeActor = requests.length;
    await page.locator('#actor-select').click();
    await page.getByRole('option', { name: 'Carla Integrante BI' }).click();
    await wait(1500);
    record('Al cambiar de actor recarga GET /my-work con el nuevo X-Actor-Id', requests.length > beforeActor && requests[requests.length - 1] === 'integrante.bi@demo.local', requests.slice(beforeActor));
    // Carga lenta.
    mode = 'slow';
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await wait(400);
    record('Cargando: «Cargando tareas…» y esqueleto con aria-busy',
      (await count.innerText()) === 'Cargando tareas…' && (await page.locator('[aria-busy="true"] [aria-hidden="true"]').count()) >= 1, await count.innerText());
    await page.screenshot({ path: path.join(OUT, 'mi-trabajo-cargando--1440x900.png') });
    await count.filter({ hasText: '30 tareas' }).waitFor({ timeout: 10000 });
    // Error.
    mode = 'error';
    await page.getByRole('button', { name: 'Actualizar' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'No fue posible cargar tu trabajo.' });
    await alert.waitFor({ timeout: 10000 });
    record('Error: «No fue posible cargar tu trabajo.» con el mensaje del wrapper', (await alert.innerText()).includes('Ocurrió un error al cargar tu trabajo.'), (await alert.innerText()).replace(/\s+/g, ' '));
    record('Error: sin conteo ni tabla', (await count.count()) === 0 && (await region.count()) === 0);
    await page.screenshot({ path: path.join(OUT, 'mi-trabajo-error--1440x900.png') });
    mode = 'list';
    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await count.filter({ hasText: '30 tareas' }).waitFor({ timeout: 10000 });
    record('Reintentar recupera la lista', (await rows.count()) > 0);
    // Vacío.
    mode = 'empty';
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await page.getByText('No tienes tareas asignadas.').waitFor({ timeout: 10000 });
    record('Vacío: «No tienes tareas asignadas.» + guía, sin paginación',
      (await page.getByText('Las tareas de las que seas responsable aparecerán aquí.').count()) === 1 && (await nav.count()) === 0 && (await count.innerText()) === '0 tareas');
    await page.screenshot({ path: path.join(OUT, 'mi-trabajo-vacio--1440x900.png') });
    mode = 'list';
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await count.filter({ hasText: '30 tareas' }).waitFor({ timeout: 10000 });
    // Foco visible al tabular por la vista.
    await page.locator('#mt-buscar').focus();
    const focusStyles = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      focusStyles.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          const cs = getComputedStyle(el);
          return {
            el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}`,
            visible: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none',
          };
        }),
      );
    }
    record('Foco visible en los controles tras la búsqueda (select, región, encabezados, enlaces)', focusStyles.every((f) => f.visible), focusStyles);
    // El 500 del fixture de error lo registra el propio navegador («Failed to load resource»).
    const unexpected = consoleErrors.filter((e) => !e.includes('status of 500'));
    record('Sin errores de consola en /mi-trabajo (salvo el 500 provocado por el fixture)', unexpected.length === 0, consoleErrors.slice(0, 3));
    await context.close();
  } catch (err) {
    record('excepción', false, String(err && err.stack ? err.stack : err).slice(0, 800));
  } finally {
    await browser.close();
  }
  const failed = checks.filter((c) => !c.ok);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total: checks.length, failed: failed.length, checks }, null, 2), 'utf8');
  console.log(`total=${checks.length} failed=${failed.length}`);
  process.exit(failed.length > 0 ? 1 : 0);
})();
