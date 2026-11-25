/**
 * Solicitud o proyecto relacionado de un acta o un compromiso. La interfaz
 * edita un único campo: el «proyecto relacionado» y, si no hay, la solicitud
 * relacionada (las dos columnas existen por el MCP y los datos anteriores).
 */
export interface RelatedRequestValue {
  id: string;
  /** Código visible; nulo si la persona no puede leer la solicitud. */
  code: string | null;
  title: string | null;
}

interface RelatedRow {
  relatedProjectRequestId: string | null;
  relatedRequestId: string | null;
  relatedRequestCode: string | null;
  relatedRequestTitle: string | null;
}

/** Valor del campo a partir de lo guardado. */
export function relatedValueOf(row: RelatedRow): RelatedRequestValue | null {
  const id = row.relatedProjectRequestId ?? row.relatedRequestId;
  return id ? { id, code: row.relatedRequestCode, title: row.relatedRequestTitle } : null;
}

/** Campos del alta: solo se envía si hay solicitud. */
export function relatedCreateFields(
  next: RelatedRequestValue | null,
): { relatedProjectRequestId?: string } {
  return next ? { relatedProjectRequestId: next.id } : {};
}

/**
 * Campos de la edición: nada si no cambió (así una solicitud que la persona ya
 * no puede ver no bloquea el guardado); si cambió o se quitó, la nueva en el
 * proyecto relacionado y la otra columna en null (un solo vínculo).
 */
export function relatedUpdateFields(
  initial: RelatedRequestValue | null,
  next: RelatedRequestValue | null,
): { relatedProjectRequestId?: string | null; relatedRequestId?: string | null } {
  if ((initial?.id ?? null) === (next?.id ?? null)) return {};
  return { relatedProjectRequestId: next?.id ?? null, relatedRequestId: null };
}
