import { ApiProperty } from '@nestjs/swagger';

/**
 * Persona visible por el actor para los selectores de Fase 5 (design §2.6,
 * endpoint `GET /coordination/people`). Solo datos no sensibles.
 */
export class CoordinationPersonDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la persona.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre de la persona.' })
  name!: string;

  @ApiProperty({ type: String, description: 'Identificador funcional (correo/usuario).' })
  identifier!: string;
}
