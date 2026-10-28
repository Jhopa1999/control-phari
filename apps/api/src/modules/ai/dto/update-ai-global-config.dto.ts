import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Modos de credenciales de IA: rol IAM de la instancia o claves de acceso. */
export const AI_CREDENTIAL_MODES = ['iam-role', 'access-keys'] as const;
export type AiCredentialMode = (typeof AI_CREDENTIAL_MODES)[number];

/**
 * Entrada para actualizar la configuracion GLOBAL de IA (singleton). PATCH (no
 * PUT). El secret (`awsSecretAccessKey`) es WRITE-ONLY y sigue el MISMO contrato
 * determinista que el password SMTP (UpdateSmtpConfigDto):
 * - `awsSecretAccessKey` AUSENTE => conserva el ciphertext actual.
 * - presente y NO vacio => cifra y reemplaza.
 * - cadena vacia ('') => 400 (usar `clearCredentials`).
 * - `clearCredentials: true` => limpia el ciphertext (null).
 * - secret no vacio JUNTO con `clearCredentials: true` => 400.
 */
export class UpdateAiGlobalConfigDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Enciende/apaga globalmente la IA. Por defecto arranca apagada.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    enum: AI_CREDENTIAL_MODES,
    description:
      "Modo de credenciales: 'iam-role' (rol de la instancia) o 'access-keys' (claves guardadas).",
  })
  @IsOptional()
  @Transform(trim)
  @IsIn(AI_CREDENTIAL_MODES)
  credentialMode?: AiCredentialMode;

  @ApiPropertyOptional({
    type: String,
    description: 'AWS Access Key ID (solo modo access-keys).',
    maxLength: 128,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  awsAccessKeyId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'AWS Secret Access Key (write-only). Ausente conserva; no vacio cifra y reemplaza; cadena vacia es invalida (usar clearCredentials).',
  })
  @IsOptional()
  @IsString()
  awsSecretAccessKey?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true limpia las credenciales guardadas (access key id y secret). No combinar con un secret no vacio.',
  })
  @IsOptional()
  @IsBoolean()
  clearCredentials?: boolean;
}
