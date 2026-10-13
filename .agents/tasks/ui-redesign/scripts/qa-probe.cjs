// Sonda de depuración de qa-flows: abre una ruta con un actor, ejecuta pasos
// opcionales (archivo .cjs que exporta async (page, L) => {}) e imprime el
// árbol de accesibilidad de un selector. No escribe (los DELETE se interceptan
// y las altas solo ocurren si los pasos las piden).
// Uso: node qa-probe.cjs <actor> <ruta> [selector] [pasos.cjs]
'use strict';
const L = require('./qa-flows-lib.cjs');
(async () => {
  const [actor, route, selector = 'main', stepsFile] = process.argv.slice(2);
  const s = await L.open(actor, 'sonda');
  try {
    await L.goto(s.page, route);
    if (stepsFile) await require(require('node:path').resolve(stepsFile))(s.page, L);
    const snap = await s.page.locator(selector).first().ariaSnapshot();
    console.log(snap.slice(0, 12000));
    console.log('errores:', s.errors, 'fallidas:', s.failed);
  } finally {
    await s.close();
    await L.closeBrowser();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
