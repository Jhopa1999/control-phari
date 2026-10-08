import { ApiProperty } from '@nestjs/swagger';

/**
 * Respuesta minima de GET /dev/actors (design 3.4). Solo lo necesario para
 * poblar el selector de usuario de desarrollo; sin datos sensibles.
 */
export class DevActorResponseDto {
  @ApiProperty({ type: String, description: 'Identificador funcional del usuario.', example: 'jefe@demo.local' })
  identifier!: string;

  @ApiProperty({ type: String, description: 'Nombre visible del usuario.', example: 'Ana Jefa' })
  name!: string;
}
