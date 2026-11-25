import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { CoordinationPersonDto } from './dto/coordination-person.dto';

/** Texto único (la web lo reconoce para marcar el selector de persona). */
export const PERSON_NOT_IN_PROCESS_MESSAGE =
  'La persona indicada no existe o no pertenece al proceso.';

/** Texto del 400 cuando un participante no es del proceso de la reunión. */
export const PARTICIPANT_NOT_IN_PROCESS_MESSAGE =
  'Un participante no existe o no pertenece al proceso de la reunión.';
/**
 * Fuente unica de verdad del alcance por rol de Fase 5 (design §2.2, leccion 1).
 * NO reutiliza el `scopeWhere` privado de `request.service.ts` (que filtra por
 * `scopedProcessIds`, TODOS los grants); replica el patron de
 * `capacity-scope.service.ts`: el LIDER se detecta por
 * `grant.roleCode === LIDER_PROCESO`, NO por tener procesos.
 *
 * Dos planos (design §2.2):
 * - Plano por proceso (LECTURA de las entidades propias para lider/jefe):
 *   jefe `{}`; lider `processId ∈ leaderProcessIds`; integrante NO se expande.
 * - Plano por persona ("lo suyo" del integrante y ESCRITURA): DailyLog/
 *   WeeklyReport por `authorUserId`; Commitment por asignado/responsable;
 *   Meeting por participante o responsable.
 *
 * EXCEPCION (HIGH-2): la visibilidad de Request/Task para validar FK usa
 * `requestVisibilityWhere` = `scopedProcessIds` (visibilidad real de Request de
 * Fase 2), NO el plano lider-only.
 */
