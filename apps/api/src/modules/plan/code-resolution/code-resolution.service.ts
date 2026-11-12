import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentActor } from '../../auth/current-actor';
import { requestScopeWhere } from '../../request/request-scope.service';
import { parseVisibleCode, ParsedVisibleCode, VisibleCodeKind } from '../visible-code';
import { CodeResolutionDto, PhaseByCodeDto } from './dto/code-resolution.dto';

const INVALID_CODE_MESSAGE =
  'Código no válido. Usa la forma completa: PRY-0012, PRY-0012-F2 o PRY-0012-T07.';

/**
 * Resuelve IDs visibles (solicitud, fase, tarea) respetando el alcance de
 * lectura de las solicitudes (`requestScopeWhere`, la misma fuente que usa el
 * detalle por id). Un código inexistente y uno fuera de alcance responden igual
 * (404) para no revelar la existencia de proyectos ajenos.
 */
@Injectable()
export class CodeResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valida el formato (400) y, si se pide, que sea de un tipo concreto. */
  parse(raw: string, expected?: VisibleCodeKind): ParsedVisibleCode {
    const parsed = parseVisibleCode(raw);
    if (!parsed) {
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }
    if (expected && parsed.kind !== expected) {
      const label = { REQUEST: 'una solicitud', PHASE: 'una fase', TASK: 'una tarea' }[expected];
      throw new BadRequestException(`El código "${parsed.code}" no corresponde a ${label}.`);
    }
    return parsed;
  }

  private notFound(code: string): NotFoundException {
    return new NotFoundException(`Código "${code}" no encontrado.`);
  }

  /** Resolución genérica: el tipo se infiere del formato del código. */
  async resolve(actor: CurrentActor, raw: string): Promise<CodeResolutionDto> {
    const parsed = this.parse(raw);
    const scope = requestScopeWhere(actor);

    if (parsed.kind === 'REQUEST') {
      const request = await this.prisma.request.findFirst({
        where: { AND: [{ code: parsed.code }, scope] },
        select: {
          id: true,
          code: true,
          title: true,
          operationalState: true,
          mainProcess: { select: { name: true } },
        },
      });
      if (!request) throw this.notFound(parsed.code);
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

    if (parsed.kind === 'PHASE') {
      const phase = await this.prisma.planPhase.findFirst({
        where: { code: parsed.code, plan: { request: scope } },
        select: {
          id: true,
          code: true,
          name: true,
          plan: {
            select: { request: { select: { id: true, code: true, title: true, operationalState: true } } },
          },
        },
      });
      if (!phase) throw this.notFound(parsed.code);
      const request = phase.plan.request;
      return {
        type: 'PHASE',
        id: phase.id,
        code: phase.code,
        title: phase.name,
        requestId: request.id,
        requestCode: request.code,
        requestTitle: request.title,
        requestStatus: request.operationalState,
        phaseId: phase.id,
        phaseName: phase.name,
      };
    }

    const task = await this.prisma.task.findFirst({
      where: { code: parsed.code, phase: { plan: { request: scope } } },
      select: {
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
      },
    });
    if (!task) throw this.notFound(parsed.code);
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

  /** Detalle de una fase por su ID visible (mismo alcance que el plan de su solicitud). */
  async findPhaseByCode(actor: CurrentActor, raw: string): Promise<PhaseByCodeDto> {
    const parsed = this.parse(raw, 'PHASE');
    const phase = await this.prisma.planPhase.findFirst({
      where: { code: parsed.code, plan: { request: requestScopeWhere(actor) } },
      include: {
        plan: {
          select: { request: { select: { id: true, code: true, title: true, operationalState: true } } },
        },
      },
    });
    if (!phase) throw this.notFound(parsed.code);
    const request = phase.plan.request;
    return {
      id: phase.id,
      code: phase.code,
      planId: phase.planId,
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
      deliverable: phase.deliverable,
      order: phase.order,
      requestId: request.id,
      requestCode: request.code,
      requestTitle: request.title,
      requestStatus: request.operationalState,
    };
  }
}
