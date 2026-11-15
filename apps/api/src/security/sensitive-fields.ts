/**
 * Campos que nunca deben salir en una respuesta HTTP: credenciales, hashes,
 * tokens de un solo uso y secretos cifrados. Lista unica; la usan el
 * interceptor global y las pruebas de contrato.
 *
 * - `passwordHash`: hash bcrypt de `User`.
 * - `tokenHash`: SHA-256 de los tokens de reset/activacion (`AuthToken`).
 * - `passwordCiphertext`: contrasena SMTP cifrada (`MailConfig`).
 * - `awsSecretAccessKeyCipher`: secreto AWS cifrado (`AiGlobalConfig`).
 * - `password`, `resetToken`: nombres que no existen en respuestas hoy; se
 *   vigilan para que un DTO futuro no los exponga.
 *
 * `accessToken` del login NO esta aqui: es la respuesta legitima de `/auth/login`.
 */
export const SENSITIVE_RESPONSE_KEYS: readonly string[] = [
  'passwordHash',
  'password',
  'tokenHash',
  'resetToken',
  'passwordCiphertext',
  'awsSecretAccessKeyCipher',
];

const SENSITIVE_SET = new Set<string>(SENSITIVE_RESPONSE_KEYS);
const MAX_DEPTH = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Devuelve una copia del valor sin claves sensibles y la lista de rutas
 * eliminadas. Solo recorre arreglos y objetos planos: Date, Buffer, streams y
 * demas instancias pasan intactos. Si no hay nada que quitar devuelve el mismo
 * valor (sin copiar).
 */
export function stripSensitive(value: unknown): {
  value: unknown;
  removed: string[];
} {
  const removed: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string, depth: number): unknown => {
    if (depth > MAX_DEPTH || node === null || typeof node !== 'object') {
      return node;
    }
    if (Array.isArray(node)) {
      if (seen.has(node)) return node;
      seen.add(node);
      let changed = false;
      const out = node.map((item, i) => {
        const next = walk(item, `${path}[${i}]`, depth + 1);
        if (next !== item) changed = true;
        return next;
      });
      return changed ? out : node;
    }
    if (!isPlainObject(node)) return node;
    if (seen.has(node)) return node;
    seen.add(node);
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      if (SENSITIVE_SET.has(key)) {
        removed.push(path ? `${path}.${key}` : key);
        changed = true;
        continue;
      }
      const next = walk(child, path ? `${path}.${key}` : key, depth + 1);
      if (next !== child) changed = true;
      out[key] = next;
    }
    return changed ? out : node;
  };

  return { value: walk(value, '', 0), removed };
}