@Injectable()
export class CoordinationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Procesos donde el actor es LIDER_PROCESO (design §2.2). NO usa
   * `scopedProcessIds`: un integrante con grant en un proceso NO se expande al
   * proceso.
   */
  private leaderProcessIds(actor: CurrentActor): string[] {
    return actor.grants
      .filter((grant) => grant.roleCode === RoleCode.LIDER_PROCESO)
      .map((grant) => grant.processId);
  }

  /** `true` si el actor tiene frontera por proceso (jefe ve todo, no la tiene). */
  private isLeader(actor: CurrentActor): boolean {
    return actor.roleCodes.has(RoleCode.LIDER_PROCESO);
  }

  // --- DailyLog -----------------------------------------------------------

  /**
   * Alcance de LECTURA de diarios (design §2.2): jefe `{}`; lider por proceso;
   * integrante (o lider sin procesos lider) por `authorUserId` propio.
   */
  dailyLogReadWhere(actor: CurrentActor): Prisma.DailyLogWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    if (leaderIds.length > 0) {
      return { processId: { in: leaderIds } };
    }
    return { authorUserId: actor.userId };
  }

  /**
   * Alcance de ESCRITURA de diarios (design §2.2/§11 D13): el jefe en su area
   * `{}`; cualquier otro rol solo el PROPIO (`authorUserId`). El lider NO edita
   * el diario de un integrante por defecto (reversible).
   */
  dailyLogWriteWhere(actor: CurrentActor): Prisma.DailyLogWhereInput {
    return { authorUserId: actor.userId };
  }

  // --- WeeklyReport -------------------------------------------------------

  weeklyReportReadWhere(actor: CurrentActor): Prisma.WeeklyReportWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    if (leaderIds.length > 0) {
      return { processId: { in: leaderIds } };
    }
    return { authorUserId: actor.userId };
  }

  weeklyReportWriteWhere(actor: CurrentActor): Prisma.WeeklyReportWhereInput {
    return { authorUserId: actor.userId };
  }

  // --- Meeting ------------------------------------------------------------

  /**
   * Alcance de Meeting (design §2.2): jefe `{}`; lider por proceso MAS la regla
   * personal; integrante por participacion O responsable (specs/10 "Reuniones:
   * Participar"). Es el unico where de alcance de reuniones.
   */
  meetingWhere(actor: CurrentActor): Prisma.MeetingWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    // El líder suma su plano por proceso a la regla personal: una reunión de
    // otro proceso donde es responsable o participante también la ve.
    return {
      OR: [
        ...(leaderIds.length > 0 ? [{ processId: { in: leaderIds } }] : []),
        { responsibleUserId: actor.userId },
        { participants: { some: { userId: actor.userId } } },
      ],
    };
  }

  // --- Commitment ---------------------------------------------------------

  /**
   * Alcance de Commitment (design §2.2): jefe `{}`; lider por proceso MAS la
   * regla personal; integrante por `assignedUserId` O `responsibleUserId`
   * propios. Es el unico where de alcance de compromisos.
   */
  commitmentWhere(actor: CurrentActor): Prisma.CommitmentWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    // El líder suma su plano por proceso a la regla personal: un compromiso
    // asignado a él en un proceso que no lidera también lo ve.
    return {
      OR: [
        ...(leaderIds.length > 0 ? [{ processId: { in: leaderIds } }] : []),
        { assignedUserId: actor.userId },
        { responsibleUserId: actor.userId },
      ],
    };
  }

  // --- Visibilidad de Request para validar FK (HIGH-1/HIGH-2) --------------

  /**
   * Visibilidad REAL de Request de Fase 2 para validar FK a Request/Task
   * (design §1.2/§2.3, findings HIGH-1/HIGH-2). Usa `scopedProcessIds` (TODOS
   * los grants activos), NO el plano lider-only de §2.2: un integrante que en
   * Fase 2 SI ve una Request de su proceso debe poder referenciarla desde una
   * actividad planificada (si no, se rompe AC-014).
   */
  requestVisibilityWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return { deletedAt: null };
    }
    return { deletedAt: null, mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /**
   * Solicitudes que el actor puede relacionar con un acta o un compromiso (las
   * mismas que acepta `assertRequestVisible`), con búsqueda por código o título.
   * Devuelve hasta `limit` y avisa si hubo más.
   */
  async listLinkableRequests(
    actor: CurrentActor,
    q: string | undefined,
    limit: number,
  ): Promise<{ rows: Array<{ id: string; code: string; title: string; closed: boolean }>; truncated: boolean }> {
    const text = q?.trim();
    const rows = await this.prisma.request.findMany({
      where: {
        AND: [
          this.requestVisibilityWhere(actor),
          ...(text
            ? [
                {
                  OR: [
                    { code: { contains: text, mode: 'insensitive' as const } },
                    { title: { contains: text, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
        ],
      },
      select: { id: true, code: true, title: true, closedAt: true },
      orderBy: [{ number: 'desc' }],
      take: limit + 1,
    });
    return {
      rows: rows
        .slice(0, limit)
        .map((r) => ({ id: r.id, code: r.code, title: r.title, closed: r.closedAt !== null })),
      truncated: rows.length > limit,
    };
  }

  /**
   * Exige que la solicitud relacionada de un acta o un compromiso sea visible
   * para el actor con la misma regla que lista el selector de la web
   * (`requestVisibilityWhere`). Fuera -> 404.
   */
  async assertRequestVisible(actor: CurrentActor, requestId: string): Promise<void> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id: requestId }, this.requestVisibilityWhere(actor)] },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException('No se encontró la solicitud.');
    }
  }

  // --- Proceso del actor en las altas (BL-068) -----------------------------

  /**
   * Exige que el proceso de un alta de Seguimiento (diario, reporte semanal,
   * reunión, compromiso) sea uno en el que el actor participa. El jefe de área
   * actúa sobre todos los procesos, pero el proceso debe existir. Quien no
   * pertenece recibe 403 sin confirmar si el proceso existe; un id inexistente
   * del jefe da 400 (antes caía en un 500 por la llave foránea).
   */
  async assertActorInProcess(
    actor: CurrentActor,
    processId: string,
  ): Promise<void> {
    if (actor.isJefeArea) {
      const process = await this.prisma.process.findFirst({
        where: { id: processId },
        select: { id: true },
      });
      if (!process) {
        throw new BadRequestException('El proceso indicado no existe.');
      }
      return;
    }
    if (!actor.scopedProcessIds.has(processId)) {
      throw new ForbiddenException(
        'No perteneces al proceso indicado; elige uno de tus procesos.',
      );
    }
  }

  /**
   * Exige que las personas indicadas (asignado, responsable) existan, estén
   * activas y pertenezcan al proceso: grant activo en él o grant activo de jefe
   * de área (el jefe actúa sobre todo el área). Un id inexistente o ajeno al
   * proceso da 400 (antes caía en un 500 por la llave foránea) sin distinguir
   * los dos casos. Los ids `null`/`undefined` se ignoran.
   */
  async assertPeopleInProcess(
    processId: string,
    userIds: ReadonlyArray<string | null | undefined>,
    message: string = PERSON_NOT_IN_PROCESS_MESSAGE,
  ): Promise<void> {
    const ids = Array.from(
      new Set(userIds.filter((id): id is string => typeof id === 'string')),
    );
    if (ids.length === 0) {
      return;
    }
    const found = await this.prisma.user.count({
      where: { id: { in: ids }, ...this.processPeopleWhere(processId) },
    });
    if (found !== ids.length) {
      throw new BadRequestException(message);
    }
  }
  /**
   * Indica (sin lanzar) si la persona pertenece al proceso con la misma regla de
   * assertPeopleInProcess. Sirve para aplicar valores por defecto que no deben
   * hacer fallar la operación.
   */
  async isPersonInProcess(processId: string, userId: string): Promise<boolean> {
    const found = await this.prisma.user.count({
      where: { id: userId, ...this.processPeopleWhere(processId) },
    });
    return found > 0;
  }

  /**
   * Personas del proceso: activas, con grant activo en él o grant activo de jefe
   * de área. Misma regla para validar y para ofrecer candidatos.
   */
  private processPeopleWhere(processId: string): Prisma.UserWhereInput {
    return {
      active: true,
      grants: {
        some: {
          active: true,
          OR: [{ processId }, { role: { code: RoleCode.JEFE_AREA } }],
        },
      },
    };
  }
  /**
   * Candidatos de un proceso para responsable y participantes: exactamente las
   * personas que acepta `assertPeopleInProcess`. El actor debe pertenecer al
   * proceso (el jefe actúa sobre todos); si no, 403.
   */
  async listProcessPeople(
    actor: CurrentActor,
    processId: string,
  ): Promise<CoordinationPersonDto[]> {
    await this.assertActorInProcess(actor, processId);
    const users = await this.prisma.user.findMany({
      where: this.processPeopleWhere(processId),
      select: { id: true, name: true, identifier: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      identifier: user.identifier,
    }));
  }

  // --- Personas en alcance (selectores) -----------------------------------

  /**
   * Personas que el actor puede referenciar como participante/responsable/
   * asignado (design §2.6, endpoint `/coordination/people`): jefe -> area
   * (`User.active`); lider -> el + personas con grant activo en sus procesos
   * LIDER; integrante -> solo el mismo. Devuelve `{ id, name, identifier }`
   * ordenado por nombre.
   */
  async listPeople(actor: CurrentActor): Promise<CoordinationPersonDto[]> {
    const where = await this.peopleWhere(actor);
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, name: true, identifier: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      identifier: user.identifier,
    }));
  }

  private async peopleWhere(
    actor: CurrentActor,
  ): Promise<Prisma.UserWhereInput> {
    if (actor.isJefeArea) {
      return { active: true };
    }
    const ids = new Set<string>();
    ids.add(actor.userId);

    const leaderIds = this.leaderProcessIds(actor);
    if (leaderIds.length > 0) {
      const grants = await this.prisma.grant.findMany({
        where: { active: true, processId: { in: leaderIds } },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const grant of grants) {
        ids.add(grant.userId);
      }
    }
    return { id: { in: Array.from(ids) } };
  }

  /** Expuesto para pruebas y para quienes necesiten el flag de rol lider. */
  actorIsLeader(actor: CurrentActor): boolean {
    return this.isLeader(actor);
  }
}
