/**
 * Utilidades puras del chat del asistente (BL-032 F2): agrupación del
 * historial por fecha, umbrales del contador, etiquetas de herramientas y
 * validación de enlaces del Markdown. Sin DOM, para probarlas en Node.
 */

/** Largo máximo de un mensaje (coincide con el backend). */
export const MAX_MESSAGE_LENGTH = 4000;
/** Desde aquí se muestra el contador. */
export const COUNTER_VISIBLE_FROM = 3500;
/** Desde aquí el contador pasa a advertencia. */
export const COUNTER_WARNING_FROM = 3900;

export type CounterState = 'hidden' | 'normal' | 'warning' | 'over';

export function counterState(length: number): CounterState {
  if (length > MAX_MESSAGE_LENGTH) return 'over';
  if (length >= COUNTER_WARNING_FROM) return 'warning';
  if (length >= COUNTER_VISIBLE_FROM) return 'normal';
  return 'hidden';
}

/** Texto del anuncio accesible al cruzar un umbral del contador (null = nada que anunciar). */
export function counterAnnouncement(previous: CounterState, current: CounterState): string | null {
  if (previous === current) return null;
  if (current === 'over') return 'Superaste el límite de 4 000 caracteres.';
  if (current === 'warning' && previous !== 'over') return 'Te quedan 100 caracteres.';
  if (current === 'normal' && previous === 'hidden') return 'Te quedan 500 caracteres.';
  return null;
}

/** Fragmento con una herramienta consultada. */
export interface ToolView {
  id?: string;
  name?: string;
  label: string;
  status: 'running' | 'done' | 'error';
}

/** «solicitudes» -> «Solicitudes». */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** «Consultó 3 fuentes» / «Consultó 2 fuentes · 1 no respondió». */
export function toolsSummary(tools: ReadonlyArray<ToolView>): string {
  const total = tools.length;
  const failed = tools.filter((t) => t.status === 'error').length;
  const base = `Consultó ${total} ${total === 1 ? 'fuente' : 'fuentes'}`;
  return failed > 0 ? `${base} · ${failed} no respondió` : base;
}

/** Texto de la herramienta en curso más reciente: «Consultando solicitudes…» (+ «(2 de 3)»). */
export function runningText(tools: ReadonlyArray<ToolView>): string {
  const running = [...tools].reverse().find((t) => t.status === 'running');
  if (!running) return '';
  const base = `Consultando ${running.label}…`;
  return tools.length > 1 ? `${base} (${tools.indexOf(running) + 1} de ${tools.length})` : base;
}

/** Agrupa por antigüedad de `updatedAt`. */
export type ConversationGroupId = 'hoy' | 'ayer' | 'semana' | 'anteriores';

export const GROUP_LABELS: Record<ConversationGroupId, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  semana: 'Últimos 7 días',
  anteriores: 'Anteriores',
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function groupOf(updatedAt: string, now: Date = new Date()): ConversationGroupId {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(updatedAt))) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days <= 7) return 'semana';
  return 'anteriores';
}

export interface ConversationGroup<T extends { updatedAt: string }> {
  id: ConversationGroupId;
  label: string;
  items: T[];
}

/** Agrupa (y ordena de más reciente a más antigua) el historial; omite grupos vacíos. */
export function groupConversations<T extends { updatedAt: string }>(
  items: ReadonlyArray<T>,
  now: Date = new Date(),
): ConversationGroup<T>[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const order: ConversationGroupId[] = ['hoy', 'ayer', 'semana', 'anteriores'];
  return order
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      items: sorted.filter((item) => groupOf(item.updatedAt, now) === id),
    }))
    .filter((group) => group.items.length > 0);
}

/** Clasificación de un enlace del Markdown de una respuesta. */
export type LinkKind = 'internal' | 'external' | 'unsafe';

/** Interno = ruta del portal; externo = http(s); cualquier otro esquema no se enlaza. */
export function classifyLink(href: string | undefined): LinkKind {
  if (!href) return 'unsafe';
  if (href.startsWith('/') && !href.startsWith('//')) return 'internal';
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? 'external' : 'unsafe';
  } catch {
    return 'unsafe';
  }
}
