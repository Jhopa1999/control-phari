import {
  PageWindow,
  normalizeSearch,
  sliceWindow,
} from '../../common/pagination/pagination';
import type { SortDirection } from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { NO_PROCESS_SENTINEL } from '../portfolio/dto/list-portfolio.dto';
import { REQUEST_STATES } from './request-state';
import type { RequestSortKey } from './request-sort';

/**
 * Consulta paginada de solicitudes compartida por Solicitudes (`GET /requests`)
 * y Portafolio (`GET /portfolio`): ambos listan la misma entidad con el mismo
 * alcance (`requestScopeWhere`), los mismos filtros y el mismo orden, y solo
 * difieren en la forma de la fila. Aquí se resuelve QUÉ ids van en la ventana;
 * cada servicio carga y mapea sus filas.
 */

/** Filtros y orden de una consulta de solicitudes. */
export interface RequestListCriteria {
  state?: string[];
  mainProcessId?: string[];
  /** P1..P4 o SIN_PRIORIZAR; se resuelve sobre la evaluación vigente. */
  band?: string[];
  q?: string;
  sort?: RequestSortKey;
  dir?: SortDirection;
}

/** Orden por defecto: registro descendente (el de siempre). */
export const DEFAULT_REQUEST_SORT: RequestSortKey = 'registeredAt';

/**
 * Construye el `where` de una consulta: el alcance recibido INTERSECTADO con los
 * filtros (nunca lo amplía). OR dentro de un filtro, AND entre filtros. El
 * centinela SIN_PROCESO se combina en OR con los UUID. `q` busca (sin
 * distinguir mayúsculas) en código y título, y en el nombre del solicitante si
 * `searchRequester` es true.
 */
export function buildRequestWhere(
  scope: Prisma.RequestWhereInput,
  criteria: Pick<RequestListCriteria, 'state' | 'mainProcessId' | 'q'>,
  options: { searchRequester: boolean },
): Prisma.RequestWhereInput {
  const and: Prisma.RequestWhereInput[] = [scope];

  const processFilter = criteria.mainProcessId;
  if (processFilter !== undefined && processFilter.length > 0) {
    const uuids = processFilter.filter((id) => id !== NO_PROCESS_SENTINEL);
    const includeNull = uuids.length !== processFilter.length;
    const branches: Prisma.RequestWhereInput[] = [];
    if (uuids.length > 0) {
      branches.push({ mainProcessId: { in: uuids } });
    }
    if (includeNull) {
      branches.push({ mainProcessId: null });
    }
    and.push(branches.length === 1 ? branches[0] : { OR: branches });
  }
  if (criteria.state !== undefined && criteria.state.length > 0) {
    and.push({ operationalState: { in: criteria.state } });
  }
  const q = normalizeSearch(criteria.q);
  if (q !== undefined) {
    const contains = { contains: q, mode: 'insensitive' as const };
    const fields: Prisma.RequestWhereInput[] = [{ code: contains }, { title: contains }];
    if (options.searchRequester) {
      fields.push({ requesterName: contains });
    }
    and.push({ OR: fields });
  }
  return { AND: and };
}

/** Evaluación vigente (la última por `evaluatedAt`) de cada solicitud, en una consulta. */
export async function latestScores(
  prisma: PrismaService,
  requestIds: string[],
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (requestIds.length === 0) {
    return scores;
  }
  const evaluations = await prisma.priorityEvaluation.findMany({
    where: { requestId: { in: requestIds } },
    orderBy: { evaluatedAt: 'desc' },
    select: { requestId: true, score: true },
  });
  // Ordenadas desc: la primera aparición por solicitud es la vigente.
  for (const evaluation of evaluations) {
    if (!scores.has(evaluation.requestId)) {
      scores.set(evaluation.requestId, evaluation.score);
    }
  }
  return scores;
}

