import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
/**
 * Resultado de la prueba de envio. `message` es un texto legible SIN
 * credenciales ni stack traces. `hint` y `code` son opcionales y aditivos.
 */
export class SmtpTestResultDto {
  @ApiProperty({ type: Boolean, description: 'La prueba de envio tuvo exito.' })
  @IsBoolean()
  ok!: boolean;
  @ApiProperty({ type: String, description: 'Mensaje legible del resultado (sin secretos ni stack).' })
  @IsString()
  message!: string;
  @ApiPropertyOptional({
    type: String,
    description: 'Sugerencia accionable para resolver el fallo (sin secretos ni stack).',
  })
  @IsOptional()
  @IsString()
  hint?: string;
  @ApiPropertyOptional({
    type: String,
    description: 'Codigo SMTP de 3 digitos asociado al fallo, si lo hubo.',
  })
  @IsOptional()
  @IsString()
  code?: string;
}
