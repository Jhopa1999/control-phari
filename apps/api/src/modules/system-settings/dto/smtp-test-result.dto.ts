import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';
/**
 * Resultado de la prueba de envio. `message` es un texto legible SIN
 * credenciales ni stack traces.
 */
export class SmtpTestResultDto {
  @ApiProperty({ type: Boolean, description: 'La prueba de envio tuvo exito.' })
  @IsBoolean()
  ok!: boolean;
  @ApiProperty({ type: String, description: 'Mensaje legible del resultado (sin secretos ni stack).' })
  @IsString()
  message!: string;
}
