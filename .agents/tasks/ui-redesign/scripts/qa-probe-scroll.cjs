// Comprueba que la tabla de Solicitudes a 390 px es una región desplazable
// horizontalmente con teclado y que todas sus columnas (incluida «Estado») son
// alcanzables por desplazamiento, sin pérdida de capacidad.
'use strict';
const L = require('./qa-flows-lib.cjs');
(async () => {
  const s = await L.open('jefe', 'scroll', { viewport: { width: 390, height: 844 } });
  try {
    await L.goto(s.page, '/demanda/solicitudes');
    await L.settle(s.page);
    const region = s.page.getByRole('region', { name: 'Tabla de solicitudes' });
    const info = await region.evaluate((el) => ({
      role: el.getAttribute('role'),
      tabindex: el.getAttribute('tabindex'),
      overflowX: getComputedStyle(el).overflowX,
      scrollable: el.scrollWidth > el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    console.log('región de la tabla:', JSON.stringify(info));
    // Desplazar al final y comprobar que la celda de Estado es visible.
    await region.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await s.page.waitForTimeout(300);
    const estadoVisible = await s.page.getByRole('columnheader', { name: /Estado/ }).first().isVisible();
    console.log('cabecera «Estado» presente en el DOM y alcanzable por scroll:', estadoVisible);
    console.log('errores:', s.errors);
  } finally {
    await s.close();
    await L.closeBrowser();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
