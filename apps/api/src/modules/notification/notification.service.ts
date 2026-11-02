import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RoleCode } from '../auth/role-code';
import { NotificationListDto } from './dto/notification-response.dto';

/** Tipos de evento que generan notificaciones (NOT-01). */
export enum NotificationType {
  APPROVAL_PENDING = 'APPROVAL_PENDING',
  PLAN_PENDING_AUTHORIZATION = 'PLAN_PENDING_AUTHORIZATION',
  PLAN_AUTHORIZED = 'PLAN_AUTHORIZED',
  PLAN_RETURNED = 'PLAN_RETURNED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  DOCUMENT_PENDING_APPROVAL = 'DOCUMENT_PENDING_APPROVAL',
  DOCUMENT_APPROVED = 'DOCUMENT_APPROVED',
  DOCUMENT_REJECTED = 'DOCUMENT_REJECTED',
  PLAN_TASKS_COMPLETED = 'PLAN_TASKS_COMPLETED',
  CLOSURE_REQUESTED = 'CLOSURE_REQUESTED',
  CLOSURE_APPROVED = 'CLOSURE_APPROVED',
  CLOSURE_REJECTED = 'CLOSURE_REJECTED',
  PROJECT_REOPENED = 'PROJECT_REOPENED',
  COMMITMENT_ASSIGNED = 'COMMITMENT_ASSIGNED',
  /** El gasto de IA del mes alcanzó el umbral de alerta (solo administradores). */
  AI_BUDGET_ALERT = 'AI_BUDGET_ALERT',
  /** Se agotó el presupuesto mensual de IA (solo administradores). */
  AI_BUDGET_EXCEEDED = 'AI_BUDGET_EXCEEDED',
}

export interface NotifyInput {
  userIds: Iterable<string | null | undefined>;
  /** El autor de la acción no se notifica a sí mismo. */
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  requestId?: string | null;
}

const MAX_TITLE = 255;
const MAX_MESSAGE = 1000;

/**
 * Centro de notificaciones (NOT-01): persiste notificaciones por usuario a
 * partir de eventos reales del backend y resuelve los destinatarios según los
 * roles y procesos actuales. Las notificaciones son un efecto secundario: un
 * fallo al crearlas se registra en el log y nunca revierte la acción de negocio.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ escritura

  async notify(input: NotifyInput): Promise<void> {
    try {
      const ids = new Set<string>();
      for (const id of input.userIds) {
        if (id && id !== input.excludeUserId) ids.add(id);
      }
      if (ids.size === 0) return;
      const active = await this.prisma.user.findMany({
        where: { id: { in: [...ids] }, active: true },
        select: { id: true },
      });
      if (active.length === 0) return;
      await this.prisma.notification.createMany({
        data: active.map((u) => ({
          userId: u.id,
          type: input.type,
          title: input.title.slice(0, MAX_TITLE),
          message: input.message.slice(0, MAX_MESSAGE),
          link: input.link ?? null,
          requestId: input.requestId ?? null,
        })),
      });
    } catch (error) {
      this.logger.warn(
        `No fue posible registrar la notificación ${input.type}: ${(error as Error).message}`,
      );
    }
  }

  // ------------------------------------------------------- destinatarios

  /**
   * Jefes de área del área del proceso indicado (grant JEFE_AREA activo en
   * algún proceso de esa área). Si el área no tiene jefe asignado, se notifica
   * a todos los jefes con grant activo para que la aprobación no quede huérfana.
   */
  async areaHeadsForProcess(processId: string): Promise<string[]> {
    try {
      const process = await this.prisma.process.findFirst({
        where: { id: processId },
        select: { areaId: true },
      });
      const base = {
        active: true,
        role: { code: RoleCode.JEFE_AREA },
        user: { active: true },
      };
      const inArea = process
        ? await this.prisma.grant.findMany({
            where: { ...base, process: { areaId: process.areaId } },
            select: { userId: true },
          })
        : [];
      const rows =
        inArea.length > 0
          ? inArea
          : await this.prisma.grant.findMany({ where: base, select: { userId: true } });
      return [...new Set(rows.map((r) => r.userId))];
    } catch {
      return [];
    }
  }

  /** Líderes del proceso (grant LIDER_PROCESO activo en el proceso). */
  async processLeaders(processId: string): Promise<string[]> {
    try {
      const rows = await this.prisma.grant.findMany({
        where: {
          active: true,
          processId,
          role: { code: RoleCode.LIDER_PROCESO },
          user: { active: true },
        },
        select: { userId: true },
      });
      return [...new Set(rows.map((r) => r.userId))];
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------- lectura

  async listMine(
    userId: string,
    options: { unreadOnly?: boolean; take?: number },
  ): Promise<NotificationListDto> {
    const take = Math.min(Math.max(options.take ?? 30, 1), 100);
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        requestId: n.requestId,
        read: n.readAt !== null,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };
  }

  /** Marca una notificación propia como leída (404 si no es del usuario). */
  async markRead(userId: string, id: string): Promise<void> {
    const found = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!found) {
      throw new NotFoundException('Notificación no encontrada.');
    }
    if (found.readAt === null) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}
