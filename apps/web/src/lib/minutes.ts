import type { Meeting } from './api-client';
import { formatDateOnly } from './format';
import { stateLabel } from './record-state';

/**
 * Acta de reunión para compartir: Markdown descargable y vista imprimible
 * (el navegador permite guardarla como PDF). Solo presenta datos que ya
 * devolvió el backend; no añade reglas.
 */
export interface MinutesContext {
  processName: string;
  personName: (id: string | null) => string;
}

function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+)|(-+$)/g, '') || 'acta'
  );
}

export function buildMinutesMarkdown(meeting: Meeting, ctx: MinutesContext): string {
  const lines: string[] = [];
  lines.push(`# Acta de reunión: ${meeting.title}`, '');
  lines.push(`- **Fecha:** ${formatDateOnly(meeting.meetingDate)}${meeting.meetingTime ? ` · ${meeting.meetingTime}` : ''}`);
  lines.push(`- **Proceso:** ${ctx.processName}`);
  lines.push(`- **Responsable:** ${meeting.responsibleUserId ? ctx.personName(meeting.responsibleUserId) : '—'}`);
  lines.push(`- **Estado del acta:** ${meeting.closed ? 'Cerrada' : 'Abierta'}`);
  lines.push('');
  lines.push('## Participantes', '');
  if (meeting.participantUserIds.length === 0) lines.push('Sin participantes registrados.');
  for (const id of meeting.participantUserIds) lines.push(`- ${ctx.personName(id)}`);
  lines.push('', '## Agenda', '', meeting.agenda?.trim() || 'Sin agenda registrada.');
  lines.push('', '## Decisiones', '', meeting.decisions?.trim() || 'Sin decisiones registradas.');
  if (meeting.notes?.trim()) lines.push('', '## Observaciones', '', meeting.notes.trim());
  lines.push('', '## Compromisos', '');
  if (meeting.commitments.length === 0) {
    lines.push('Sin compromisos registrados.');
  } else {
    lines.push('| # | Compromiso | Asignado | Vence | Estado |', '| --- | --- | --- | --- | --- |');
    meeting.commitments.forEach((c, i) => {
      const cell = (v: string) => v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      lines.push(
        `| ${i + 1} | ${cell(c.title)} | ${cell(c.assignedUserId ? ctx.personName(c.assignedUserId) : 'Sin asignar')} | ${formatDateOnly(c.dueDate)} | ${stateLabel(c.state)} |`,
      );
    });
  }
  lines.push('');
  return lines.join('\n');
}

export function downloadMinutes(meeting: Meeting, ctx: MinutesContext): void {
  const blob = new Blob([buildMinutesMarkdown(meeting, ctx)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acta-${meeting.meetingDate}-${slug(meeting.title)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function para(text: string | null | undefined, empty: string): string {
  const value = text?.trim();
  return value ? `<p>${esc(value).replace(/\r?\n/g, '<br>')}</p>` : `<p class="muted">${esc(empty)}</p>`;
}

/** Abre el acta en una ventana imprimible (Imprimir / Guardar como PDF). */
export function printMinutes(meeting: Meeting, ctx: MinutesContext): boolean {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  const participants =
    meeting.participantUserIds.length === 0
      ? '<p class="muted">Sin participantes registrados.</p>'
      : `<ul>${meeting.participantUserIds.map((id) => `<li>${esc(ctx.personName(id))}</li>`).join('')}</ul>`;
  const rows = meeting.commitments
    .map(
      (c, i) =>
        `<tr><td>${i + 1}</td><td>${esc(c.title)}</td><td>${esc(c.assignedUserId ? ctx.personName(c.assignedUserId) : 'Sin asignar')}</td><td>${esc(formatDateOnly(c.dueDate))}</td><td>${esc(stateLabel(c.state))}</td></tr>`,
    )
    .join('');
  const commitments =
    meeting.commitments.length === 0
      ? '<p class="muted">Sin compromisos registrados.</p>'
      : `<table><thead><tr><th>#</th><th>Compromiso</th><th>Asignado</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`;
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta · ${esc(meeting.title)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;line-height:1.45}
h1{font-size:22px;margin:0 0 8px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
.meta{color:#444;font-size:13px}.muted{color:#777}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f3f3}
@media print{body{margin:16mm}}
</style></head><body>
<h1>Acta de reunión: ${esc(meeting.title)}</h1>
<p class="meta">${esc(formatDateOnly(meeting.meetingDate))}${meeting.meetingTime ? ` · ${esc(meeting.meetingTime)}` : ''} · ${esc(ctx.processName)} · Responsable: ${esc(meeting.responsibleUserId ? ctx.personName(meeting.responsibleUserId) : '—')} · Acta ${meeting.closed ? 'cerrada' : 'abierta'}</p>
<h2>Participantes</h2>${participants}
<h2>Agenda</h2>${para(meeting.agenda, 'Sin agenda registrada.')}
<h2>Decisiones</h2>${para(meeting.decisions, 'Sin decisiones registradas.')}
${meeting.notes?.trim() ? `<h2>Observaciones</h2>${para(meeting.notes, '')}` : ''}
<h2>Compromisos</h2>${commitments}
<script>window.onload=function(){window.print();}</script>
</body></html>`);
  win.document.close();
  return true;
}
