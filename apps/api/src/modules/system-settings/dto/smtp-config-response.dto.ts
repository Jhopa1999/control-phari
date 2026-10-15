import { ApiProperty } from '@nestjs/swagger';
import type { MailConfigSource } from '../../mail/mail-config.resolver';
/**
 * Estado de la configuracion SMTP para el ADMIN. NUNCA incluye el password ni
 * el ciphertext (design e.1): solo `passwordSet` indica si hay uno guardado.
 * `source` indica de donde saldria el envio AHORA (db/env/none).
 *
 * Las propiedades nullable declaran `type` explicito en @ApiProperty: con una
 * union `T | null` Swagger no puede inferir el tipo por reflexion (lo trataria
 * como una referencia circular), por eso se nombra el tipo primitivo.
 */
export class SmtpConfigResponseDto {
  @ApiProperty({ type: String, nullable: true, description: 'Host SMTP guardado (null si no hay fila).' })
  host!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Puerto SMTP guardado.' })
  port!: number | null;
  @ApiProperty({ type: Boolean, description: 'SSL directo (465) vs STARTTLS.' })
  secure!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Usuario SMTP guardado (opcional).' })
  username!: string | null;
  @ApiProperty({ type: Boolean, description: 'Hay un password guardado (nunca se devuelve el valor).' })
  passwordSet!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Direccion remitente guardada.' })
  fromAddress!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Nombre visible del remitente.' })
  fromName!: string | null;
  @ApiProperty({
    type: String,
    enum: ['db', 'env', 'none'],
    description:
      "Fuente efectiva del envio: 'db' (fila completa), 'env' (cae al entorno), 'none' (correo deshabilitado).",
  })
  source!: MailConfigSource;
  @ApiProperty({ type: String, nullable: true, description: 'Ultima actualizacion (ISO) o null.' })
  updatedAt!: string | null;
}
