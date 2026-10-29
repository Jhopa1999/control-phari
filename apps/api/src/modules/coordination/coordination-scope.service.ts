import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { CoordinationPersonDto } from './dto/coordination-person.dto';

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
 *   Issue por reporta/resuelve; Meeting por participante o responsable.
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
    if (actor.isJefeArea) {
      return {};
    }
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
    if (actor.isJefeArea) {
      return {};
    }
    return { authorUserId: actor.userId };
  }

  // --- Issue --------------------------------------------------------------

  /**
   * Alcance de Issue (design §2.2): jefe `{}`; lider por proceso; integrante por
   * `reportedByUserId` O `resolverUserId` propios.
   */
  issueWhere(actor: CurrentActor): Prisma.IssueWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    if (leaderIds.length > 0) {
      return { processId: { in: leaderIds } };
    }
    return {
      OR: [
        { reportedByUserId: actor.userId },
        { resolverUserId: actor.userId },
      ],
    };
  }

  // --- Meeting ------------------------------------------------------------

  /**
   * Alcance de Meeting (design §2.2): jefe `{}`; lider por proceso; integrante
   * por participacion O responsable (specs/10 "Reuniones: Participar").
   */
  meetingWhere(actor: CurrentActor): Prisma.MeetingWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    if (leaderIds.length > 0) {
      return { processId: { in: leaderIds } };
    }
    return {
      OR: [
        { responsibleUserId: actor.userId },
        { participants: { some: { userId: actor.userId } } },
      ],
    };
  }

  // --- Commitment ---------------------------------------------------------

  /**
   * Alcance de Commitment (design §2.2): jefe `{}`; lider por proceso;
   * integrante por `assignedUserId` O `responsibleUserId` propios.
   */
  commitmentWhere(actor: CurrentActor): Prisma.CommitmentWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    const leaderIds = this.leaderProcessIds(actor);
    if (leaderIds.length > 0) {
      return { processId: { in: leaderIds } };
    }
    return {
      OR: [
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
