import { ApiProperty } from '@nestjs/swagger';
/**
 * Usuario visto por el ADMIN para gestionar el rol de sistema (design e.4).
 * Expone `isAdmin` (que el UserResponseDto del modulo user NO expone) para que
 * el bloque "Administradores del sistema" muestre y togglee el estado.
 */
export class AdminUserResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;
  @ApiProperty({ type: String, description: 'Identificador funcional.' })
  identifier!: string;
  @ApiProperty({ type: String, description: 'Nombre visible.' })
  name!: string;
  @ApiProperty({ type: Boolean, description: 'Estado activo.' })
  active!: boolean;
  @ApiProperty({ type: Boolean, description: 'Es ADMIN de sistema.' })
  isAdmin!: boolean;
}
