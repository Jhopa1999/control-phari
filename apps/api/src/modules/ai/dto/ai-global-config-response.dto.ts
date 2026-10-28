import { ApiProperty } from '@nestjs/swagger';
import { AI_CREDENTIAL_MODES, type AiCredentialMode } from './update-ai-global-config.dto';

/**
 * Estado de la configuracion GLOBAL de IA para el ADMIN. NUNCA incluye el secret
 * ni el ciphertext: solo `secretSet` (hay uno guardado) y `accessKeyIdLast4`
 * (ultimos 4 del access key id, para reconocerlo sin exponerlo). Las propiedades
 * nullable declaran `type` explicito en @ApiProperty (Swagger no infiere uniones
 * `T | null`), como en SmtpConfigResponseDto.
 */
export class AiGlobalConfigResponseDto {
  @ApiProperty({ type: Boolean, description: 'IA encendida globalmente.' })
  enabled!: boolean;

  @ApiProperty({
    type: String,
    enum: AI_CREDENTIAL_MODES,
    description: 'Modo de credenciales efectivo.',
  })
  credentialMode!: AiCredentialMode;

  @ApiProperty({
    type: Boolean,
    description: 'Hay un secret de AWS guardado (nunca se devuelve el valor).',
  })
  secretSet!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ultimos 4 caracteres del AWS Access Key ID guardado, o null.',
  })
  accessKeyIdLast4!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Ultima actualizacion (ISO) o null.' })
  updatedAt!: string | null;
}
