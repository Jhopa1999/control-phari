import type { Transporter } from 'nodemailer';
import type { MailConfig } from './mail.config';
import { MailService } from './mail.service';

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

function createTransporterMock() {
  const sendMail = jest.fn().mockResolvedValue({});
  const transporter = { sendMail } as unknown as Transporter;
  return { transporter, sendMail };
}

describe('MailService', () => {
  it('sendPasswordReset llama sendMail una vez con to, subject y la resetUrl/nombre', async () => {
    const { transporter, sendMail } = createTransporterMock();
    const service = new MailService(transporter, makeConfig());

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
    const { transporter, sendMail } = createTransporterMock();
    const service = new MailService(transporter, makeConfig());

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

  it('usa MAIL_FROM_NAME en el remitente cuando esta definido', async () => {
    const { transporter, sendMail } = createTransporterMock();
    const service = new MailService(transporter, makeConfig());

    await service.sendPasswordReset({
      to: 'persona@demo.local',
      name: 'Persona',
      resetUrl: 'http://localhost:3000/reset?token=abc',
      expiresLabel: '1 hora',
    });

    const message = sendMail.mock.calls[0][0];
    expect(message.from).toBe('"Notificaciones" <notificaciones@demo.local>');
  });
});
