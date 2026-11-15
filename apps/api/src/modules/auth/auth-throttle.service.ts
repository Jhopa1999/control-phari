import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AttemptWindow } from './auth-attempt-window';
import { TooManyAttemptsException } from './too-many-attempts.exception';

/** Maestra con los parámetros del límite de intentos (se edita en Maestras). */
export const AUTH_PARAM_CATALOG = 'AUTH_PARAM';

/** Códigos de la maestra; el valor numérico va en `label`. */
export const AUTH_PARAM_CODES = {
  loginMaxAttempts: 'LOGIN_MAX_ATTEMPTS',
  loginWindowMinutes: 'LOGIN_WINDOW_MINUTES',
  loginMaxPerIp: 'LOGIN_MAX_PER_IP',
  forgotMaxAttempts: 'FORGOT_MAX_ATTEMPTS',
  forgotWindowMinutes: 'FORGOT_WINDOW_MINUTES',
} as const;

/** Valores por defecto (decisión D1) si el parámetro falta, está inactivo o es inválido. */
export const AUTH_THROTTLE_DEFAULTS = {
  loginMaxAttempts: 5,
  loginWindowMinutes: 15,
  loginMaxPerIp: 30,
  forgotMaxAttempts: 3,
  forgotWindowMinutes: 60,
} as const;

export type AuthThrottleSettings = {
  -readonly [K in keyof typeof AUTH_THROTTLE_DEFAULTS]: number;
};

/** Rangos aceptados: fuera de ellos se usa el valor por defecto. */
const MAX_COUNT = 10_000;
const MAX_WINDOW_MINUTES = 1_440;
/** Los parámetros se leen de la BD como máximo cada 30 s. */
const SETTINGS_TTL_MS = 30_000;
const MINUTE_MS = 60_000;

/** Normaliza el identificador para contar igual «Jefe@Demo.local» y «jefe@demo.local». */
export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function parseParam(raw: string | undefined, fallback: number, max: number): number {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const value = Number(text);
  return value >= 1 && value <= max ? value : fallback;
}

/**
 * Límite de intentos de login y de «olvidé mi contraseña» (decisión D1).
 * Conteo en memoria por proceso (ver AttemptWindow); los umbrales vienen de la
 * maestra AUTH_PARAM con un valor seguro por defecto en el código.
 */
@Injectable()
export class AuthThrottleService {
  private readonly window = new AttemptWindow();
  private cached: { at: number; value: AuthThrottleSettings } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Umbrales vigentes (maestra AUTH_PARAM, con caché breve y valores por defecto). */
  async settings(): Promise<AuthThrottleSettings> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < SETTINGS_TTL_MS) {
      return this.cached.value;
    }
    let rows: Array<{ code: string; label: string }> = [];
    try {
      rows = await this.prisma.catalogItem.findMany({
        where: {
          catalog: AUTH_PARAM_CATALOG,
          active: true,
          code: { in: Object.values(AUTH_PARAM_CODES) },
        },
        select: { code: true, label: true },
      });
    } catch {
      // Sin acceso a la maestra se aplican los valores por defecto (seguros).
    }
    const byCode = new Map(rows.map((row) => [row.code, row.label]));
    const d = AUTH_THROTTLE_DEFAULTS;
    const value: AuthThrottleSettings = {
      loginMaxAttempts: parseParam(byCode.get(AUTH_PARAM_CODES.loginMaxAttempts), d.loginMaxAttempts, MAX_COUNT),
      loginWindowMinutes: parseParam(byCode.get(AUTH_PARAM_CODES.loginWindowMinutes), d.loginWindowMinutes, MAX_WINDOW_MINUTES),
      loginMaxPerIp: parseParam(byCode.get(AUTH_PARAM_CODES.loginMaxPerIp), d.loginMaxPerIp, MAX_COUNT),
      forgotMaxAttempts: parseParam(byCode.get(AUTH_PARAM_CODES.forgotMaxAttempts), d.forgotMaxAttempts, MAX_COUNT),
      forgotWindowMinutes: parseParam(byCode.get(AUTH_PARAM_CODES.forgotWindowMinutes), d.forgotWindowMinutes, MAX_WINDOW_MINUTES),
    };
    this.cached = { at: now, value };
    return value;
  }

  private loginKey(identifier: string): string {
    return `login:id:${normalizeIdentifier(identifier)}`;
  }

  private ipKey(ip: string): string {
    return `login:ip:${ip}`;
  }

  /** Lanza 429 si el identificador o la IP ya superaron el límite de fallos. */
  async assertLoginAllowed(identifier: string, ip: string | undefined): Promise<void> {
    const s = await this.settings();
    const now = Date.now();
    const windowMs = s.loginWindowMinutes * MINUTE_MS;
    const byId = this.window.retryAfterMs(this.loginKey(identifier), s.loginMaxAttempts, windowMs, now);
    const byIp = ip ? this.window.retryAfterMs(this.ipKey(ip), s.loginMaxPerIp, windowMs, now) : 0;
    const waitMs = Math.max(byId, byIp);
    if (waitMs > 0) {
      throw new TooManyAttemptsException(Math.max(1, Math.ceil(waitMs / 1000)));
    }
  }

  /** Cuenta un fallo de login. `blocked` indica si con él se alcanzó el límite. */
  async recordLoginFailure(identifier: string, ip: string | undefined): Promise<{ blocked: boolean }> {
    const s = await this.settings();
    const now = Date.now();
    const windowMs = s.loginWindowMinutes * MINUTE_MS;
    this.window.record(this.loginKey(identifier), now);
    if (ip) this.window.record(this.ipKey(ip), now);
    const idCount = this.window.count(this.loginKey(identifier), windowMs, now);
    const ipCount = ip ? this.window.count(this.ipKey(ip), windowMs, now) : 0;
    return { blocked: idCount >= s.loginMaxAttempts || ipCount >= s.loginMaxPerIp };
  }

  /** Un login correcto borra los fallos del identificador (no los de la IP). */
  clearLoginFailures(identifier: string): void {
    this.window.clear(this.loginKey(identifier));
  }

  /**
   * Cuenta una solicitud de «olvidé mi contraseña». Solo cuentan las
   * permitidas: quien insiste no alarga el bloqueo de la víctima.
   * `firstExcess` es true una vez por ventana, para auditar sin inundar.
   */
  async registerForgotRequest(
    identifier: string,
  ): Promise<{ allowed: boolean; firstExcess: boolean }> {
    const s = await this.settings();
    const now = Date.now();
    const windowMs = s.forgotWindowMinutes * MINUTE_MS;
    const key = `forgot:${normalizeIdentifier(identifier)}`;
    if (this.window.count(key, windowMs, now) < s.forgotMaxAttempts) {
      this.window.record(key, now);
      return { allowed: true, firstExcess: false };
    }
    const auditKey = `forgot-excess:${normalizeIdentifier(identifier)}`;
    const firstExcess = this.window.count(auditKey, windowMs, now) === 0;
    if (firstExcess) this.window.record(auditKey, now);
    return { allowed: false, firstExcess };
  }
}
