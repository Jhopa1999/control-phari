import { createHash, randomBytes } from 'node:crypto';

/**
 * Numero de bytes aleatorios del token en claro. 32 bytes (256 bits) es alta
 * entropia: inviable de adivinar por fuerza bruta. El token resultante en
 * base64url es seguro para incluir en una URL (reset/invitacion).
 */
export const TOKEN_BYTES = 32;

/**
 * Genera un token en claro de alta entropia (crypto.randomBytes de
 * TOKEN_BYTES). Se devuelve en base64url para transportarlo en una URL sin
 * escaping. Este valor viaja SOLO en el correo: nunca se persiste en claro.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Calcula el SHA-256 (hex) de un token. Es lo UNICO que se guarda en BD. Al ser
 * el token aleatorio y de alta entropia, un hash rapido como sha256 basta para
 * no almacenar el valor en claro y permitir el lookup por hash; no se usa bcrypt
 * (bcrypt protege contrasenas humanas de baja entropia frente a fuerza bruta,
 * escenario que aqui no aplica).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Un segundo expresado en milisegundos. */
const SECOND_MS = 1000;
/** Multiplicadores por unidad de tiempo soportada en el formato de TTL. */
const UNIT_MS: Readonly<Record<string, number>> = {
  s: SECOND_MS,
  m: 60 * SECOND_MS,
  h: 60 * 60 * SECOND_MS,
  d: 24 * 60 * 60 * SECOND_MS,
};

/**
 * Convierte un valor de configuracion de TTL a milisegundos. Acepta un formato
 * simple `<numero><unidad>` donde la unidad es s/m/h/d (p. ej. '1h', '72h',
 * '30m') o un numero puro interpretado como milisegundos. Si el valor es
 * indefinido, vacio o no tiene un formato valido, se usa `defaultMs` (evita que
 * una configuracion mal escrita produzca un TTL cero o NaN).
 */
export function parseTtlMs(
  envValue: string | undefined,
  defaultMs: number,
): number {
  const raw = envValue?.trim();
  if (!raw) {
    return defaultMs;
  }

  const match = /^(\d+)([smhd])?$/.exec(raw);
  if (!match) {
    return defaultMs;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return defaultMs;
  }

  const unit = match[2];
  const multiplier = unit ? UNIT_MS[unit] : 1;
  return amount * multiplier;
}
