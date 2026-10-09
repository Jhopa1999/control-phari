import * as bcrypt from 'bcrypt';

/**
 * Coste de trabajo de bcrypt (numero de rondas). Es un parametro de seguridad,
 * no configuracion por ambiente: fija el esfuerzo de hashing. 10 es el balance
 * habitual coste/seguridad para una app de este perfil.
 */
export const BCRYPT_COST = 10;

/** Hashea una contrasena en claro con bcrypt (coste BCRYPT_COST). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** Verifica una contrasena en claro contra su hash bcrypt. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
