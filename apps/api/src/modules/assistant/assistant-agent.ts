import { ConflictException } from '@nestjs/common';
import { decryptSecret } from '../ai/ai-crypto';

/** Credenciales de AWS para Bedrock (modo access-keys); ausentes => rol IAM. */
export interface AgentCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/** Parte de la configuración global de IA que decide cómo autenticarse. */
export interface GlobalCredentialConfig {
  credentialMode?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKeyCipher?: string | null;
}

/**
 * Credenciales con las que el asistente invoca Bedrock según la configuración
 * global: undefined en modo rol IAM; en modo access-keys, las claves guardadas
 * (el secret se descifra aquí). 409 si están incompletas o no se pueden leer.
 */
export function resolveAgentCredentials(
  globalRow: GlobalCredentialConfig,
): AgentCredentials | undefined {
  if ((globalRow.credentialMode ?? 'iam-role') !== 'access-keys') return undefined;
  const accessKeyId = globalRow.awsAccessKeyId ?? '';
  const cipher = globalRow.awsSecretAccessKeyCipher ?? '';
  if (accessKeyId.trim() === '' || cipher.trim() === '') {
    throw new ConflictException('IA mal configurada');
  }
  try {
    return { accessKeyId, secretAccessKey: decryptSecret(cipher) };
  } catch {
    throw new ConflictException('IA mal configurada');
  }
}
