import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { MailConfig } from './mail.config';
import { MailConfigResolver } from './mail-config.resolver';
import { MailService } from './mail.service';
/**
 * Pruebas de MailService con la nueva estrategia (design d.4/d.6): ya no hay
 * token MAIL_TRANSPORTER. Se mockea `MailConfigResolver.resolve` (MailConfig o
 * null) y se espia `nodemailer.createTransport` para no abrir red.
 *
 * Casos clave:
 * - resolve()===null => send* loguea warn con el enlace y NO llama sendMail ni
 *   lanza (preserva contratos 204/200 sin tocar auth-reset/user-invite).
 * - resolve()!=null => send* llama sendMail con from=formatFrom(cfg).
 */
function makeConfig(overrides: Partial<MailConfig> = {}): MailConfig {
  return {
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    user: 'notificaciones@demo.local',
    password: 'secret-not-logged',
    from: 'notificaciones@demo.local',
    fromName: 'Notificaciones',
    appWebUrl: 'http://localhost:3000',
    ...overrides,
  };
}
function makeResolver(config: MailConfig | null): MailConfigResolver {
  return {
    resolve: jest.fn().mockResolvedValue(config),
    resolveSource: jest.fn(),
  } as unknown as MailConfigResolver;
}
function spyTransport() {
  const sendMail = jest.fn().mockResolvedValue({});
  const transporter = { sendMail } as unknown as Transporter;
  const createTransport = jest
    .spyOn(nodemailer, 'createTransport')
    .mockReturnValue(transporter);
  return { sendMail, createTransport };
}
describe('MailService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('sendPasswordReset llama sendMail una vez con to, subject y la resetUrl/nombre', async () => {
    const { sendMail } = spyTransport();
    const service = new MailService(makeResolver(makeConfig()));
    const resetUrl = 'http://localhost:3000/reset?token=abc123';
    await service.sendPasswordReset({
      to: 'persona@demo.local',
      name: 'Persona Demo',
      resetUrl,
      expiresLabel: '1 hora',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('persona@demo.local');
    expect(typeof message.subject).toBe('string');
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.text).toContain(resetUrl);
    expect(message.text).toContain('Persona Demo');
    expect(message.html).toContain(resetUrl);
    expect(message.html).toContain('Persona Demo');
  });
  it('sendUserInvitation llama sendMail una vez con to, subject y la inviteUrl/nombre', async () => {
    const { sendMail } = spyTransport();
    const service = new MailService(makeResolver(makeConfig()));
    const inviteUrl = 'http://localhost:3000/activar?token=xyz789';
    await service.sendUserInvitation({
      to: 'nuevo@demo.local',
      name: 'Nuevo Usuario',
      inviteUrl,
      expiresLabel: '48 horas',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('nuevo@demo.local');
    expect(typeof message.subject).toBe('string');
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.text).toContain(inviteUrl);
    expect(message.text).toContain('Nuevo Usuario');
    expect(message.html).toContain(inviteUrl);
    expect(message.html).toContain('Nuevo Usuario');
  });
  it('usa el nombre visible en el remitente cuando esta definido', async () => {
    const { sendMail } = spyTransport();
    const service = new MailService(makeResolver(makeConfig()));
    await service.sendPasswordReset({
      to: 'persona@demo.local',
      name: 'Persona',
      resetUrl: 'http://localhost:3000/reset?token=abc',
      expiresLabel: '1 hora',
    });
    const message = sendMail.mock.calls[0][0];
    expect(message.from).toBe('"Notificaciones" <notificaciones@demo.local>');
  });
  it('sin SMTP (resolve===null): sendPasswordReset NO envia ni lanza, loguea warn con el enlace', async () => {
    const { sendMail, createTransport } = spyTransport();
    const service = new MailService(makeResolver(null));
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    const resetUrl = 'http://localhost:3000/reset?token=sin-smtp';
    await expect(
      service.sendPasswordReset({
        to: 'persona@demo.local',
        name: 'Persona',
        resetUrl,
        expiresLabel: '1 hora',
      }),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const warnCalls = warn.mock.calls as unknown as unknown[][];
    expect(String(warnCalls[0]?.[0])).toContain(resetUrl);
  });
  it('sin SMTP (resolve===null): sendUserInvitation NO envia ni lanza', async () => {
    const { sendMail } = spyTransport();
    const service = new MailService(makeResolver(null));
    jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    await expect(
      service.sendUserInvitation({
        to: 'nuevo@demo.local',
        name: 'Nuevo',
        inviteUrl: 'http://localhost:3000/activar?token=sin-smtp',
        expiresLabel: '48 horas',
      }),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('isEnabled refleja si hay config resuelta', async () => {
    const enabled = new MailService(makeResolver(makeConfig()));
    const disabled = new MailService(makeResolver(null));
    await expect(enabled.isEnabled()).resolves.toBe(true);
    await expect(disabled.isEnabled()).resolves.toBe(false);
  });
  it('sin usuario SMTP, createTransport no pasa auth', async () => {
    const { createTransport } = spyTransport();
    const service = new MailService(
      makeResolver(makeConfig({ user: undefined, password: undefined })),
    );
    await service.sendPasswordReset({
      to: 'x@demo.local',
      name: 'X',
      resetUrl: 'http://localhost:3000/reset?token=a',
      expiresLabel: '1 hora',
    });
    expect(createTransport).toHaveBeenCalledTimes(1);
    const options = createTransport.mock.calls[0]?.[0] as { auth?: unknown };
    expect(options.auth).toBeUndefined();
  });
});
