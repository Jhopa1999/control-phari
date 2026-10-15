import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { AdminUsersService } from './admin-users.service';
/**
 * Pruebas de la promocion a ADMIN (design e.4): 404 si no existe, set true/false
 * con auditoria USER, y guard-rail del ultimo admin activo (400).
 */
function actor(): CurrentActor {
  return {
    userId: 'admin-caller',
    name: 'Admin',
    identifier: 'admin@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isAdmin: true,
  };
}
function makeDeps(opts: { user?: Record<string, unknown> | null; adminCount?: number }) {
  const txClient = { user: { update: jest.fn().mockResolvedValue({}) } };
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.user ?? null),
      count: jest.fn().mockResolvedValue(opts.adminCount ?? 0),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txClient)),
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new AdminUsersService(prisma, audit);
  return { service, prisma, audit, txClient };
}
describe('AdminUsersService.setAdminFlag', () => {
  it('404 si el usuario no existe', async () => {
    const { service } = makeDeps({ user: null });
    await expect(
      service.setAdminFlag(actor(), 'nope', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('promueve a ADMIN (false -> true) y audita USER', async () => {
    const { service, audit, txClient } = makeDeps({
      user: { id: 'u1', isAdmin: false, active: true },
    });
    await service.setAdminFlag(actor(), 'u1', true);
    expect((txClient.user.update as jest.Mock).mock.calls[0][0].data.isAdmin).toBe(true);
    expect((audit.record as jest.Mock).mock.calls[0][1].objectType).toBe('USER');
    expect((audit.record as jest.Mock).mock.calls[0][1].objectId).toBe('u1');
  });
  it('degrada a un admin cuando hay mas de uno activo', async () => {
    const { service, txClient } = makeDeps({
      user: { id: 'u1', isAdmin: true, active: true },
      adminCount: 2,
    });
    await service.setAdminFlag(actor(), 'u1', false);
    expect((txClient.user.update as jest.Mock).mock.calls[0][0].data.isAdmin).toBe(false);
  });
  it('guard-rail: no degrada al unico admin activo (400)', async () => {
    const { service } = makeDeps({
      user: { id: 'u1', isAdmin: true, active: true },
      adminCount: 1,
    });
    await expect(
      service.setAdminFlag(actor(), 'u1', false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('sin cambio efectivo (ya es admin) no escribe ni audita', async () => {
    const { service, audit, txClient } = makeDeps({
      user: { id: 'u1', isAdmin: true, active: true },
      adminCount: 3,
    });
    await service.setAdminFlag(actor(), 'u1', true);
    expect(txClient.user.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
