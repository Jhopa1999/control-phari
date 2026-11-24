import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { CodeResolutionDto } from '../plan/code-resolution/dto/code-resolution.dto';
import { normalizeVisibleCode } from '../plan/visible-code';
import { buildRequestWhere } from '../request/request-list-query';
import { requestScopeWhere } from '../request/request-scope.service';
import { SEARCH_DEFAULT_LIMIT } from './dto/search-query.dto';
import { SearchResponseDto } from './dto/search-response.dto';

const REQUEST_SELECT = {
  id: true,
  code: true,
  title: true,
  operationalState: true,
  mainProcess: { select: { name: true } },
} satisfies Prisma.RequestSelect;

const TASK_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  phase: {
    select: {
      id: true,
      name: true,
      plan: {
        select: { request: { select: { id: true, code: true, title: true, operationalState: true } } },
      },
    },
  },
} satisfies Prisma.TaskSelect;

type RequestRow = Prisma.RequestGetPayload<{ select: typeof REQUEST_SELECT }>;
type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Búsqueda por texto (D18). Mismo alcance de lectura que el resto de las
 * solicitudes (`requestScopeWhere`, única fuente): el texto solo intersecta el
 * alcance, nunca lo amplía. Sin acentos equivalentes: `contains` insensible a
 * mayúsculas, que sí distingue tildes (sin extensión `unaccent`).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** `q` ya llega recortada y con 2 a 80 caracteres (DTO). `limit` es por grupo. */
  async search(actor: CurrentActor, q: string, limit = SEARCH_DEFAULT_LIMIT): Promise<SearchResponseDto> {
    const scope = requestScopeWhere(actor);
    const exactCode = normalizeVisibleCode(q);
    const [requests, tasks] = await Promise.all([
      this.searchRequests(scope, q, exactCode, limit),
      this.searchTasks(scope, q, exactCode, limit),
    ]);
    return {
      requests: requests.rows.map(toRequestDto),
      tasks: tasks.rows.map(toTaskDto),
      truncated: requests.truncated || tasks.truncated,
    };
  }

  /** Coincidencia exacta de código primero y luego el resto; toma uno más que el tope para saber si hay más. */
  private async searchRequests(
    scope: Prisma.RequestWhereInput,
    q: string,
    exactCode: string,
    limit: number,
  ): Promise<{ rows: RequestRow[]; truncated: boolean }> {
    const where = buildRequestWhere(scope, { q }, { searchRequester: true });
    const exact = await this.prisma.request.findMany({
      where: { AND: [where, { code: exactCode }] },
      select: REQUEST_SELECT,
      take: 1,
    });
    const rest = await this.prisma.request.findMany({
      where: { AND: [where, { id: { notIn: exact.map((row) => row.id) } }] },
      orderBy: [{ registeredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: REQUEST_SELECT,
      take: limit + 1 - exact.length,
    });
    return capRows([...exact, ...rest], limit);
  }

  private async searchTasks(
    scope: Prisma.RequestWhereInput,
    q: string,
    exactCode: string,
    limit: number,
  ): Promise<{ rows: TaskRow[]; truncated: boolean }> {
    const contains = { contains: q, mode: 'insensitive' as const };
    const where: Prisma.TaskWhereInput = {
      AND: [{ phase: { plan: { request: scope } } }, { OR: [{ code: contains }, { title: contains }] }],
    };
    const exact = await this.prisma.task.findMany({
      where: { AND: [where, { code: exactCode }] },
      select: TASK_SELECT,
      take: 1,
    });
    const rest = await this.prisma.task.findMany({
      where: { AND: [where, { id: { notIn: exact.map((row) => row.id) } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: TASK_SELECT,
      take: limit + 1 - exact.length,
    });
    return capRows([...exact, ...rest], limit);
  }
}

function capRows<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

function toRequestDto(request: RequestRow): CodeResolutionDto {
  return {
    type: 'REQUEST',
    id: request.id,
    code: request.code,
    title: request.title,
    requestId: request.id,
    requestCode: request.code,
    requestTitle: request.title,
    requestStatus: request.operationalState,
    status: request.operationalState,
    processName: request.mainProcess?.name ?? null,
  };
}

function toTaskDto(task: TaskRow): CodeResolutionDto {
  const request = task.phase.plan.request;
  return {
    type: 'TASK',
    id: task.id,
    code: task.code,
    title: task.title,
    requestId: request.id,
    requestCode: request.code,
    requestTitle: request.title,
    requestStatus: request.operationalState,
    phaseId: task.phase.id,
    phaseName: task.phase.name,
    status: task.status,
  };
}
