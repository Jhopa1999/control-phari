import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import {
  DEFAULT_COMMON_PASSWORDS,
  PASSWORD_MIN_LENGTH_DEFAULT,
  isCommonPassword,
  parseMinLength,
  passwordCommonCode,
  passwordKey,
} from './password-policy';
import { PasswordPolicyService } from './password-policy.service';

function setup(options: { min?: string | null; common?: string[]; fail?: boolean } = {}) {
  const catalogItem = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  if (options.fail) {
    catalogItem.findFirst.mockRejectedValue(new Error('sin BD'));
    catalogItem.findMany.mockRejectedValue(new Error('sin BD'));
  } else {
    catalogItem.findFirst.mockResolvedValue(
      options.min == null ? null : { label: options.min },
    );
    catalogItem.findMany.mockResolvedValue((options.common ?? []).map((code) => ({ code })));
  }
  const service = new PasswordPolicyService({ catalogItem } as unknown as PrismaService);
  return { service, catalogItem };
}

describe('PasswordPolicyService', () => {
  it('sin parámetros usa el mínimo 10 y la lista por defecto', async () => {
    const { service } = setup();
    await expect(service.minLength()).resolves.toBe(10);
    await expect(service.assertAcceptable('Password2026*')).rejects.toThrow('muy común');
    await expect(service.assertAcceptable('Sol12345678')).resolves.toBeUndefined();
  });

  it('si la lectura falla cae a los valores por defecto', async () => {
    const { service } = setup({ fail: true });
    await expect(service.minLength()).resolves.toBe(PASSWORD_MIN_LENGTH_DEFAULT);
    await expect(service.assertAcceptable('contrasena123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una contraseña más corta que el mínimo con el número vigente', async () => {
    const { service } = setup({ min: '12' });
    await expect(service.assertAcceptable('once-chars!')).rejects.toThrow(
      'La contraseña debe tener al menos 12 caracteres.',
    );
    await expect(service.assertAcceptable('doce-chars-ok')).resolves.toBeUndefined();
  });

  it.each(['7', '65', 'abc', '', '9.5'])('mínimo inválido (%s) usa 10', (raw) => {
    expect(parseMinLength(raw)).toBe(10);
  });

  it('el piso de 8 no se puede bajar y 8 es válido', () => {
    expect(parseMinLength('8')).toBe(8);
    expect(parseMinLength('64')).toBe(64);
  });

  it('usa la lista de la maestra cuando hay ítems activos y normaliza guiones bajos', async () => {
    const { service } = setup({ common: ['MI_CLAVE_X'] });
    await expect(service.assertAcceptable('Mi-Clave-X-2026')).rejects.toThrow('muy común');
    // La lista por defecto ya no aplica: la maestra manda.
    await expect(service.assertAcceptable('password-seguro-1')).resolves.toBeUndefined();
  });

  it('cuenta caracteres, no bytes', async () => {
    const { service } = setup();
    await expect(service.assertAcceptable('ñññññññññ')).rejects.toThrow('al menos 10');
    await expect(service.assertAcceptable('ñandú-ñandú-1')).resolves.toBeUndefined();
  });

  it('cachea la política 30 s', async () => {
    const { service, catalogItem } = setup();
    await service.settings();
    await service.settings();
    expect(catalogItem.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('funciones de la política', () => {
  const keys = new Set(DEFAULT_COMMON_PASSWORDS.map(passwordKey));

  it('detecta variantes con símbolos y dígitos finales', () => {
    expect(isCommonPassword('Password2026*', keys)).toBe(true);
    expect(isCommonPassword('password123', keys)).toBe(true);
    expect(isCommonPassword('Contraseña-1', keys)).toBe(true);
  });

  it('no bloquea bases cortas ni contraseñas largas distintas', () => {
    expect(isCommonPassword('Sol12345678', keys)).toBe(false);
    expect(isCommonPassword('primera-contrasena-e2e', keys)).toBe(false);
  });

  it('la lista por defecto no tiene códigos repetidos ni vacíos y cabe en `code`', () => {
    const codes = DEFAULT_COMMON_PASSWORDS.map(passwordCommonCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{1,40}$/);
  });
});

describe('sincronía migración, seed y código', () => {
  it('la migración siembra el mínimo y todos los códigos de DEFAULT_COMMON_PASSWORDS', () => {
    const dir = join(__dirname, '../../../prisma/migrations');
    const name = readdirSync(dir).find((d) => d.endsWith('_password_policy_params'));
    expect(name).toBeDefined();
    const sql = readFileSync(join(dir, name as string, 'migration.sql'), 'utf8');
    expect(sql).toContain("'AUTH_PARAM', 'PASSWORD_MIN_LENGTH', '10'");
    expect(sql).toContain('ON CONFLICT ("catalog", "code") DO NOTHING');
    const codes = [...sql.matchAll(/'PASSWORD_COMMON', '([A-Z0-9]+)'/g)].map((m) => m[1]);
    expect(codes.sort()).toEqual(DEFAULT_COMMON_PASSWORDS.map(passwordCommonCode).sort());
  });
});

describe('alta de usuario', () => {
  it('CreateUserDto no recibe contraseña: si la gana, hay que conectar la política', () => {
    const dto = new CreateUserDto();
    expect(validateSync(dto).length).toBeGreaterThan(0);
    const props = Object.getOwnPropertyNames(dto);
    expect(props.filter((p) => /password/i.test(p))).toEqual([]);
    const source = readFileSync(join(__dirname, '../user/dto/create-user.dto.ts'), 'utf8');
    expect(source).not.toMatch(/\b(password|newPassword)\b\s*[!?]?:/);
  });
});