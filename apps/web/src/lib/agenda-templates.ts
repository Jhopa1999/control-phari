import { listCatalogItems } from './catalog';

/** Maestra con las plantillas de agenda del acta (el texto va en la descripción). */
export const AGENDA_TEMPLATE_CATALOG = 'MEETING_AGENDA_TEMPLATE';

export interface AgendaTemplate {
  code: string;
  name: string;
  text: string;
}

/**
 * Plantillas activas de agenda, por orden. Ayuda opcional: ante cualquier fallo
 * o sin plantillas devuelve una lista vacía y el formulario no pinta el selector.
 */
export async function listAgendaTemplates(): Promise<AgendaTemplate[]> {
  try {
    const items = await listCatalogItems({ catalog: AGENDA_TEMPLATE_CATALOG, active: true });
    return items
      .filter((item) => (item.description ?? '').trim() !== '')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'))
      .map((item) => ({ code: item.code, name: item.label, text: (item.description ?? '').trim() }));
  } catch {
    return [];
  }
}

/** Máximo de caracteres de la agenda (el mismo de la API). */
export const AGENDA_MAX = 5000;

/**
 * Agenda resultante de insertar una plantilla: si ya hay texto, la plantilla
 * va al final tras una línea en blanco; nunca reemplaza lo escrito. `null` si
 * el resultado no cabe.
 */
export function appendAgendaTemplate(current: string, template: string): string | null {
  const base = current.trimEnd();
  const next = base === '' ? template : `${base}\n\n${template}`;
  return next.length > AGENDA_MAX ? null : next;
}
