import { ApiProperty } from '@nestjs/swagger';

/** Respuesta de GET /auth/password-policy. */
export class PasswordPolicyResponseDto {
  @ApiProperty({
    type: Number,
    description:
      'Longitud mínima vigente de una contraseña nueva. La lista de contraseñas comunes no se expone.',
    example: 10,
  })
  minLength!: number;
}
