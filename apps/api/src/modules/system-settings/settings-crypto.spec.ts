import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from './settings-crypto';
/**
 * Pruebas del cifrado AES-256-GCM de secretos (design c): round-trip, deteccion
 * de manipulacion (authTag), y manejo de la clave `SETTINGS_ENCRYPTION_KEY`
 * (ausente / mal formada) con error que NOMBRA la variable sin su valor. Ningun
 * aserto imprime la clave ni el texto plano.
 */
const ENV_VAR = 'SETTINGS_ENCRYPTION_KEY';
const VALID_KEY = randomBytes(32).toString('base64');
describe('settings-crypto', () => {
  const original = process.env[ENV_VAR];
  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = original;
    }
  });
  it('round-trip: decrypt(encrypt(x)) === x', () => {
    process.env[ENV_VAR] = VALID_KEY;
    const plaintext = 'super-secret-smtp-pass';
    const stored = encryptSecret(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });
  it('formato iv.tag.ciphertext (3 partes base64) y no contiene el texto plano', () => {
    process.env[ENV_VAR] = VALID_KEY;
    const plaintext = 'otra-clave-123';
    const stored = encryptSecret(plaintext);
    expect(stored.split('.')).toHaveLength(3);
    expect(stored).not.toContain(plaintext);
  });
  it('cada cifrado usa un iv aleatorio (dos encrypt del mismo texto difieren)', () => {
    process.env[ENV_VAR] = VALID_KEY;
    const a = encryptSecret('igual');
    const b = encryptSecret('igual');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('igual');
    expect(decryptSecret(b)).toBe('igual');
  });
  it('authTag/ciphertext manipulado => decrypt lanza error controlado', () => {
    process.env[ENV_VAR] = VALID_KEY;
    const stored = encryptSecret('dato');
    const [iv, tag, ct] = stored.split('.');
    // Alterar el ciphertext invalida la verificacion del authTag.
    const tampered = [iv, tag, Buffer.from('xxxx').toString('base64')].join('.');
    expect(() => decryptSecret(tampered)).toThrow(/decryption failed/i);
  });
  it('formato invalido (no 3 partes) => decrypt lanza error controlado', () => {
    process.env[ENV_VAR] = VALID_KEY;
    expect(() => decryptSecret('solo-una-parte')).toThrow(/invalido/i);
  });
  it('SETTINGS_ENCRYPTION_KEY ausente => encrypt lanza nombrando la variable', () => {
    delete process.env[ENV_VAR];
    let message = '';
    try {
      encryptSecret('x');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(ENV_VAR);
    // No debe filtrar valores de clave; solo el nombre de la variable.
    expect(message).not.toContain(VALID_KEY);
  });
  it('clave mal formada (no 32 bytes) => lanza nombrando la variable', () => {
    process.env[ENV_VAR] = Buffer.from('corta').toString('base64');
    let message = '';
    try {
      encryptSecret('x');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(ENV_VAR);
    expect(message).toMatch(/32 bytes/);
  });
});
