import { ApiProperty } from '@nestjs/swagger';

/**
 * Persona visible por el actor para los selectores de SCR-17 (design §2.6.2).
 * Solo datos no sensibles.
 */
export class CapacityPersonDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la persona.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre de la persona.' })
  name!: string;

  @ApiProperty({ type: String, description: 'Identificador funcional (correo/usuario).' })
  identifier!: string;
}
