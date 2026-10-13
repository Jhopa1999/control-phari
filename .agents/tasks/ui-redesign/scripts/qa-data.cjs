// Datos de la QA final (rediseño de UI), creados por la API real con Node en
// UTF-8 y registrados en .agents/tasks/demo-data/manifest.json. Solo crea; no
// modifica ni borra registros existentes. Idempotente por clave ("qa.*").
//
// Uso:
//   node qa-data.cjs plan          solicitud BI aprobada con plan en borrador,
//                                  una fase con fechas y UNA tarea (para probar
//                                  «Agregar tarea» como segunda tarea desde la UI)
//   node qa-data.cjs record-ui     registra en el manifest las tareas del plan QA
//                                  creadas desde la UI (no crea nada)
//
// API en dev-header (X-Actor-Id). API_URL por defecto http://localhost:3301.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const API = (process.env.API_URL || 'http://localhost:3301').replace(/\/+$/, '');
const MANIFEST = path.resolve(__dirname, '..', '..', 'demo-data', 'manifest.json');
const MARKER = 'Dato de prueba (demo-ui)';
const mark = (text) => `${text}\n${MARKER}`;
const day = (iso) => `${iso}T00:00:00.000Z`;
const ACTORS = { jefe: 'jefe@demo.local', beto: 'lider.bi@demo.local' };
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const byKey = new Map(manifest.entities.map((e) => [e.key, e]));
function save() {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
async function api(actor, method, route, body) {
  for (let attempt = 1; ; attempt += 1) {
    const init = { method, headers: { 'X-Actor-Id': ACTORS[actor], Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json; charset=utf-8';
      init.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(`${API}${route}`, init);
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (res.status >= 500 && attempt < 3) continue;
      if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${text.slice(0, 400)}`);
      return data;
    } catch (err) {
      if (attempt < 3 && /fetch failed|ECONNRESET|ENOTFOUND/.test(String(err))) continue;
      throw err;
    }
  }
}
async function ensure(key, spec) {
  const existing = byKey.get(key);
  if (existing) return existing;
  const res = await api(spec.actor, spec.method, spec.route, spec.body);
  if (!res || !res.id) throw new Error(`${key}: respuesta sin id`);
  const entry = {
    key,
    entity: spec.entity,
    id: res.id,
    parentIds: spec.parentIds || {},
    createdVia: `${spec.method} ${spec.route}`,
    actor: ACTORS[spec.actor],
    createdAt: res.createdAt || new Date().toISOString(),
    label: spec.label,
  };
  manifest.entities.push(entry);
  byKey.set(key, entry);
  for (const extra of spec.extra ? spec.extra(res) : []) {
    if (byKey.has(extra.key)) continue;
    const e = { actor: ACTORS[spec.actor], createdAt: entry.createdAt, ...extra };
    manifest.entities.push(e);
    byKey.set(e.key, e);
  }
  save();
  console.log(`creado ${key} ${res.id}`);
  return entry;
}
async function plan() {
  const processes = await api('jefe', 'GET', '/processes');
  const fibi = processes.find((p) => p.code === 'FIBI');
  if (!fibi) throw new Error('No existe el proceso FIBI');
  const req = await ensure('qa.req.QA1', {
    entity: 'Request',
    actor: 'beto',
    method: 'POST',
    route: '/requests',
    body: {
      title: 'QA final · Tablero de cumplimiento de entregas por región',
      requesterArea: 'Operaciones',
      requesterName: 'Persona de prueba QA',
      functionalOwner: 'Coordinación de Operaciones (QA)',
      expectedResult: mark('Solicitud creada por la QA final del rediseño para probar Planificación con una fase que ya tiene tareas.'),
      targetDate: day('2026-12-18'),
      mainProcessId: fibi.id,
    },
    parentIds: { mainProcessId: fibi.id },
    label: 'QA1 · QA final · Tablero de cumplimiento de entregas por región',
    extra: (res) =>
      (res.participants || []).map((p) => ({
        key: `qa.req.QA1.participant.${p.processId}`,
        entity: 'RequestParticipant',
        id: p.id,
        parentIds: { requestId: res.id, processId: p.processId },
        createdVia: 'POST /requests (participante materializado con la solicitud)',
      })),
  });
  await ensure('qa.req.QA1.triage', {
    entity: 'Triage',
    actor: 'beto',
    method: 'POST',
    route: `/requests/${req.id}/triage`,
    body: {
      decision: 'CONTINUAR',
      routeCode: 'BI',
      demandTypeCode: 'DESARROLLO',
      criticalityCode: 'MEDIA',
      sizeCode: 'M',
      dataAvailabilityCode: 'SI',
      totalEffortHours: 80,
      mainResponsible: 'Beto Lider BI',
      notes: mark('Triage de la QA final.'),
    },
    parentIds: { requestId: req.id },
    label: 'QA1 triage CONTINUAR',
  });
  await ensure('qa.req.QA1.priority.1', {
    entity: 'PriorityEvaluation',
    actor: 'beto',
    method: 'POST',
    route: `/requests/${req.id}/priority`,
    body: {
      impact: 3, alignment: 3, riskControl: 3, urgency: 3, scope: 3, dataAvailability: 3, feasibility: 3, reuse: 3,
      justification: mark('Evaluación de la QA final.'),
    },
    parentIds: { requestId: req.id },
    label: 'QA1 evaluación 1',
  });
  await ensure('qa.req.QA1.approval', {
    entity: 'Approval',
    actor: 'jefe',
    method: 'POST',
    route: `/requests/${req.id}/approval`,
    body: { decision: 'APROBAR', reason: 'Aprobada para la QA final del rediseño.' },
    parentIds: { requestId: req.id },
    label: 'QA1 aprobación APROBAR',
  });
  const planEntry = await ensure('qa.plan.QA1', {
    entity: 'Plan',
    actor: 'beto',
    method: 'POST',
    route: `/requests/${req.id}/plan`,
    body: {
      periodStart: day('2026-11-02'),
      periodEnd: day('2026-12-18'),
      commitmentDate: day('2026-12-11'),
      risks: 'Riesgo de prueba de la QA final.',
      mitigations: mark('Mitigación de prueba de la QA final.'),
    },
    parentIds: { requestId: req.id },
    label: 'QA1 · plan de QA1',
  });
  const phase = await ensure('qa.phase.QA1.F1', {
    entity: 'PlanPhase',
    actor: 'beto',
    method: 'POST',
    route: `/plans/${planEntry.id}/phases`,
    body: { name: 'QA · Fase con tareas', startDate: day('2026-11-02'), endDate: day('2026-11-13'), deliverable: 'Entregable de prueba (QA).' },
    parentIds: { planId: planEntry.id, requestId: req.id },
    label: 'QA1 F1 · QA · Fase con tareas',
  });
  await ensure('qa.task.QA1.T1', {
    entity: 'Task',
    actor: 'beto',
    method: 'POST',
    route: `/phases/${phase.id}/tasks`,
    body: {
      title: 'QA · Primera tarea de la fase',
      isMilestone: false,
      description: mark('Primera tarea creada por la API para la QA final.'),
      startDate: day('2026-11-02'),
      endDate: day('2026-11-06'),
      estimateHours: 8,
    },
    parentIds: { phaseId: phase.id, planId: planEntry.id, requestId: req.id },
    label: 'QA1 T1 · QA · Primera tarea de la fase',
  });
  console.log(JSON.stringify({ requestId: req.id, planId: planEntry.id, phaseId: phase.id }));
}
async function recordUi() {
  const planEntry = byKey.get('qa.plan.QA1');
  const phase = byKey.get('qa.phase.QA1.F1');
  if (!planEntry || !phase) throw new Error('Primero: node qa-data.cjs plan');
  const known = new Set(manifest.entities.map((e) => e.id));
  const tasks = await api('jefe', 'GET', `/plans/${planEntry.id}/tasks`);
  let n = 0;
  for (const t of tasks) {
    if (known.has(t.id)) continue;
    n += 1;
    const entry = {
      key: `qa.task.QA1.ui.${t.id.slice(0, 8)}`,
      entity: 'Task',
      id: t.id,
      parentIds: { phaseId: t.phaseId, planId: planEntry.id, requestId: planEntry.parentIds.requestId },
      createdVia: `POST /phases/${t.phaseId}/tasks (desde la UI: Planificación «Agregar tarea», QA final)`,
      actor: ACTORS.beto,
      createdAt: t.createdAt || new Date().toISOString(),
      label: `QA1 UI · ${t.title}`,
    };
    manifest.entities.push(entry);
    console.log(`registrada ${entry.key} «${t.title}»`);
  }
  if (n > 0) save();
  console.log(`tareas del plan QA: ${tasks.length}; nuevas registradas: ${n}`);
}
const cmd = process.argv[2];
(cmd === 'plan' ? plan() : cmd === 'record-ui' ? recordUi() : Promise.reject(new Error('Uso: plan | record-ui'))).catch(
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  },
);
