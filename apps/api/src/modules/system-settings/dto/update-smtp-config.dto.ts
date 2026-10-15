import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
/**
 * Entrada para crear/actualizar la configuracion SMTP (singleton). PATCH (no
 * PUT) por el CORS del backend. NO incluye `appWebUrl` (la gestiona el entorno,
 * design d.1). Cada @ApiProperty declara `type` explicito para que la reflexion
 * de Swagger no lo trate como referencia circular.
 *
 * Convencion del password (design e.2, deterministica):
 * - `password` AUSENTE (undefined) => conserva el ciphertext actual.
 * - `password` presente y NO vacio => cifra y reemplaza.
 * - `password` cadena vacia ('') => 400 (usar `clearPassword`).
 * - `clearPassword: true` => limpia el ciphertext (null).
 * - `password` no vacio JUNTO con `clearPassword: true` => 400.
 */
export class UpdateSmtpConfigDto {
  @ApiProperty({ type: String, description: 'Host del servidor SMTP.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host!: string;
  @ApiProperty({ type: Number, description: 'Puerto SMTP (1-65535).', minimum: 1, maximum: 65535 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true = SSL directo (465); false = STARTTLS (587). Default false.',
  })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;
  @ApiPropertyOptional({ type: String, description: 'Usuario SMTP (opcional; relays sin auth lo omiten).', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  username?: string;
  @ApiPropertyOptional({
    type: String,
    description:
      'Password SMTP (write-only). Ausente conserva el actual; valor no vacio lo reemplaza (cifrado); cadena vacia es invalida (usar clearPassword).',
  })
  @IsOptional()
  @IsString()
  password?: string;
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true limpia el password guardado. No combinar con un password no vacio.',
  })
  @IsOptional()
  @IsBoolean()
  clearPassword?: boolean;
  @ApiProperty({ type: String, description: 'Direccion remitente (MAIL_FROM).', maxLength: 320 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  fromAddress!: string;
  @ApiPropertyOptional({ type: String, description: 'Nombre visible del remitente (opcional).', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  fromName?: string;
}
