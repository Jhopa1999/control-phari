/**
 * Memoria de herramientas del asistente (BL-032). El modelo solo conserva entre
 * turnos el TEXTO de la conversación: sin esto olvida los identificadores que
 * consultó y el estado de sus propuestas, así que los inventa o repite acciones
 * ya hechas. Aquí se resume lo consultado (con sus ids), se arma el contexto de
 * los turnos anteriores y se verifica que una propuesta solo use identificadores
 * que de verdad aparecieron en la conversación. Sin red ni base de datos.
 */

/** Resumen de una consulta de un turno, tal como se guarda y se reinyecta. */
export interface ToolMemoryEntry {
  name: string;
  /** Argumentos con los que se consultó (compactos). */
  args?: string;
  /** Lo devuelto, resumido con sus identificadores. */
  digest: string;
}

/** Máximo de objetos con id que se conservan por consulta. */
const MAX_DIGEST_OBJECTS = 40;
/** Máximo de caracteres del resumen de una consulta. */
const MAX_DIGEST_CHARS = 3000;
/** Máximo de caracteres de los argumentos guardados. */
const MAX_ARGS_CHARS = 300;

export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Algo que parece un identificador (8-4-… en hexadecimal) aunque esté incompleto. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}/i;

/** Campos que, en orden, describen un registro en el resumen. */
const LABEL_FIELDS = [
  'title',
  'name',
  'displayName',
  'fullName',
  'label',
  'code',
  'identifier',
  'email',
  'operationalState',
  'status',
  'state',
] as const;

/** Todos los UUID (en minúscula) que aparecen en un texto. */
export function collectUuids(text: string): string[] {
  return (text.match(UUID_PATTERN) ?? []).map((id) => id.toLowerCase());
}

function describe(record: Record<string, unknown>): string {
  const parts: string[] = [`id=${String(record.id)}`];
  for (const field of LABEL_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') {
      parts.push(`${field}="${value.replace(/\s+/g, ' ').trim().slice(0, 80)}"`);
    }
    if (parts.length >= 5) break;
  }
  return `- ${parts.join(' · ')}`;
}

function collectRecords(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (out.length >= MAX_DIGEST_OBJECTS || depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') out.push(record);
    for (const inner of Object.values(record)) {
      if (inner && typeof inner === 'object') collectRecords(inner, out, depth + 1);
    }
  }
}

/**
 * Resume el resultado de una consulta conservando lo que importa para actuar
 * después: un renglón por registro con su id y sus campos descriptivos. Si el
 * resultado no es JSON o no trae ids, se guarda un extracto.
 */
export function digestToolResult(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return text.replace(/\s+/g, ' ').trim().slice(0, 600);
  }
  const records: Record<string, unknown>[] = [];
  collectRecords(parsed, records);
  if (records.length === 0) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 600);
  }
  const lines = records.map(describe);
  const digest = lines.join('\n');
  return digest.length > MAX_DIGEST_CHARS ? `${digest.slice(0, MAX_DIGEST_CHARS)}…` : digest;
}

/** Argumentos compactos de una consulta, para recordar qué se pidió. */
export function compactArgs(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Object.keys(input).length === 0) return undefined;
  const json = JSON.stringify(input);
  return json.length > MAX_ARGS_CHARS ? `${json.slice(0, MAX_ARGS_CHARS)}…` : json;
}

const MEMORY_HEADER =
  'Memoria interna de este turno anterior (no la repitas ni la menciones). Resultados que ya consultaste: usa estos identificadores y no inventes otros.';

/** Bloque de memoria de las consultas de un turno, o null si no hubo. */
export function toolMemoryBlock(entries: ReadonlyArray<ToolMemoryEntry>): string | null {
  const useful = entries.filter((e) => e.digest.trim() !== '');
  if (useful.length === 0) return null;
  const body = useful
    .map((e) => `${e.name}${e.args ? ` ${e.args}` : ''}:\n${e.digest}`)
    .join('\n');
  return `<memoria_herramientas>\n${MEMORY_HEADER}\n${body}\n</memoria_herramientas>`;
}

/** Lo que el contexto necesita saber de una propuesta de un turno anterior. */
export interface ProposalMemory {
  toolName: string;
  title: string;
  summary: string;
  status: string;
  resultId: string | null;
  resultTitle: string | null;
  error: string | null;
}

function proposalLine(p: ProposalMemory): string {
  const base = `- ${p.title}: ${p.summary}`;
  switch (p.status) {
    case 'CONFIRMADA': {
      const result = p.resultId
        ? ` Resultado: «${p.resultTitle ?? 'sin título'}» id=${p.resultId}.`
        : '';
      return `${base} → CONFIRMADA y ejecutada por la persona.${result} No la repitas.`;
    }
    case 'FALLIDA':
      return `${base} → FALLIDA (no se aplicó nada). Motivo: ${p.error ?? 'sin detalle'}.`;
    case 'EJECUTANDO':
      return `${base} → EJECUTÁNDOSE ahora. No la repitas.`;
    case 'DESCARTADA':
      return `${base} → DESCARTADA por la persona.`;
    case 'EXPIRADA':
      return `${base} → VENCIDA sin respuesta (no se aplicó nada).`;
    default:
      return `${base} → PENDIENTE: la persona aún no la confirma. No la repitas.`;
  }
}

/** Bloque con el estado ACTUAL de las propuestas de un turno, o null si no hubo. */
export function proposalsBlock(proposals: ReadonlyArray<ProposalMemory>): string | null {
  if (proposals.length === 0) return null;
  return `<propuestas>\nEstado actual de las acciones que propusiste en este turno anterior (no lo repitas ni lo menciones):\n${proposals
    .map(proposalLine)
    .join('\n')}\n</propuestas>`;
}

