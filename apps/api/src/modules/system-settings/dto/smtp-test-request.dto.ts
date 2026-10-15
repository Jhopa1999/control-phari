import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
/** Cuerpo de la prueba de envio: direccion destino del correo de prueba. */
export class SmtpTestRequestDto {
  @ApiProperty({ type: String, description: 'Direccion destino del correo de prueba.' })
  @Transform(trim)
  @IsEmail()
  to!: string;
}
