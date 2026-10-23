import { PrismaService } from '../../database/prisma.service';
import { encryptSecret } from '../system-settings/settings-crypto';
import { MailConfigResolver } from './mail-config.resolver';

/**
 * Pruebas de `MailConfigResolver` (design d.1/d.3/e.1): prioridad BD > entorno >
 * ninguna, `appWebUrl` SIEMPRE desde env, y descifrado perezoso del password
 * solo cuando hay ciphertext.
 */
function makeResolver(row: unknown): {
  resolver: MailConfigResolver;
  findFirst: jest.Mock;
} {
  const findFirst = jest.fn().mockResolvedValue(row);
  const prisma = { smtpConfig: { findFirst } } as unknown as PrismaService;
  return { resolver: new MailConfigResolver(prisma), findFirst };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    host: 'smtp.db.local',
    port: 465,
    secure: true,
    username: 'dbuser',
    passwordCiphertext: null,
    fromAddress: 'db@demo.local',
    fromName: 'DB Mailer',
    ...overrides,
  };
}

describe('MailConfigResolver', () => {
  // Clave AES-256 valida (32 bytes) en base64 para encrypt/decrypt.
  const KEY = Buffer.alloc(32, 7).toString('base64');
  const ENV_KEYS = [
    'APP_WEB_URL',
    'SETTINGS_ENCRYPTION_KEY',
    'SMTP_HOST',
    'SMTP_PORT',
    'MAIL_FROM',
  ];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.SETTINGS_ENCRYPTION_KEY = KEY;
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

  describe('resolve', () => {
    it('fila de BD completa + APP_WEB_URL -> config de BD (fuente db)', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      const { resolver } = makeResolver(dbRow());
      const cfg = await resolver.resolve();
      expect(cfg?.host).toBe('smtp.db.local');
      expect(cfg?.port).toBe(465);
      expect(cfg?.user).toBe('dbuser');
      expect(cfg?.fromName).toBe('DB Mailer');
      expect(cfg?.appWebUrl).toBe('http://localhost:3000');
      // Sin ciphertext no se descifra nada.
      expect(cfg?.password).toBeUndefined();
    });

    it('descifra el password cuando hay ciphertext', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      const ciphertext = encryptSecret('super-secreto');
      const { resolver } = makeResolver(
        dbRow({ passwordCiphertext: ciphertext }),
      );
      const cfg = await resolver.resolve();
      expect(cfg?.password).toBe('super-secreto');
    });

    it('fila incompleta (host vacio) -> cae al entorno', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      process.env.SMTP_HOST = 'smtp.env.local';
      process.env.SMTP_PORT = '25';
      process.env.MAIL_FROM = 'env@demo.local';
      const { resolver } = makeResolver(dbRow({ host: '  ' }));
      const cfg = await resolver.resolve();
      expect(cfg?.host).toBe('smtp.env.local');
    });

    it('sin fila y sin entorno -> null', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      const { resolver } = makeResolver(null);
      expect(await resolver.resolve()).toBeNull();
    });

    it('fila completa pero sin APP_WEB_URL -> cae al entorno (y null si falta)', async () => {
      const { resolver } = makeResolver(dbRow());
      expect(await resolver.resolve()).toBeNull();
    });

    it('fila con puerto invalido -> cae al entorno', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      const { resolver } = makeResolver(dbRow({ port: 0 }));
      expect(await resolver.resolve()).toBeNull();
    });
  });

  describe('resolveSource', () => {
    it('fila completa + APP_WEB_URL -> db', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      const { resolver } = makeResolver(dbRow());
      expect(await resolver.resolveSource()).toBe('db');
    });

    it('sin fila pero con entorno -> env', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      process.env.SMTP_HOST = 'smtp.env.local';
      process.env.SMTP_PORT = '25';
      process.env.MAIL_FROM = 'env@demo.local';
      const { resolver } = makeResolver(null);
      expect(await resolver.resolveSource()).toBe('env');
    });

    it('ninguna fuente completa -> none', async () => {
      process.env.APP_WEB_URL = 'http://localhost:3000';
      const { resolver } = makeResolver(null);
      expect(await resolver.resolveSource()).toBe('none');
    });
  });
});
