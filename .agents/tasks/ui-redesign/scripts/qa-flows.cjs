// Recorridos con escritura desde la UI (QA final, iteración 2; hallazgo QA-1).
// Uso: node qa-flows.cjs <flujo...>   (demanda | plan | registro | coordinacion |
//                                       activos | capacidad | controles | equipo | todo)
// Requiere API 3301 y web 3300 del worktree en dev-header. Los datos creados se
// registran en demo-data/manifest.json (qa.ui.*). No borra nada (los DELETE se
// interceptan; ver qa-flows-lib.cjs).
'use strict';
const L = require('./qa-flows-lib.cjs');

// Una promesa de waitApi que queda sin await (porque un clic falló antes)
// rechazaría al terminar y tumbaría el proceso. Se registra como fallo del
// paso, no del proceso.
process.on('unhandledRejection', (err) => {
  console.log(`  (promesa sin await) ${String(err && err.message ? err.message : err).split('\n')[0].slice(0, 160)}`);
});

const FLOWS = {
  demanda: () => require('./qa-flows-demanda.cjs').run(),
  plan: () => require('./qa-flows-plan.cjs').run(),
  registro: () => require('./qa-flows-registro.cjs').run(),
  coordinacion: () => require('./qa-flows-coordinacion.cjs').run(),
  activos: () => require('./qa-flows-activos.cjs').run(),
  capacidad: () => require('./qa-flows-capacidad.cjs').run(),
  controles: () => require('./qa-flows-controles.cjs').run(),
  equipo: () => require('./qa-flows-equipo.cjs').run(),
};

(async () => {
  let names = process.argv.slice(2);
  if (names.length === 0 || names.includes('todo')) names = Object.keys(FLOWS);
  for (const name of names) {
    if (!FLOWS[name]) throw new Error(`Flujo desconocido: ${name}`);
    console.log(`\n== ${name}`);
    try {
      await FLOWS[name]();
    } catch (err) {
      L.check(`${name}: el flujo terminó sin excepción`, false, String(err && err.stack ? err.stack : err).slice(0, 600));
    }
  }
  await L.closeBrowser();
  process.exitCode = L.summary() === 0 ? 0 : 1;
})();
