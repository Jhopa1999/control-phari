import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AUTH_PARAM_CATALOG } from './auth-throttle.service';
import {
  DEFAULT_COMMON_PASSWORDS,
  PASSWORD_COMMON_CATALOG,
  PASSWORD_MIN_LENGTH_DEFAULT,
  PASSWORD_MIN_LENGTH_PARAM,
  isCommonPassword,
  parseMinLength,
  passwordKey,
} from './password-policy';

/** La política se lee de la BD como máximo cada 30 s (igual que AuthThrottleService). */
const SETTINGS_TTL_MS = 30_000;

export const PASSWORD_COMMON_MESSAGE =
  'Esa contraseña es muy común y fácil de adivinar. Elige otra.';

export function passwordTooShortMessage(minLength: number): string {
  return `La contraseña debe tener al menos ${minLength} caracteres.`;
}

export type PasswordPolicySettings = {
  minLength: number;
  commonKeys: ReadonlySet<string>;
};

/**
 * Política de contraseñas (D20): longitud mínima y bloqueo de contraseñas
 * comunes. Ambas se editan en Maestras (AUTH_PARAM y PASSWORD_COMMON); si la
 * lectura falla o falta el dato se usa el valor por defecto seguro del código.
 * Solo se evalúa al fijar una contraseña: el login no la consulta.
 */
@Injectable()
export class PasswordPolicyService {
  private cached: { at: number; value: PasswordPolicySettings } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Política vigente (con caché breve y valores por defecto). */
  async settings(): Promise<PasswordPolicySettings> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < SETTINGS_TTL_MS) {
      return this.cached.value;
    }
    let minLabel: string | undefined;
    let commonCodes: string[] = [];
    try {
      const [param, common] = await Promise.all([
        this.prisma.catalogItem.findFirst({
          where: { catalog: AUTH_PARAM_CATALOG, code: PASSWORD_MIN_LENGTH_PARAM, active: true },
          select: { label: true },
        }),
        this.prisma.catalogItem.findMany({
          where: { catalog: PASSWORD_COMMON_CATALOG, active: true },
          select: { code: true },
        }),
      ]);
      minLabel = param?.label;
      commonCodes = (common ?? []).map((row) => row.code);
    } catch {
      // Sin acceso a las maestras se aplican los valores por defecto (seguros).
    }
    const fromDb = commonCodes.map((code) => passwordKey(code)).filter((key) => key.length > 0);
    const keys = fromDb.length > 0 ? fromDb : DEFAULT_COMMON_PASSWORDS.map((word) => passwordKey(word));
    const value: PasswordPolicySettings = {
      minLength: minLabel === undefined ? PASSWORD_MIN_LENGTH_DEFAULT : parseMinLength(minLabel),
      commonKeys: new Set(keys),
    };
    this.cached = { at: now, value };
    return value;
  }

  /** Longitud mínima vigente. */
  async minLength(): Promise<number> {
    return (await this.settings()).minLength;
  }

  /** Lanza 400 si la contraseña es más corta que el mínimo o es una contraseña común. */
  async assertAcceptable(newPassword: string): Promise<void> {
    const { minLength, commonKeys } = await this.settings();
    if (Array.from(newPassword).length < minLength) {
      throw new BadRequestException(passwordTooShortMessage(minLength));
    }
    if (isCommonPassword(newPassword, commonKeys)) {
      throw new BadRequestException(PASSWORD_COMMON_MESSAGE);
    }
  }
}
