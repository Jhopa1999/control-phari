import type { Prisma } from '../../generated/prisma/client';

/**
 * IDs visibles y automáticos (solicitud, fase y tarea). Única fuente del
 * prefijo y del formato; la migración 20261113120000_visible_ids usa el mismo
 * formato para las filas existentes.
 *
 *   Solicitud: PRY-0012      (4 dígitos mínimo; crece a 5+ sin truncar)
 *   Fase:      PRY-0012-F2   (contador por plan)
 *   Tarea:     PRY-0012-T07  (2 dígitos mínimo; crece a 3+ sin truncar)
 *
 * Son inmutables, de solo lectura y nunca se reutilizan: los contadores solo
 * crecen. Ningún DTO de entrada los acepta.
 */
export const VISIBLE_CODE_PREFIX = 'PRY';

const REQUEST_NUMBER_DIGITS = 4;
const TASK_NUMBER_DIGITS = 2;

/** Cliente transaccional o PrismaClient (solo se usan estos delegados). */
type CodeClient = Pick<Prisma.TransactionClient, 'plan' | '$queryRaw'>;

export function formatRequestCode(number: number): string {
  return `${VISIBLE_CODE_PREFIX}-${String(number).padStart(REQUEST_NUMBER_DIGITS, '0')}`;
}

export function formatPhaseCode(requestCode: string, seq: number): string {
  return `${requestCode}-F${seq}`;
}

export function formatTaskCode(requestCode: string, seq: number): string {
  return `${requestCode}-T${String(seq).padStart(TASK_NUMBER_DIGITS, '0')}`;
}

/** Forma corta para mostrar dentro de un plan: «PRY-0012-T07» -> «T07». */
export function shortCode(code: string): string {
  const match = /-([FT]\d+)$/.exec(code);
  return match ? match[1] : code;
}

/** Longitud máxima de un código escrito por el usuario (se valida antes de la expresión). */
export const VISIBLE_CODE_MAX_LENGTH = 32;

/** Forma completa de un código visible: solicitud, fase o tarea (ya normalizado). */
export const VISIBLE_CODE_PATTERN = /^PRY-\d{4,}(-(F\d+|T\d+))?$/;

export type VisibleCodeKind = 'REQUEST' | 'PHASE' | 'TASK';

export interface ParsedVisibleCode {
  kind: VisibleCodeKind;
  /** Código canónico en mayúsculas. */
  code: string;
  /** Código de la solicitud a la que pertenece. */
  requestCode: string;
}

/**
 * Normaliza lo escrito por el usuario: recorta, convierte tramos de espacios,
 * guiones bajos y guiones largos en un único `-` y pasa a mayúsculas.
 */
export function normalizeVisibleCode(raw: string): string {
  return raw
    .trim()
    .replace(/[\s_\u2013\u2014-]+/g, '-')
    .toUpperCase();
}

/**
 * Analiza un código completo (`PRY-0012`, `PRY-0012-F2`, `PRY-0012-T07`) sin
 * distinguir mayúsculas. Devuelve `null` si no tiene la forma de un código
 * (la longitud máxima se comprueba primero). La forma corta no se acepta.
 */
export function parseVisibleCode(raw: string): ParsedVisibleCode | null {
  if (typeof raw !== 'string' || raw.length > VISIBLE_CODE_MAX_LENGTH * 2) return null;
  const code = normalizeVisibleCode(raw);
  if (code.length === 0 || code.length > VISIBLE_CODE_MAX_LENGTH) return null;
  if (!VISIBLE_CODE_PATTERN.test(code)) return null;
  const match = /^(PRY-\d+)(?:-([FT])\d+)?$/.exec(code);
  if (!match) return null;
  const kind: VisibleCodeKind = match[2] === 'F' ? 'PHASE' : match[2] === 'T' ? 'TASK' : 'REQUEST';
  return { kind, code, requestCode: match[1] };
}

/** Siguiente número de solicitud (secuencia de Postgres; los huecos son válidos). */
export async function nextRequestNumber(tx: CodeClient): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT nextval('requests_number_seq') AS n`;
  return Number(rows[0].n);
}

export type PlanCodeKind = 'phase' | 'task';

/**
 * Reserva `count` números consecutivos de fase o tarea del plan con UN solo
 * `UPDATE ... RETURNING` (increment atómico): dos creaciones simultáneas se
 * serializan por el bloqueo de la fila del plan y nunca reciben el mismo número.
 * Devuelve el código de la solicitud y el primer número reservado.
 */
export async function reservePlanSequence(
  tx: CodeClient,
  planId: string,
  kind: PlanCodeKind,
  count: number,
): Promise<{ requestCode: string; first: number }> {
  const field = kind === 'phase' ? 'phaseSeqNext' : 'taskSeqNext';
  const plan = await tx.plan.update({
    where: { id: planId },
    data: { [field]: { increment: count } },
    select: { phaseSeqNext: true, taskSeqNext: true, request: { select: { code: true } } },
  });
  return {
    requestCode: plan.request.code,
    first: plan[field] - count,
  };
}

/**
 * Condiciones de búsqueda por código para `?q=`: coincide con el código
 * completo o parcial (`pry-0012`, `PRY-0012-T07`) y con la forma corta
 * (`T07`, `t7`, `F2`), sin distinguir mayúsculas.
 */
export function codeSearchConditions(
  q: string,
): Array<{ code: { contains: string; mode: 'insensitive' } | { endsWith: string; mode: 'insensitive' } }> {
  const term = q.trim();
  if (term === '') return [];
  const conditions: Array<{
    code: { contains: string; mode: 'insensitive' } | { endsWith: string; mode: 'insensitive' };
  }> = [{ code: { contains: term, mode: 'insensitive' } }];
  const short = /^([ft])(\d+)$/i.exec(term);
  if (short) {
    const kind = short[1].toUpperCase();
    const seq = Number(short[2]);
    const suffix = kind === 'T' ? `-T${String(seq).padStart(TASK_NUMBER_DIGITS, '0')}` : `-F${seq}`;
    conditions.push({ code: { endsWith: suffix, mode: 'insensitive' } });
  }
  return conditions;
}
