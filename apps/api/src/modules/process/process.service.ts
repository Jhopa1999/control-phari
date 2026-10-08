import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { ProcessModel } from '../../generated/prisma/models/Process';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { CreateProcessDto, ProcessKind } from './dto/create-process.dto';
import { ListProcessesDto } from './dto/list-processes.dto';
import { UpdateProcessDto } from './dto/update-process.dto';

@Injectable()
export class ProcessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeKey(value: string): string {
    return value.trim().toUpperCase();
  }

  /**
   * Snapshot JSON de un proceso para auditoria (before/after). Las fechas se
   * serializan a ISO para que sean JSON validos.
   */
  private snapshot(process: ProcessModel): Prisma.InputJsonValue {
    return {
      id: process.id,
      code: process.code,
      name: process.name,
      framework: process.framework,
      kind: process.kind,
      active: process.active,
      sortOrder: process.sortOrder,
    };
  }

  /**
   * Construye el `where` de lectura segun el plano (design 2.4):
   * - jefe: sin filtro (administra toda el area, incluido lo que acaba de crear).
   * - no-jefe: filtra por scopedProcessIds (404 natural fuera de alcance).
   */
  private scopeWhere(actor: CurrentActor): Prisma.ProcessWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { id: { in: Array.from(actor.scopedProcessIds) } };
  }

  async findMany(
    actor: CurrentActor,
    filters: ListProcessesDto,
  ): Promise<ProcessModel[]> {
    const where: Prisma.ProcessWhereInput = { ...this.scopeWhere(actor) };
    if (filters.active !== undefined) {
      where.active = filters.active;
    }
    if (filters.kind !== undefined) {
      where.kind = filters.kind;
    }

    return this.prisma.process.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(actor: CurrentActor, id: string): Promise<ProcessModel> {
    // El alcance se aplica en el where: un proceso fuera de alcance no coincide
    // y produce 404 (no 403), sin confirmar que existe (design 2.4).
    const process = await this.prisma.process.findFirst({
      where: { AND: [{ id }, this.scopeWhere(actor)] },
    });
    if (!process) {
      throw new NotFoundException(`Proceso "${id}" no encontrado.`);
    }
    return process;
  }

  async create(
    actor: CurrentActor,
    dto: CreateProcessDto,
  ): Promise<ProcessModel> {
    const code = this.normalizeKey(dto.code);
    const kind = dto.kind ?? ProcessKind.PROCESS;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.process.create({
          data: {
            code,
            name: dto.name,
            kind,
            ...(dto.framework !== undefined ? { framework: dto.framework } : {}),
            ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          },
        });

        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'CREATE',
          objectType: 'PROCESS',
          objectId: created.id,
          scopeProcessId: created.id,
          before: null,
          after: this.snapshot(created),
        });

        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Ya existe un proceso con code "${code}".`);
      }
      throw error;
    }
  }

  async update(
    actor: CurrentActor,
    id: string,
    dto: UpdateProcessDto,
  ): Promise<ProcessModel> {
    // El jefe administra cualquier proceso del area; la edicion no se filtra por
    // scopedProcessIds (Plano B). Se verifica existencia para dar 404.
    const existing = await this.prisma.process.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Proceso "${id}" no encontrado.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.process.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.framework !== undefined ? { framework: dto.framework } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'PROCESS',
        objectId: updated.id,
        scopeProcessId: updated.id,
        before: this.snapshot(existing),
        after: this.snapshot(updated),
      });

      return updated;
    });
  }
}
