/**
 * Política de contraseñas (D20). Los valores vigentes viven en la BD y se
 * editan desde Maestras (regla 15); este archivo solo guarda los valores por
 * defecto seguros y las funciones puras.
 */

/** Código del parámetro de longitud mínima en la maestra AUTH_PARAM (valor en `label`). */
export const PASSWORD_MIN_LENGTH_PARAM = 'PASSWORD_MIN_LENGTH';
/** Maestra con la lista de contraseñas comunes (un ítem por contraseña). */
export const PASSWORD_COMMON_CATALOG = 'PASSWORD_COMMON';

/** Un administrador no puede bajar el mínimo de este piso. */
export const PASSWORD_MIN_LENGTH_FLOOR = 8;
/** Mínimo por defecto si el parámetro falta, está inactivo o es inválido. */
export const PASSWORD_MIN_LENGTH_DEFAULT = 10;
/** Tope razonable (el DTO admite hasta 255 caracteres). */
export const PASSWORD_MIN_LENGTH_CEILING = 64;

/**
 * Lista de respaldo y fuente de la siembra (migración y seed). Se usa si la
 * maestra PASSWORD_COMMON no tiene ítems activos o no se puede leer.
 */
export const DEFAULT_COMMON_PASSWORDS: readonly string[] = [
  '123456', '1234567', '12345678', '123456789', '1234567890',
  '111111', '11111111', '000000', '00000000', '123123',
  '12341234', '654321', '87654321', '123qwe', '1q2w3e4r',
  '1234qwer', 'abcd1234', 'abc12345', 'abc123', 'qwerty',
  'qwerty123', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbnm',
  'qazwsx', 'password', 'password1', 'password123', 'passw0rd',
  'p4ssw0rd', 'contrasena', 'contrasena1', 'contrasena123', 'clave',
  'clave123', 'secreto', 'changeme', 'cambiame', 'admin',
  'admin123', 'administrador', 'bienvenido', 'bienvenida', 'welcome',
  'welcome1', 'letmein', 'iloveyou', 'monkey', 'dragon',
  'football', 'futbol', 'usuario', 'temporal', 'temporal1',
  'test', 'test123', 'prueba', 'prueba2026', 'portal',
  'control', 'controlphari', 'phari', 'gibo', 'colombia',
  'medellin', 'bogota',
];

/**
 * Clave de comparación: minúsculas, sin tildes y solo `[a-z0-9]`. El `code` de
 * la maestra PASSWORD_COMMON es esta clave en mayúsculas.
 */
export function passwordKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Código de la maestra PASSWORD_COMMON para una contraseña común (`[A-Z0-9]`, máx. 40). */
export function passwordCommonCode(value: string): string {
  return passwordKey(value).toUpperCase().slice(0, 40);
}

/** Interpreta el mínimo guardado en `label`; fuera de rango usa el valor por defecto. */
export function parseMinLength(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return PASSWORD_MIN_LENGTH_DEFAULT;
  const value = Number(text);
  return value >= PASSWORD_MIN_LENGTH_FLOOR && value <= PASSWORD_MIN_LENGTH_CEILING
    ? value
    : PASSWORD_MIN_LENGTH_DEFAULT;
}

/**
 * Indica si la contraseña coincide con una común. Compara la clave completa y,
 * si la base sin dígitos finales tiene al menos 4 caracteres, también esa base
 * (así `Password2026*` cae por `password` y `Sol12345678` no cae por `sol`).
 */
export function isCommonPassword(password: string, commonKeys: ReadonlySet<string>): boolean {
  const key = passwordKey(password);
  if (commonKeys.has(key)) return true;
  const base = key.replace(/[0-9]+$/, '');
  return base.length >= 4 && commonKeys.has(base);
}
