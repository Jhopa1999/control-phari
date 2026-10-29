import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { RequestModel } from '../../generated/prisma/models/Request';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestResponseDto } from './dto/request-response.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import {
  RequestStateService,
  RequestWithParticipants,
} from './request-state.service';

/**
 * CRUD de Request con alcance por `mainProcessId` (design §2.5). Sigue el patron
 * de ProcessService: scope en el `where` (404 por findFirst fuera de alcance),
 * mutacion + AuditEvent en la misma $transaction. Invariantes BR-001 (el
 * proceso principal siempre participa) y BR-017 (edicion conserva fechas
 * iniciales + justificacion).
 */
@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly state: RequestStateService,
  ) {}

  /**
   * `where` de lectura por alcance (design §2.5): la Request pertenece a su
   * proceso principal. Jefe: sin filtro; no-jefe: filtra por scopedProcessIds.
   */
  private scopeWhere(actor: CurrentActor): Prisma.RequestWhereInput {
    if (actor.isJefeArea) {
      return { deletedAt: null };
    }
    return { deletedAt: null, mainProcessId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /** Snapshot JSON de una Request para auditoria (before/after). */
  private snapshot(request: RequestModel): Prisma.InputJsonValue {
    return {
      id: request.id,
      title: request.title,
      mainProcessId: request.mainProcessId,
      operationalState: request.operationalState,
      requesterArea: request.requesterArea,
      requesterName: request.requesterName,
      functionalOwner: request.functionalOwner,
      expectedResult: request.expectedResult,
      referenceUrl: request.referenceUrl,
      targetDate: request.targetDate ? request.targetDate.toISOString() : null,
      initialCommitmentDate: request.initialCommitmentDate
        ? request.initialCommitmentDate.toISOString()
        : null,
      changeJustification: request.changeJustification,
    };
  }

  /**
   * Resuelve una Request dentro del alcance del actor o lanza 404. El alcance se
   * aplica en el `where` (no confirma existencia fuera de alcance, design §2.5).
   */
  private async requireInScope(
    actor: CurrentActor,
    id: string,
  ): Promise<RequestWithParticipants> {
    const request = await this.prisma.request.findFirst({
      where: { AND: [{ id }, this.scopeWhere(actor)] },
      include: { participants: true },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud "${id}" no encontrada.`);
    }
    return request as RequestWithParticipants;
  }

  /**
   * Valida que cada id de `participantProcessIds` corresponda a un Process
   * activo (design §11 D9/NIT-3); id inexistente/inactivo -> 400. NO se filtra
   * por alcance: participar no amplia el scope. Devuelve el set deduplicado
   * (incluye siempre el proceso principal, BR-001).
   */
  private async resolveParticipantIds(
    mainProcessId: string,
    participantProcessIds: string[] | undefined,
  ): Promise<string[]> {
    const requested = new Set<string>(participantProcessIds ?? []);
    // El principal se deduplica: BR-001 lo materializa siempre.
    requested.delete(mainProcessId);

    const extra = Array.from(requested);
    if (extra.length > 0) {
      const active = await this.prisma.process.findMany({
        where: { id: { in: extra }, active: true },
        select: { id: true },
      });
      if (active.length !== extra.length) {
        throw new BadRequestException('Revisa los datos ingresados.');
      }
    }

    return [mainProcessId, ...extra];
  }

  /**
   * SOL-03: resuelve el solicitante del maestro y devuelve los campos a
   * persistir: el área y el nombre se toman SIEMPRE del maestro (el usuario no
   * los diligencia). `currentRequesterId` permite conservar un solicitante que
   * después fue inactivado sin obligar a cambiarlo al editar otros datos.
   */
  private async resolveRequesterData(
    requesterId: string | undefined,
    currentRequesterId: string | null = null,
  ): Promise<{ requesterId?: string; requesterName?: string; requesterArea?: string }> {
    if (requesterId === undefined) {
      return {};
    }
    const requester = await this.prisma.requester.findFirst({
      where: { id: requesterId },
      include: { area: { select: { name: true } } },
    });
    if (!requester) {
      throw new BadRequestException('El solicitante seleccionado no existe.');
    }
    if (!requester.active && requester.id !== currentRequesterId) {
      throw new BadRequestException('El solicitante seleccionado está inactivo.');
    }
    return {
      requesterId: requester.id,
      requesterName: requester.name,
      requesterArea: requester.area.name,
    };
  }

  async findMany(
    actor: CurrentActor,
    filters: ListRequestsDto,
  ): Promise<RequestResponseDto[]> {
    const where: Prisma.RequestWhereInput = { ...this.scopeWhere(actor) };
    if (filters.state !== undefined) {
      where.operationalState = filters.state;
    }
    if (filters.mainProcessId !== undefined) {
      where.mainProcessId = filters.mainProcessId;
    }

    const requests = await this.prisma.request.findMany({
      where,
      orderBy: [{ registeredAt: 'desc' }, { createdAt: 'desc' }],
      include: { participants: true },
    });

    return Promise.all(
      requests.map((r) =>
        this.state.buildResponse(r as RequestWithParticipants),
      ),
    );
  }

  async findOne(actor: CurrentActor, id: string): Promise<RequestResponseDto> {
    const request = await this.requireInScope(actor, id);
    return this.state.buildResponse(request);
  }

  async create(
    actor: CurrentActor,
    dto: CreateRequestDto,
  ): Promise<RequestResponseDto> {
    // El proceso principal debe existir, estar activo y estar en alcance (404 si
    // fuera de alcance, igual que la lectura; design §3.4).
    const mainProcess = await this.prisma.process.findFirst({
      where: {
        AND: [
          { id: dto.mainProcessId, active: true },
          actor.isJefeArea
            ? {}
            : { id: { in: Array.from(actor.scopedProcessIds) } },
        ],
      },
      select: { id: true },
    });
    if (!mainProcess) {
      throw new NotFoundException(
        `Proceso principal "${dto.mainProcessId}" no encontrado.`,
      );
    }

    const participantIds = await this.resolveParticipantIds(
      dto.mainProcessId,
      dto.participantProcessIds,
    );

    const requesterData = await this.resolveRequesterData(dto.requesterId);

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          title: dto.title,
          mainProcessId: dto.mainProcessId,
          // operationalState usa el default del schema (REGISTRADA): el service
          // no lo repite (design §1.2, MEDIUM-3).
          ...requesterData,
          ...(dto.functionalOwner !== undefined
            ? { functionalOwner: dto.functionalOwner }
            : {}),
          ...(dto.expectedResult !== undefined
            ? { expectedResult: dto.expectedResult }
            : {}),
          ...(dto.referenceUrl !== undefined
            ? { referenceUrl: dto.referenceUrl }
            : {}),
          ...(dto.targetDate !== undefined
            ? { targetDate: new Date(dto.targetDate) }
            : {}),
          ...(dto.initialCommitmentDate !== undefined
            ? { initialCommitmentDate: new Date(dto.initialCommitmentDate) }
            : {}),
          participants: {
            create: participantIds.map((processId) => ({ processId })),
          },
        },
        include: { participants: true },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'REQUEST',
        objectId: request.id,
        scopeProcessId: request.mainProcessId,
        before: null,
        after: this.snapshot(request),
      });

      return request as RequestWithParticipants;
    });

    return this.state.buildResponse(created);
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateRequestDto,
  ): Promise<RequestResponseDto> {
    const existing = await this.requireInScope(actor, id);
    if (existing.operationalState === 'CERRADA') {
      throw new ConflictException(
        'El proyecto está cerrado; no se puede modificar su ficha. Solicita su reapertura si es necesario.',
      );
    }

    // Reconciliar participantes si llegan: el principal se mantiene siempre
    // (BR-001). Se recomputan desde cero preservando el invariante.
    const participantIds =
      dto.participantProcessIds !== undefined
        ? await this.resolveParticipantIds(
            existing.mainProcessId,
            dto.participantProcessIds,
          )
        : null;

    const requesterData = await this.resolveRequesterData(
      dto.requesterId,
      existing.requesterId,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (participantIds !== null) {
        await tx.requestParticipant.deleteMany({ where: { requestId: id } });
        await tx.requestParticipant.createMany({
          data: participantIds.map((processId) => ({
            requestId: id,
            processId,
          })),
        });
      }

      const request = await tx.request.update({
        where: { id },
        data: {
          // registeredAt, initialCommitmentDate y operationalState NO se tocan
          // (BR-017/BR-022).
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...requesterData,
          ...(dto.functionalOwner !== undefined
            ? { functionalOwner: dto.functionalOwner }
            : {}),
          ...(dto.expectedResult !== undefined
            ? { expectedResult: dto.expectedResult }
            : {}),
          ...(dto.referenceUrl !== undefined
            ? { referenceUrl: dto.referenceUrl }
            : {}),
          ...(dto.targetDate !== undefined
            ? { targetDate: new Date(dto.targetDate) }
            : {}),
          ...(dto.changeJustification !== undefined
            ? { changeJustification: dto.changeJustification }
            : {}),
        },
        include: { participants: true },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: request.id,
        scopeProcessId: request.mainProcessId,
        before: this.snapshot(existing),
        after: this.snapshot(request),
      });

      return request as RequestWithParticipants;
    });

    return this.state.buildResponse(updated);
  }

  /**
   * SOL-01: eliminación lógica. Conserva el registro (y su historial/auditoría)
   * marcándolo con `deletedAt`; deja de aparecer en listados y consultas. No se
   * permite eliminar solicitudes que ya están en ejecución o cerradas.
   */
  async remove(actor: CurrentActor, id: string): Promise<void> {
    const existing = await this.requireInScope(actor, id);

    const BLOCKED_STATES = new Set<string>([
      'EN_EJECUCION',
      'BLOQUEADA',
      'EN_VALIDACION',
      'LISTA_PARA_LIBERAR',
      'EN_ESTABILIZACION',
      'OPERATIVA',
      'CERRADA',
    ]);
    if (BLOCKED_STATES.has(existing.operationalState)) {
      throw new ConflictException(
        'No se puede eliminar una solicitud que ya está en ejecución o cerrada.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.update({
        where: { id },
        data: { deletedAt: new Date(), deletedByUserId: actor.userId },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'DELETE',
        objectType: 'REQUEST',
        objectId: id,
        scopeProcessId: request.mainProcessId,
        before: this.snapshot(existing),
        after: null,
      });
    });
  }
}
