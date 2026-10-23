import { loadMailConfigOrNull } from './mail.config';

/**
 * Pruebas de `loadMailConfigOrNull` (design d.2/d.3): obligatoriedad uniforme
 * de host/port/from/appWebUrl y tratamiento de opcionales. Se manipula
 * `process.env` restaurandolo despues de cada caso.
 */
describe('loadMailConfigOrNull', () => {
  const ENV_KEYS = [
    'SMTP_HOST',
    'SMTP_PORT',
    'MAIL_FROM',
    'APP_WEB_URL',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'MAIL_FROM_NAME',
  ];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  function setComplete(): void {
    process.env.SMTP_HOST = 'smtp.demo.local';
    process.env.SMTP_PORT = '587';
    process.env.MAIL_FROM = 'noreply@demo.local';
    process.env.APP_WEB_URL = 'http://localhost:3000';
  }

  it('config completa minima -> MailConfig con secure=false por defecto', () => {
    setComplete();
    const cfg = loadMailConfigOrNull();
    expect(cfg).not.toBeNull();
    expect(cfg?.host).toBe('smtp.demo.local');
    expect(cfg?.port).toBe(587);
    expect(cfg?.secure).toBe(false);
    expect(cfg?.user).toBeUndefined();
    expect(cfg?.password).toBeUndefined();
    expect(cfg?.fromName).toBeUndefined();
  });

  it('incluye user/password/fromName y secure=true cuando se definen', () => {
    setComplete();
    process.env.SMTP_SECURE = 'TRUE';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASSWORD = 'p';
    process.env.MAIL_FROM_NAME = 'Notificaciones';
    const cfg = loadMailConfigOrNull();
    expect(cfg?.secure).toBe(true);
    expect(cfg?.user).toBe('u');
    expect(cfg?.password).toBe('p');
    expect(cfg?.fromName).toBe('Notificaciones');
  });

  it('falta un obligatorio (APP_WEB_URL) -> null', () => {
    setComplete();
    delete process.env.APP_WEB_URL;
    expect(loadMailConfigOrNull()).toBeNull();
  });

  it('valor obligatorio solo con espacios -> null (nonEmpty)', () => {
    setComplete();
    process.env.SMTP_HOST = '   ';
    expect(loadMailConfigOrNull()).toBeNull();
  });

  it('SMTP_PORT no numerico -> null', () => {
    setComplete();
    process.env.SMTP_PORT = 'abc';
    expect(loadMailConfigOrNull()).toBeNull();
  });

  it('SMTP_PORT cero o negativo -> null', () => {
    setComplete();
    process.env.SMTP_PORT = '0';
    expect(loadMailConfigOrNull()).toBeNull();
    process.env.SMTP_PORT = '-5';
    expect(loadMailConfigOrNull()).toBeNull();
  });

  it('SMTP_SECURE distinto de "true" -> secure false', () => {
    setComplete();
    process.env.SMTP_SECURE = 'yes';
    expect(loadMailConfigOrNull()?.secure).toBe(false);
  });
});
