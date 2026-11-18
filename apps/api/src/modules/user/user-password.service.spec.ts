import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { UserPasswordService } from './user-password.service';

const actor = { userId: 'jefe' } as unknown as CurrentActor;

type Row = { id: string; mustChangePassword: boolean; passwordHash: string | null };
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  mustChangePassword: false,
  passwordHash: 'h',
  ...over,
});

function setup(rows: Row[], auditFails = false) {
  const user = {
    findMany: jest.fn(async (args: { where: { id?: { in: string[] } } }) =>
      args.where.id ? rows.filter((r) => args.where.id!.in.includes(r.id)) : rows,
    ),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const prismaObj: Record<string, unknown> = { user };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const audit = {
    record: jest.fn(async () => {
      if (auditFails) throw new Error('falla auditoría');
    }),
  };
  const service = new UserPasswordService(
    prismaObj as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, user, audit };
}

describe('UserPasswordService', () => {
  it('all: excluye al actor, a los sin contraseña y a los excluidos; incluye inactivos', async () => {
    const m = setup([
      row('jefe'),
      row('a'),
      row('sin-pass', { passwordHash: null }),
      row('mcp'),
      row('inactivo'),
    ]);
    const res = await m.service.forcePasswordChange(actor, { all: true, excludeUserIds: ['mcp'] });
    expect(res).toEqual({ updated: 2, skipped: 1, excludedSelf: true });
    expect(m.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'inactivo'] } },
      data: { mustChangePassword: true },
    });
    expect(m.audit.record).toHaveBeenCalledTimes(2);
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'PASSWORD_CHANGE_REQUIRED',
        actorUserId: 'jefe',
        objectType: 'USER',
        objectId: 'a',
      }),
    );
  });

  it('userIds: el propio actor puede incluirse a propósito', async () => {
    const m = setup([row('jefe'), row('a')]);
    const res = await m.service.forcePasswordChange(actor, { userIds: ['jefe'] });
    expect(res).toEqual({ updated: 1, skipped: 0, excludedSelf: false });
  });

  it('id inexistente: 404 y no aplica nada', async () => {
    const m = setup([row('a')]);
    await expect(
      m.service.forcePasswordChange(actor, { userIds: ['a', 'fantasma'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(m.user.updateMany).not.toHaveBeenCalled();
    expect(m.audit.record).not.toHaveBeenCalled();
  });

  it('idempotente: quien ya está marcado cuenta como omitido y no se audita', async () => {
    const m = setup([row('a', { mustChangePassword: true }), row('b')]);
    const res = await m.service.forcePasswordChange(actor, { userIds: ['a', 'b'] });
    expect(res).toEqual({ updated: 1, skipped: 1, excludedSelf: false });
    expect(m.audit.record).toHaveBeenCalledTimes(1);
  });

  it('enabled=false: retira la exigencia, sin excluir al actor ni exigir contraseña', async () => {
    const m = setup([
      row('jefe', { mustChangePassword: true }),
      row('a', { mustChangePassword: true, passwordHash: null }),
      row('b'),
    ]);
    const res = await m.service.forcePasswordChange(actor, { all: true, enabled: false });
    expect(res).toEqual({ updated: 2, skipped: 1, excludedSelf: false });
    expect(m.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['jefe', 'a'] } },
      data: { mustChangePassword: false },
    });
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'PASSWORD_CHANGE_CLEARED' }),
    );
  });

  it.each([
    [{}],
    [{ all: true, userIds: ['a'] }],
    [{ userIds: ['a'], excludeUserIds: ['b'] }],
    [{ all: false }],
  ])('combinación inválida %j: 400', async (dto) => {
    const m = setup([row('a')]);
    await expect(m.service.forcePasswordChange(actor, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(m.user.updateMany).not.toHaveBeenCalled();
  });

  it('si falla la auditoría el error se propaga (la transacción revierte)', async () => {
    const m = setup([row('a')], true);
    await expect(m.service.forcePasswordChange(actor, { userIds: ['a'] })).rejects.toThrow(
      'falla auditoría',
    );
  });
});
