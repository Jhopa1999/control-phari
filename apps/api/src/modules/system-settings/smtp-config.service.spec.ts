import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { MailConfigResolver } from '../mail/mail-config.resolver';
import { MailService } from '../mail/mail.service';
import { RoleCode } from '../auth/role-code';
import { SmtpConfigService } from './smtp-config.service';
import { UpdateSmtpConfigDto } from './dto/update-smtp-config.dto';
/**
 * Pruebas del servicio SMTP (design e.1/e.2/e.3): GET sin password + source,
 * reglas deterministas del password en update (cifra/clearPassword/'' invalida
 * / combinacion invalida), auditoria SMTP_CONFIG y la prueba de envio.
 */
const KEY_VAR = 'SETTINGS_ENCRYPTION_KEY';
function adminActor(): CurrentActor {
  return {
    userId: 'admin-1',
    name: 'Alex Admin',
    identifier: 'admin@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isAdmin: true,
  };
}
function baseDto(overrides: Partial<UpdateSmtpConfigDto> = {}): UpdateSmtpConfigDto {
  return {
    host: 'smtp.demo.local',
    port: 587,
    fromAddress: 'from@demo.local',
    ...overrides,
  } as UpdateSmtpConfigDto;
}
describe('SmtpConfigService', () => {
  const originalKey = process.env[KEY_VAR];
  beforeAll(() => {
    process.env[KEY_VAR] = Buffer.alloc(32, 7).toString('base64');
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env[KEY_VAR];
    else process.env[KEY_VAR] = originalKey;
  });
  function makeDeps(opts: {
    row?: Record<string, unknown> | null;
    source?: 'db' | 'env' | 'none';
    resolve?: unknown;
  }) {
    const txClient = {
      smtpConfig: {
        create: jest.fn().mockResolvedValue({ id: 'row-1' }),
        update: jest.fn().mockResolvedValue({ id: 'row-1' }),
      },
    };
    const prisma = {
      smtpConfig: {
        findFirst: jest.fn().mockResolvedValue(opts.row ?? null),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txClient)),
    } as unknown as PrismaService;
    const resolver = {
      resolve: jest.fn().mockResolvedValue(opts.resolve ?? null),
      resolveSource: jest.fn().mockResolvedValue(opts.source ?? 'none'),
    } as unknown as MailConfigResolver;
    const sendMail = jest.fn().mockResolvedValue({});
    const mail = {
      createTransport: jest.fn().mockReturnValue({ sendMail }),
    } as unknown as MailService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new SmtpConfigService(prisma, resolver, mail, audit);
    return { service, prisma, resolver, mail, audit, txClient, sendMail };
  }
  it('getCurrent sin fila => campos null, passwordSet false, source resuelto', async () => {
    const { service } = makeDeps({ row: null, source: 'none' });
    const res = await service.getCurrent();
    expect(res.host).toBeNull();
    expect(res.passwordSet).toBe(false);
    expect(res.source).toBe('none');
    expect(res).not.toHaveProperty('password');
    expect(res).not.toHaveProperty('passwordCiphertext');
  });
  it('getCurrent con fila y ciphertext => passwordSet true pero sin exponer el valor', async () => {
    const { service } = makeDeps({
      row: {
        host: 'h',
        port: 25,
        secure: false,
        username: 'u',
        passwordCiphertext: 'iv.tag.ct',
        fromAddress: 'f@d.local',
        fromName: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      source: 'db',
    });
    const res = await service.getCurrent();
    expect(res.passwordSet).toBe(true);
    expect(res.source).toBe('db');
    expect(JSON.stringify(res)).not.toContain('iv.tag.ct');
  });
  it('update con password nuevo => cifra y audita SMTP_CONFIG', async () => {
    const { service, audit, txClient } = makeDeps({ row: null, source: 'db' });
    await service.update(adminActor(), baseDto({ password: 'nuevo-secreto' }));
    const createArg = (txClient.smtpConfig.create as jest.Mock).mock.calls[0][0];
    expect(typeof createArg.data.passwordCiphertext).toBe('string');
    expect(createArg.data.passwordCiphertext.split('.')).toHaveLength(3);
    expect(createArg.data.passwordCiphertext).not.toContain('nuevo-secreto');
    expect((audit.record as jest.Mock).mock.calls[0][1].objectType).toBe('SMTP_CONFIG');
  });
  it('update clearPassword:true => limpia ciphertext (null)', async () => {
    const { service, txClient } = makeDeps({
      row: { id: 'row-1', host: 'h', port: 1, secure: false, passwordCiphertext: 'x.y.z', fromAddress: 'f@d.local' },
      source: 'db',
    });
    await service.update(adminActor(), baseDto({ clearPassword: true }));
    const updateArg = (txClient.smtpConfig.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.passwordCiphertext).toBeNull();
  });
  it('update password ausente => NO toca el ciphertext', async () => {
    const { service, txClient } = makeDeps({
      row: { id: 'row-1', host: 'h', port: 1, secure: false, passwordCiphertext: 'x.y.z', fromAddress: 'f@d.local' },
      source: 'db',
    });
    await service.update(adminActor(), baseDto());
    const updateArg = (txClient.smtpConfig.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('passwordCiphertext');
  });
  it("update password '' => 400", async () => {
    const { service } = makeDeps({ row: null });
    await expect(
      service.update(adminActor(), baseDto({ password: '' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('update password + clearPassword => 400', async () => {
    const { service } = makeDeps({ row: null });
    await expect(
      service.update(adminActor(), baseDto({ password: 'x', clearPassword: true })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('test con resolve===null => ok:false con mensaje claro', async () => {
    const { service, sendMail } = makeDeps({ resolve: null });
    const res = await service.test({ to: 'dest@demo.local' });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/No hay SMTP/i);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('test con config => ok:true y envia', async () => {
    const cfg = { host: 'h', port: 25, secure: false, from: 'f@d.local', appWebUrl: 'http://x' };
    const { service, sendMail } = makeDeps({ resolve: cfg });
    const res = await service.test({ to: 'dest@demo.local' });
    expect(res.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('test con fallo de SMTP => ok:false sin stack ni credenciales', async () => {
    const cfg = { host: 'h', port: 25, secure: false, from: 'f@d.local', appWebUrl: 'http://x', user: 'u', password: 'secreta' };
    const { service, mail } = makeDeps({ resolve: cfg });
    (mail.createTransport as jest.Mock).mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error('connection refused')),
    });
    const res = await service.test({ to: 'dest@demo.local' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('connection refused');
    expect(res.message).not.toContain('secreta');
  });
});
