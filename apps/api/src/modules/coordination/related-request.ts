import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { requestScopeWhere } from '../request/request-scope.service';

/** Código y título de la solicitud que el actor puede leer. */
export interface RelatedRequestInfo {
  code: string;
  title: string;
}

/**
 * Solicitud que muestra la interfaz para un acta o un compromiso: el
 * «proyecto» relacionado y, si no hay, la solicitud relacionada (la web edita
 * un único campo; las dos columnas se conservan por el MCP y los datos viejos).
 */
export function relatedRequestIdOf(row: {
  relatedProjectRequestId: string | null;
  relatedRequestId: string | null;
}): string | null {
  return row.relatedProjectRequestId ?? row.relatedRequestId;
}

/**
 * Cláusulas `OR` de la búsqueda `q` por código o título de la solicitud
 * relacionada. Solo cuentan las solicitudes que el actor puede leer: buscar no
 * debe revelar el título de una solicitud ajena.
 */
export function relatedRequestSearchClauses(
  actor: CurrentActor,
  q: string,
): Array<{ relatedRequest: { is: Prisma.RequestWhereInput } } | { relatedProjectRequest: { is: Prisma.RequestWhereInput } }> {
  const match: Prisma.RequestWhereInput = {
    AND: [
      requestScopeWhere(actor),
      {
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      },
    ],
  };
  return [{ relatedRequest: { is: match } }, { relatedProjectRequest: { is: match } }];
}

/**
 * Código y título de las solicitudes relacionadas de un lote de filas, en una
 * sola consulta y con el alcance único de lectura de solicitudes: una solicitud
 * que el actor no puede leer no aparece en el mapa (la web dice «No disponible»).
 */
export async function loadRelatedRequests(
  prisma: Pick<PrismaService, 'request'>,
  actor: CurrentActor,
  rows: ReadonlyArray<{
    relatedProjectRequestId: string | null;
    relatedRequestId: string | null;
  }>,
): Promise<ReadonlyMap<string, RelatedRequestInfo>> {
  const ids = Array.from(
    new Set(rows.map(relatedRequestIdOf).filter((id): id is string => id !== null)),
  );
  if (ids.length === 0) return new Map();
  const found = await prisma.request.findMany({
    where: { AND: [{ id: { in: ids } }, requestScopeWhere(actor)] },
    select: { id: true, code: true, title: true },
  });
  return new Map(found.map((r) => [r.id, { code: r.code, title: r.title }]));
}
