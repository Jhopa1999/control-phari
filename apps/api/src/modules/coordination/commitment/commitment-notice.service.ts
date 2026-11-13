import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  NotificationService,
  NotificationType,
} from '../../notification/notification.service';
import { addDaysUTC, dateToString } from '../date';
import { localToday } from '../local-day';
import { OPEN_COMMITMENT_STATES } from './commitment-due';

type NoticeColumn =
  | 'dueSoonNotifiedAt'
  | 'dueTodayNotifiedAt'
  | 'overdueNotifiedAt';

export interface CommitmentNoticeResult {
  dueSoon: number;
  dueToday: number;
  overdue: number;
}

/**
 * Avisos internos de vencimiento de compromisos (vence mañana, vence hoy y
 * vencido). Idempotentes: cada aviso «reclama» su marca con un `updateMany`
 * condicionado a que siga en NULL; solo quien reclama notifica, así que dos
 * corridas (o dos instancias) producen un único aviso. Destinatario: la persona
 * asignada o, si no hay, la responsable; sin destinatario no se avisa ni se marca.
 */
@Injectable()
export class CommitmentNoticeService {
  private readonly logger = new Logger(CommitmentNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async sendDueNotices(now: Date = new Date()): Promise<CommitmentNoticeResult> {
    const today = localToday(now);
    const tomorrow = addDaysUTC(today, 1);

    const rows = await this.prisma.commitment.findMany({
      where: {
        state: { in: [...OPEN_COMMITMENT_STATES] },
        dueDate: { lte: tomorrow },
        OR: [{ assignedUserId: { not: null } }, { responsibleUserId: { not: null } }],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignedUserId: true,
        responsibleUserId: true,
        relatedRequestId: true,
        relatedProjectRequestId: true,
        dueSoonNotifiedAt: true,
        dueTodayNotifiedAt: true,
        overdueNotifiedAt: true,
      },
    });

    const result: CommitmentNoticeResult = { dueSoon: 0, dueToday: 0, overdue: 0 };
    for (const row of rows) {
      const recipient = row.assignedUserId ?? row.responsibleUserId;
      if (!recipient) continue;

      let column: NoticeColumn;
      let type: NotificationType;
      let title: string;
      const due = dateToString(row.dueDate);
      let message: string;
      if (row.dueDate.getTime() < today.getTime()) {
        if (row.overdueNotifiedAt) continue;
        column = 'overdueNotifiedAt';
        type = NotificationType.COMMITMENT_OVERDUE;
        title = 'Compromiso vencido';
        message = `«${row.title}» venció el ${due}.`;
      } else if (row.dueDate.getTime() === today.getTime()) {
        if (row.dueTodayNotifiedAt) continue;
        column = 'dueTodayNotifiedAt';
        type = NotificationType.COMMITMENT_DUE_TODAY;
        title = 'Compromiso vence hoy';
        message = `«${row.title}» vence hoy (${due}).`;
      } else {
        if (row.dueSoonNotifiedAt) continue;
        column = 'dueSoonNotifiedAt';
        type = NotificationType.COMMITMENT_DUE_SOON;
        title = 'Compromiso vence mañana';
        message = `«${row.title}» vence mañana (${due}).`;
      }

      try {
        const claim = await this.prisma.commitment.updateMany({
          where: {
            id: row.id,
            [column]: null,
            state: { in: [...OPEN_COMMITMENT_STATES] },
          },
          data: { [column]: now },
        });
        if (claim.count !== 1) continue;
        await this.notifications.notify({
          userIds: [recipient],
          type,
          title,
          message,
          link: `/seguimiento/reuniones?tab=compromisos&commitmentId=${encodeURIComponent(row.id)}`,
          requestId: row.relatedProjectRequestId ?? row.relatedRequestId,
        });
        if (column === 'overdueNotifiedAt') result.overdue += 1;
        else if (column === 'dueTodayNotifiedAt') result.dueToday += 1;
        else result.dueSoon += 1;
      } catch (error) {
        this.logger.warn(
          `No se pudo emitir el aviso ${column} del compromiso ${row.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return result;
  }
}
