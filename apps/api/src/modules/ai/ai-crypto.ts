/**
 * Cripto de secretos de IA (IA Fase 1, FEAT-001). NO se crea un mecanismo nuevo:
 * se REEXPORTA el cifrado AES-256-GCM de system-settings (un unico mecanismo de
 * cifrado de secretos de configuracion en todo el backend, con la misma
 * variable de entorno SETTINGS_ENCRYPTION_KEY, lectura perezosa y formato
 * iv.tag.ciphertext).
 */
export { encryptSecret, decryptSecret } from '../system-settings/settings-crypto';