function directionOf(sort: RequestSortKey, dir: SortDirection | undefined): SortDirection {
  return dir ?? (sort === 'registeredAt' ? 'desc' : 'asc');
}

/** Orden de base de la base de datos; `id` desempata para que la paginación sea estable. */
function dbOrderBy(
  sort: RequestSortKey,
  dir: SortDirection,
): Prisma.RequestOrderByWithRelationInput[] {
  switch (sort) {
    case 'code':
      return [{ number: dir }, { id: 'asc' }];
    case 'title':
      return [{ title: dir }, { id: 'asc' }];
    case 'registeredAt':
    default:
      return [{ registeredAt: dir }, { createdAt: dir }, { id: 'asc' }];
  }
}

const STATE_ORDER = new Map<string, number>(REQUEST_STATES.map((s, i) => [s, i]));

/**
 * Ids de la ventana pedida y total tras filtros. Orden y banda que dependen de
 * datos de otra tabla (`score`, la banda de prioridad) o de un orden de flujo
 * que no es alfabético (`state`) se resuelven en memoria sobre los ids del
 * alcance filtrado (acotado por el alcance, no por la ventana); el resto, en la
 * base de datos con `skip/take`.
 */
export async function pageRequestIds(
  prisma: PrismaService,
  where: Prisma.RequestWhereInput,
  criteria: Pick<RequestListCriteria, 'band' | 'sort' | 'dir'>,
  window: PageWindow,
  bandOf: (score: number) => string,
): Promise<{ ids: string[]; total: number }> {
  const sort = criteria.sort ?? DEFAULT_REQUEST_SORT;
  const dir = directionOf(sort, criteria.dir);
  const bands =
    criteria.band !== undefined && criteria.band.length > 0
      ? new Set<string>(criteria.band)
      : null;
  const inMemory = sort === 'score' || sort === 'state' || bands !== null;

  if (!inMemory) {
    const [rows, total] = await Promise.all([
      prisma.request.findMany({
        where,
        orderBy: dbOrderBy(sort, dir),
        skip: window.skip,
        take: window.take,
        select: { id: true },
      }),
      prisma.request.count({ where }),
    ]);
    return { ids: rows.map((row) => row.id), total };
  }

  const all = await prisma.request.findMany({
    where,
    orderBy: dbOrderBy(DEFAULT_REQUEST_SORT, 'desc'),
    select: { id: true, operationalState: true },
  });
  const needsScores = sort === 'score' || bands !== null;
  const scores = needsScores
    ? await latestScores(
        prisma,
        all.map((row) => row.id),
      )
    : new Map<string, number>();

  let rows = all;
  if (bands !== null) {
    rows = rows.filter((row) => {
      const score = scores.get(row.id);
      const band = score === undefined ? 'SIN_PRIORIZAR' : bandOf(score);
      return bands.has(band);
    });
  }
  if (sort === 'score') {
    const sign = dir === 'asc' ? 1 : -1;
    // Sin evaluación al final en las dos direcciones; sort estable respeta el
    // orden de base (registro desc, id) entre iguales.
    rows = [...rows].sort((a, b) => {
      const sa = scores.get(a.id);
      const sb = scores.get(b.id);
      if (sa === undefined && sb === undefined) return 0;
      if (sa === undefined) return 1;
      if (sb === undefined) return -1;
      return sign * (sa - sb);
    });
  } else if (sort === 'state') {
    const sign = dir === 'asc' ? 1 : -1;
    rows = [...rows].sort(
      (a, b) =>
        sign *
        ((STATE_ORDER.get(a.operationalState) ?? STATE_ORDER.size) -
          (STATE_ORDER.get(b.operationalState) ?? STATE_ORDER.size)),
    );
  }
  return {
    ids: sliceWindow(rows, window).map((row) => row.id),
    total: rows.length,
  };
}

/** Reordena filas cargadas por `id IN (...)` según el orden de la ventana. */
export function orderByIds<T extends { id: string }>(
  ids: string[],
  rows: T[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
}
