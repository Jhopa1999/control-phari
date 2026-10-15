import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
/**
 * Cifrado simetrico de secretos de configuracion (hoy: el password SMTP) con
 * AES-256-GCM del modulo `crypto` NATIVO (sin dependencias nuevas).
 *
 * - La clave sale de la variable de entorno `SETTINGS_ENCRYPTION_KEY`, en
 *   formato base64 que decodifica a EXACTAMENTE 32 bytes (clave AES-256). Se
 *   lee de forma PEREZOSA: solo al cifrar o descifrar, NUNCA en el arranque ni
 *   en el constructor de ningun provider. Asi el API arranca aunque la variable
 *   no este definida; solo falla la operacion concreta que necesita el secreto.
 * - Si la variable falta o no decodifica a 32 bytes, se lanza un Error que
 *   NOMBRA la variable pero NUNCA imprime su valor (mismo patron que
 *   mail.config.ts / resolveJwtSecret).
 * - Formato de salida: `iv.tag.ciphertext`, cada parte en base64, separador
 *   `.`. iv de 12 bytes (recomendado para GCM), authTag de 16 bytes.
 * - Nunca se loguea la clave, el iv, el tag ni el texto plano.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const ENV_VAR = 'SETTINGS_ENCRYPTION_KEY';
/**
 * Resuelve la clave de 32 bytes desde el entorno. Perezosa: solo se invoca en
 * encrypt/decrypt. Lanza un Error claro (sin exponer el valor) si falta o no
 * tiene la longitud exacta.
 */
function loadKey(): Buffer {
  const raw = process.env[ENV_VAR];
  if (!raw || raw.trim() === '') {
    throw new Error(
      `Settings encryption misconfigured: la variable de entorno ${ENV_VAR} no esta definida.`,
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new Error(
      `Settings encryption misconfigured: la variable de entorno ${ENV_VAR} no es base64 valido.`,
    );
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Settings encryption misconfigured: la variable de entorno ${ENV_VAR} debe decodificar a ${KEY_LENGTH} bytes (AES-256) en base64.`,
    );
  }
  return key;
}
/**
 * Cifra `plaintext` y devuelve `iv.tag.ciphertext` (cada parte en base64). El
 * iv es aleatorio por llamada, de modo que el mismo texto produce cifrados
 * distintos.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}
/**
 * Descifra un valor en formato `iv.tag.ciphertext`. Si el formato es invalido,
 * o el authTag no verifica (dato manipulado o clave distinta), lanza un Error
 * CONTROLADO SIN filtrar detalle del contenido; el servicio lo traduce a un
 * 500 generico sin exponer secretos.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 3) {
    throw new Error('Settings decryption failed: formato de cifrado invalido.');
  }
  const key = loadKey();
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Settings decryption failed: formato de cifrado invalido.');
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    // No se propaga el detalle del fallo criptografico (evita filtrar pistas
    // sobre la clave o el contenido).
    throw new Error('Settings decryption failed: no se pudo descifrar el valor.');
  }
}