/** Contexto de memoria de un turno del asistente (consultas y propuestas). */
export function turnContext(
  tools: ReadonlyArray<ToolMemoryEntry>,
  proposals: ReadonlyArray<ProposalMemory>,
): string | undefined {
  const blocks = [toolMemoryBlock(tools), proposalsBlock(proposals)].filter(
    (b): b is string => b !== null,
  );
  return blocks.length > 0 ? blocks.join('\n') : undefined;
}

/** Valores de texto de unos argumentos, con la clave que los contiene. */
function* stringValues(
  value: unknown,
  key = '',
  depth = 0,
): Generator<{ key: string; value: string }> {
  if (depth > 8) return;
  if (typeof value === 'string') {
    yield { key, value };
  } else if (Array.isArray(value)) {
    for (const item of value) yield* stringValues(item, key, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const [innerKey, inner] of Object.entries(value)) {
      yield* stringValues(inner, innerKey, depth + 1);
    }
  }
}

export interface IdCheck {
  /** Parecen un identificador pero están mal formados o cortados. */
  malformed: string[];
  /** Son identificadores válidos que no aparecieron en la conversación. */
  unverified: string[];
}

/**
 * Revisa los argumentos de una propuesta: todo identificador debe estar completo
 * y haber aparecido en la conversación (una consulta, un mensaje o el resultado
 * de una propuesta ya ejecutada). Así un id inventado se rechaza ANTES de
 * mostrarle a la persona una tarjeta que fallaría al confirmarse.
 */
export function checkProposalIds(args: unknown, seen: ReadonlySet<string>): IdCheck {
  const malformed = new Set<string>();
  const unverified = new Set<string>();
  for (const { key, value } of stringValues(args)) {
    const text = value.trim();
    const isIdField = key === 'id' || key.endsWith('Id') || key.endsWith('Ids');
    // Un campo de identificador que parece uno pero está incompleto o cortado.
    if (isIdField && UUID_LIKE.test(text) && !FULL_UUID.test(text)) {
      malformed.add(text);
      continue;
    }
    for (const id of collectUuids(text)) {
      if (!seen.has(id)) unverified.add(id);
    }
  }
  return { malformed: [...malformed], unverified: [...unverified] };
}

/** Texto que se devuelve al modelo cuando una propuesta trae identificadores dudosos. */
export function idProblemMessage(check: IdCheck): string | null {
  if (check.malformed.length === 0 && check.unverified.length === 0) return null;
  const parts: string[] = [];
  if (check.malformed.length > 0) {
    parts.push(`identificadores incompletos o mal formados: ${check.malformed.join(', ')}`);
  }
  if (check.unverified.length > 0) {
    parts.push(
      `identificadores que no aparecieron en ninguna consulta de esta conversación: ${check.unverified.join(', ')}`,
    );
  }
  return (
    `No se registró la propuesta: ${parts.join('; ')}. ` +
    'Nunca inventes ni completes identificadores. Obtén los correctos con las herramientas de lectura ' +
    '(por ejemplo, la lista de procesos o de usuarios) o pregúntaselos a la persona, y vuelve a proponer.'
  );
}

/** Serialización estable (claves ordenadas) para comparar argumentos. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// ------------------------------------------------------- guardado y lectura

/**
 * Consulta de un turno tal como se guarda en `ai_message.tools`: lo que ve la
 * interfaz (nombre, etiqueta, estado) más la memoria interna (no se expone).
 */
export interface StoredToolCall {
  name: string;
  label: string;
  status: 'done' | 'error';
  /** Resumen de lo devuelto, con ids (solo consultas correctas). */
  memory?: string;
  /** Argumentos compactos con los que se consultó. */
  args?: string;
}

/** Lee la memoria guardada en el JSON de un mensaje (tolera datos antiguos sin ella). */
export function storedMemory(tools: unknown): ToolMemoryEntry[] {
  if (!Array.isArray(tools)) return [];
  const out: ToolMemoryEntry[] = [];
  for (const item of tools) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.memory !== 'string') continue;
    out.push({
      name: record.name,
      digest: record.memory,
      ...(typeof record.args === 'string' ? { args: record.args } : {}),
    });
  }
  return out;
}

/** Lo que muestra la interfaz de una consulta, sin la memoria interna. */
export function publicToolCalls(
  tools: unknown,
): Array<{ name: string; label: string; status: 'done' | 'error' }> {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.label !== 'string') return [];
    return [
      {
        name: record.name,
        label: record.label,
        status: record.status === 'error' ? ('error' as const) : ('done' as const),
      },
    ];
  });
}

/**
 * Identificadores que ya aparecieron en la conversación y, por tanto, se pueden
 * usar en una propuesta: la persona misma, lo que escribió o adjuntó, lo que
 * devolvieron las consultas anteriores y lo que crearon las acciones ya hechas.
 */
export function collectSeenIds(
  userId: string,
  rows: ReadonlyArray<{
    text: string;
    tools?: unknown;
    attachments?: ReadonlyArray<{ extractedText: string }>;
  }>,
  proposalsByMessage: ReadonlyMap<string, ReadonlyArray<{ resultId: string | null }>>,
): Set<string> {
  const seen = new Set<string>([userId.toLowerCase()]);
  for (const row of rows) {
    for (const id of collectUuids(row.text)) seen.add(id);
    for (const attachment of row.attachments ?? []) {
      for (const id of collectUuids(attachment.extractedText)) seen.add(id);
    }
    for (const entry of storedMemory(row.tools)) {
      for (const id of collectUuids(entry.digest)) seen.add(id);
    }
  }
  for (const list of proposalsByMessage.values()) {
    for (const proposal of list) {
      if (proposal.resultId) seen.add(proposal.resultId.toLowerCase());
    }
  }
  return seen;
}
