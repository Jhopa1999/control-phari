// Sonda de solo lectura: solicitudes, estado de su plan, fases y tareas por fase.
'use strict';
const API = process.env.API_URL || 'http://localhost:3301';
const ACTOR = process.env.ACTOR || 'jefe@demo.local';
async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { 'X-Actor-Id': ACTOR } });
  if (!res.ok) return { error: res.status };
  return res.json();
}
(async () => {
  const requests = await get('/requests');
  for (const r of requests) {
    const plan = await get(`/requests/${r.id}/plan`);
    let info = `plan=${plan && plan.error}`;
    let phases = '';
    if (plan && !plan.error) {
      info = `plan=${plan.status} ${plan.id}`;
      const ph = await get(`/plans/${plan.id}/phases`);
      const tasks = await get(`/plans/${plan.id}/tasks`);
      if (Array.isArray(ph) && Array.isArray(tasks)) {
        phases = ph
          .map((p) => `${p.name}[${tasks.filter((t) => t.phaseId === p.id).length}] ${p.startDate || '-'}..${p.endDate || '-'}`)
          .join('; ');
      }
    }
    console.log(`${String(r.operationalState).padEnd(14)} ${r.id} ${r.title.slice(0, 45)} | ${info} | ${phases}`);
  }
})();
