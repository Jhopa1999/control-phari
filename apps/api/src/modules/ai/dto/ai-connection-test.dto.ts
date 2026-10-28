import { ApiProperty } from '@nestjs/swagger';

/**
 * Resultado de la prueba de conexion de un agente de IA. Mensaje legible SIN
 * secretos ni stack (mismo patron que SmtpTestResultDto): `ok` indica exito,
 * `message` explica el resultado para la UI.
 */
export class AiConnectionTestDto {
  @ApiProperty({ type: Boolean, description: 'La prueba de conexion fue exitosa.' })
  ok!: boolean;

  @ApiProperty({ type: String, description: 'Mensaje legible del resultado (sin secretos ni stack).' })
  message!: string;
}
