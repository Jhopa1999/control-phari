import { NotFoundException } from '@nestjs/common';
import { NotificationService, NotificationType } from './notification.service';

function build() {
  const prisma = {
    user: { findMany: jest.fn() },
    notification: {
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  return { service: new NotificationService(prisma as never), prisma };
}

describe('NotificationService', () => {
  it('crea una notificación por destinatario activo, sin duplicados ni al autor', async () => {
    const { service, prisma } = build();
    prisma.user.findMany.mockResolvedValue([{ id: 'u2' }]);
    await service.notify({
      userIds: ['u1', 'u2', 'u2', null],
      excludeUserId: 'u1',
      type: NotificationType.TASK_ASSIGNED,
      title: 'Nueva tarea asignada',
      message: 'm',
      link: '/mi-trabajo',
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u2'] }, active: true },
      select: { id: true },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'u2', type: 'TASK_ASSIGNED', link: '/mi-trabajo' })],
    });
  });

  it('un fallo al notificar no interrumpe la acción de negocio', async () => {
    const { service, prisma } = build();
    prisma.user.findMany.mockRejectedValue(new Error('db'));
    await expect(
      service.notify({ userIds: ['u2'], type: NotificationType.TASK_ASSIGNED, title: 't', message: 'm' }),
    ).resolves.toBeUndefined();
  });

  it('solo lista y marca las notificaciones del propio usuario', async () => {
    const { service, prisma } = build();
    const res = await service.listMine('u1', {});
    expect(res.unreadCount).toBe(2);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('u1', 'n-de-otro')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.markAllRead('u1')).resolves.toEqual({ updated: 2 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
