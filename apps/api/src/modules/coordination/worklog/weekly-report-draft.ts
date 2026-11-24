/**
 * Armado determinista del borrador del semanal (FEAT-004). Funciones puras: el
 * servicio consulta, estas funciones ordenan y redactan. Sin modelo de IA: la
 * misma entrada produce siempre el mismo texto.
 */

/** Tope de cada sección del semanal (igual que `CreateWeeklyReportDto`). */
export const WEEKLY_SECTION_MAX_LENGTH = 5000;

export interface DraftActivity {
  id: string;
  hours: number;
  description: string | null;
  result: string | null;
  activityStatus: string | null;
  createdAt: Date;
  request: { code: string; title: string } | null;
  /** Fecha `YYYY-MM-DD` del diario al que pertenece. */
  logDate: string;
}

export interface DraftIssue {
  id: string;
  title: string;
  date: string;
  state: string;
  requestCode: string | null;
}

export interface DraftCommitment {
  id: string;
  title: string;
  dueDate: string;
  state: string;
}

/** Horas con coma decimal y sin ceros sobrantes: `6,5`, `2`. */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100).replace('.', ',');
}

/** Recorta al tope de la sección dejando «…» si hubo que cortar. */
export function clampSection(text: string): string {
  if (text.length <= WEEKLY_SECTION_MAX_LENGTH) return text;
  return `${text.slice(0, WEEKLY_SECTION_MAX_LENGTH - 1)}…`;
}

function activityText(activity: DraftActivity): string {
  const text = (activity.description ?? '').trim() || (activity.result ?? '').trim();
  return text === '' ? 'Actividad sin descripción' : text.replace(/\s*\r?\n\s*/g, ' ');
}

function compareActivities(a: DraftActivity, b: DraftActivity): number {
  return (
    a.logDate.localeCompare(b.logDate) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** Resultados: actividades agrupadas por solicitud (por código), con horas. */
export function buildResults(activities: DraftActivity[]): string {
  if (activities.length === 0) return '';
  const groups = new Map<string, { title: string; items: DraftActivity[] }>();
  const others: DraftActivity[] = [];
  for (const activity of [...activities].sort(compareActivities)) {
    if (!activity.request) {
      others.push(activity);
      continue;
    }
    const group = groups.get(activity.request.code) ?? {
      title: activity.request.title,
      items: [],
    };
    group.items.push(activity);
    groups.set(activity.request.code, group);
  }
  const blocks: string[] = [];
  const total = (items: DraftActivity[]) =>
    items.reduce((sum, item) => sum + item.hours, 0);
  const lines = (items: DraftActivity[]) =>
    items.map((item) => `- ${activityText(item)} (${formatHours(item.hours)} h)`);
  for (const code of [...groups.keys()].sort()) {
    const group = groups.get(code)!;
    blocks.push(
      [`${code} · ${group.title} (${formatHours(total(group.items))} h)`, ...lines(group.items)].join('\n'),
    );
  }
  if (others.length > 0) {
    blocks.push(
      [`Otras actividades (${formatHours(total(others))} h)`, ...lines(others)].join('\n'),
    );
  }
  return clampSection(blocks.join('\n\n'));
}

/** Bloqueos: actividades bloqueadas de la semana y novedades abiertas del proceso. */
export function buildBlockers(
  activities: DraftActivity[],
  issues: DraftIssue[],
): string {
  const lines: string[] = [];
  for (const activity of [...activities].sort(compareActivities)) {
    if (activity.activityStatus !== 'BLOQUEADO') continue;
    const prefix = activity.request ? `${activity.request.code}: ` : '';
    lines.push(`- Actividad bloqueada (${activity.logDate}): ${prefix}${activityText(activity)}`);
  }
  const sorted = [...issues].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (const issue of sorted) {
    const prefix = issue.requestCode ? `${issue.requestCode}: ` : '';
    lines.push(`- Novedad abierta (${issue.date}): ${prefix}${issue.title}`);
  }
  return clampSection(lines.join('\n'));
}

/** Compromisos del actor que vencen la semana siguiente. */
export function buildCommitmentsText(commitments: DraftCommitment[]): string {
  const sorted = [...commitments].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
  );
  return clampSection(
    sorted.map((c) => `- ${c.title} (vence ${c.dueDate})`).join('\n'),
  );
}
